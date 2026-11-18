import * as Cesium from "cesium";

import type { TerrainHeightMesh } from "./types";

import { HEIGHTMAP_FRAGMENT_SHADER, HEIGHTMAP_VERTEX_SHADER } from "./shaders";

/**
 * Cesium `Context` 中高度图栅格化用到的子集。
 */
interface RendererContext {
  /** 是否支持浮点颜色缓冲。 */
  colorBufferFloat: boolean;
  /** 是否支持深度纹理。 */
  depthTexture: boolean;
  /** 结束 Cesium 上下文的当前绘制批次，复位帧缓冲和纹理绑定。 */
  endFrame?: () => void;
  /**
   * 从帧缓冲读回像素。
   *
   * @param readState 读回区域；可指定 framebuffer
   * @returns RGBA 交错的像素缓冲
   */
  readPixels(readState: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    framebuffer?: Cesium.Framebuffer;
  }): ArrayBufferView;
}

/**
 * 栅格化产物。颜色纹理挂在 framebuffer 上，销毁 framebuffer 时一并释放。
 */
export interface RasterizedHeightMap {
  /** 用于 `readPixels` 的渲染上下文。 */
  context: RendererContext;
  /** RGBA32F 高度纹理，同时作为 framebuffer 的颜色附件。 */
  texture: Cesium.Texture;
  /** 持有颜色纹理和深度纹理的帧缓冲。 */
  framebuffer: Cesium.Framebuffer;
  /** 纹理宽度（像素）。 */
  width: number;
  /** 纹理高度（像素）。 */
  height: number;
}

/**
 * 把多块 NDC Mesh 画进同一张浮点纹理。
 *
 * 只清空一次颜色和深度附件，随后逐瓦片执行绘制命令。各瓦片共享同一深度缓冲，
 * 以便在重叠区域保留更高的地形。连续绘制达到时间预算时暂时让出主线程。
 *
 * @param context 必须支持浮点颜色缓冲和深度纹理
 * @param meshes 已映射到高度图 NDC 的地形三角网
 * @param width 输出纹理宽度（像素）
 * @param height 输出纹理高度（像素）
 * @param minHeight 深度编码用的最低高程（米）
 * @param maxHeight 深度编码用的最高高程（米）
 * @returns 帧缓冲与高度纹理。调用方负责销毁帧缓冲及其附件
 * @throws WebGL 上下文不支持浮点颜色缓冲或深度纹理时抛出
 */
export async function rasterizeWebGlTerrainHeightMap(
  context: RendererContext,
  meshes: readonly TerrainHeightMesh[],
  width: number,
  height: number,
  minHeight: number,
  maxHeight: number
): Promise<RasterizedHeightMap> {
  if (!context.colorBufferFloat) {
    throw new Error("[createTerrainHeightMap] This WebGL context cannot render to a floating-point color buffer.");
  }
  if (!context.depthTexture) {
    throw new Error("[createTerrainHeightMap] This WebGL context does not support depth textures.");
  }

  let shaderProgram: Cesium.ShaderProgram | undefined;
  let framebuffer: Cesium.Framebuffer | undefined;
  let texture: Cesium.Texture | undefined;
  let depthTexture: Cesium.Texture | undefined;

  try {
    texture = new Cesium.Texture({
      context,
      width,
      height,
      pixelFormat: Cesium.PixelFormat.RGBA,
      pixelDatatype: Cesium.PixelDatatype.FLOAT,
      sampler: new Cesium.Sampler({
        minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
        magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
        wrapS: Cesium.TextureWrap.CLAMP_TO_EDGE,
        wrapT: Cesium.TextureWrap.CLAMP_TO_EDGE
      })
    });
    depthTexture = new Cesium.Texture({
      context,
      width,
      height,
      pixelFormat: Cesium.PixelFormat.DEPTH_COMPONENT,
      pixelDatatype: Cesium.PixelDatatype.UNSIGNED_INT
    });
    framebuffer = new Cesium.Framebuffer({
      context,
      colorTextures: [texture],
      depthTexture
    });
    shaderProgram = Cesium.ShaderProgram.fromCache({
      context,
      vertexShaderSource: new Cesium.ShaderSource({ sources: [HEIGHTMAP_VERTEX_SHADER] }),
      fragmentShaderSource: new Cesium.ShaderSource({ sources: [HEIGHTMAP_FRAGMENT_SHADER] }),
      attributeLocations: { position: 0 }
    });

    const viewport = new Cesium.BoundingRectangle(0, 0, width, height);
    const renderState = Cesium.RenderState.fromCache({
      viewport,
      depthTest: {
        enabled: true,
        func: Cesium.WebGLConstants.LESS
      },
      depthMask: true,
      cull: { enabled: false }
    });
    const passState = { context, viewport, framebuffer };

    new Cesium.ClearCommand({
      color: new Cesium.Color(0, 0, 0, 0),
      depth: 1,
      framebuffer,
      pass: Cesium.Pass.OPAQUE
    }).execute(context, passState);

    const uniformMap = {
      u_minHeight: () => minHeight,
      u_maxHeight: () => maxHeight
    };

    let sliceStarted = performance.now();
    for (const mesh of meshes) {
      const attributes = new Cesium.GeometryAttributes();
      attributes.position = new Cesium.GeometryAttribute({
        componentDatatype: Cesium.ComponentDatatype.FLOAT,
        componentsPerAttribute: 3,
        values: mesh.positions
      });
      const vertexArray = Cesium.VertexArray.fromGeometry({
        context,
        geometry: new Cesium.Geometry({
          attributes,
          indices: mesh.indices,
          primitiveType: Cesium.PrimitiveType.TRIANGLES
        }),
        attributeLocations: { position: 0 },
        bufferUsage: Cesium.BufferUsage.STATIC_DRAW
      });
      try {
        new Cesium.DrawCommand({
          vertexArray,
          shaderProgram,
          uniformMap,
          renderState,
          framebuffer,
          primitiveType: Cesium.PrimitiveType.TRIANGLES,
          pass: Cesium.Pass.OPAQUE,
          cull: false,
          occlude: false
        }).execute(context, passState);
      } finally {
        // WebGL 会保留已提交绘制所需的数据，提交后即可释放一次性缓冲。
        vertexArray.destroy();
      }
      if (performance.now() - sliceStarted >= 4) {
        // 让出主线程前复位上下文绑定，Cesium 可以在期间继续渲染场景。
        context.endFrame?.();
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        sliceStarted = performance.now();
      }
    }

    context.endFrame?.();
    shaderProgram.destroy();
    shaderProgram = undefined;

    return {
      context,
      texture,
      framebuffer,
      width,
      height
    };
  } catch (error) {
    shaderProgram?.destroy();
    if (framebuffer) {
      framebuffer.destroy();
    } else {
      texture?.destroy();
      depthTexture?.destroy();
    }
    throw error;
  }
}

/**
 * 同步读回 R 通道。行 0 是帧缓冲底部，对应矩形南边。
 *
 * A &lt; 0.5 的像素没有被地形覆盖，记为 `NaN`。
 *
 * @param raster {@link rasterizeWebGlTerrainHeightMap} 的产物，framebuffer 必须仍有效
 * @returns 长度为 `width * height` 的高程数组（米）
 */
export function readWebGlHeightTexels(raster: RasterizedHeightMap): Float32Array {
  const pixels = raster.context.readPixels({
    x: 0,
    y: 0,
    width: raster.width,
    height: raster.height,
    framebuffer: raster.framebuffer
  }) as unknown as ArrayLike<number>;
  raster.context.endFrame?.();

  const count = raster.width * raster.height;
  const heights = new Float32Array(count);
  for (let index = 0; index < count; index++) {
    const red = pixels[index * 4];
    const alpha = pixels[index * 4 + 3];
    heights[index] = typeof alpha === "number" && alpha >= 0.5 && typeof red === "number" ? red : Number.NaN;
  }
  return heights;
}
