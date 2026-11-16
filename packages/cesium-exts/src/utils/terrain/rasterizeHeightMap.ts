import * as Cesium from "cesium";

import type { TerrainHeightMesh } from "./types";

import { HEIGHTMAP_FRAGMENT_SHADER, HEIGHTMAP_VERTEX_SHADER } from "./shaders";

interface RendererContext {
  colorBufferFloat: boolean;
  depthTexture: boolean;
  endFrame?: () => void;
  readPixels(readState: {
    x?: number;
    y?: number;
    width: number;
    height: number;
    framebuffer?: Cesium.Framebuffer;
  }): ArrayBufferView;
}

export interface RasterizedHeightMap {
  context: RendererContext;
  texture: Cesium.Texture;
  framebuffer: Cesium.Framebuffer;
  shaderProgram: Cesium.ShaderProgram;
  vertexArrays: Cesium.VertexArray[];
  width: number;
  height: number;
}

/**
 * 把多块 NDC Mesh 画进同一张浮点纹理。
 *
 * 不用 ComputeCommand：它每次执行会清掉输出，多块瓦片画完只剩最后一块。
 * 深度测试保留更高的高程，瓦片接边重叠时不会互相盖掉。
 */
export function rasterizeTerrainHeightMap(
  context: RendererContext,
  meshes: readonly TerrainHeightMesh[],
  width: number,
  height: number,
  minHeight: number,
  maxHeight: number
): RasterizedHeightMap {
  if (!context.colorBufferFloat) {
    throw new Error("[createTerrainHeightMap] This WebGL context cannot render to a floating-point color buffer.");
  }
  if (!context.depthTexture) {
    throw new Error("[createTerrainHeightMap] This WebGL context does not support depth textures.");
  }

  const vertexArrays: Cesium.VertexArray[] = [];
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
      vertexArrays.push(vertexArray);

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
    }

    context.endFrame?.();

    return {
      context,
      texture,
      framebuffer,
      shaderProgram,
      vertexArrays,
      width,
      height
    };
  } catch (error) {
    for (const vertexArray of vertexArrays) vertexArray.destroy();
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
 * 读回 R 通道。行 0 是帧缓冲底部，对应矩形南边。
 * A < 0.5 的像素没有被地形覆盖，记为 NaN。
 */
export function readHeightTexels(raster: RasterizedHeightMap): Float32Array {
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
