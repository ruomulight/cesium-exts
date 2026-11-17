import * as Cesium from "cesium";

import type { TerrainHeightMapOptions, TerrainHeightMapResult, TerrainTileRef } from "./types";

import { type RasterizedHeightMap, rasterizeTerrainHeightMap, readHeightTexels } from "./rasterizeHeightMap";
import { resolveTerrainTiles } from "./resolveTiles";

/** 未指定 `width` / `height` 时的默认纹理边长。 */
const DEFAULT_TEXTURE_SIZE = 1024;

/**
 * GPU 地形高度图。由 {@link createTerrainHeightMap} 返回。
 *
 * 持有浮点颜色纹理、深度纹理、着色器和各瓦片 VertexArray。
 * 不再使用时必须调用 {@link TerrainHeightMap.destroy}。
 */
class TerrainHeightMap implements TerrainHeightMapResult {
  readonly texture: Cesium.Texture;
  readonly rectangle: Cesium.Rectangle;
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly tileCount: number;
  readonly missingTiles: readonly TerrainTileRef[];

  /** GPU 栅格化产物，供读回与销毁使用。 */
  private readonly _raster: RasterizedHeightMap;
  /** 是否已释放 GPU 资源。 */
  private _destroyed = false;

  /**
   * @param raster GPU 栅格化产物
   * @param resolved 瓦片收敛后的元数据（不含 GPU 资源）
   */
  constructor(
    raster: RasterizedHeightMap,
    resolved: Omit<TerrainHeightMapResult, "texture" | "readHeights" | "destroy">
  ) {
    this._raster = raster;
    this.texture = raster.texture;
    this.rectangle = resolved.rectangle;
    this.level = resolved.level;
    this.width = resolved.width;
    this.height = resolved.height;
    this.minHeight = resolved.minHeight;
    this.maxHeight = resolved.maxHeight;
    this.tileCount = resolved.tileCount;
    this.missingTiles = resolved.missingTiles;
  }

  /**
   * 从帧缓冲读回 R 通道高程。
   *
   * 行 0 对应矩形南边。未被地形覆盖的像素为 `NaN`。
   *
   * @returns 长度为 `width * height` 的高程数组（米）
   * @throws 已调用 {@link TerrainHeightMap.destroy} 时抛出
   */
  readHeights(): Float32Array {
    if (this._destroyed) {
      throw new Error("[createTerrainHeightMap] Cannot read heights after destroy().");
    }
    return readHeightTexels(this._raster);
  }

  /**
   * 释放纹理、帧缓冲、着色器和 VertexArray。
   *
   * 重复调用是安全的。Framebuffer 持有颜色纹理和深度纹理，一并释放。
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    for (const vertexArray of this._raster.vertexArrays) vertexArray.destroy();
    this._raster.shaderProgram.destroy();
    // Framebuffer 持有颜色纹理和深度纹理，一并释放。
    this._raster.framebuffer.destroy();
  }
}

/**
 * 用地形瓦片 Mesh 生成一张浮点高度图。
 *
 * 先把 availability 收敛到范围内真实存在的最高级别，再把瓦片画进同一张纹理。
 * 适合流体、侵蚀、碰撞这类需要连续高程的计算。点查询仍应使用 `sampleTerrainMostDetailed`。
 *
 * @param viewer 已创建场景的 Cesium Viewer
 * @param options 覆盖范围与纹理尺寸等参数
 * @returns GPU 高度图；使用完毕后调用 {@link TerrainHeightMapResult.destroy}
 * @throws 缺少 Viewer / rectangle、矩形跨日界线或南北颠倒时抛出
 *
 * @example
 * ```ts
 * const heightMap = await createTerrainHeightMap(viewer, {
 *   rectangle: Cesium.Rectangle.fromDegrees(116.3, 39.8, 116.5, 40.0)
 * });
 * const heights = heightMap.readHeights();
 * heightMap.destroy();
 * ```
 */
export async function createTerrainHeightMap(
  viewer: Cesium.Viewer,
  options: TerrainHeightMapOptions
): Promise<TerrainHeightMapResult> {
  if (!viewer?.scene) {
    throw new Error("[createTerrainHeightMap] Construction requires a valid Cesium.Viewer instance.");
  }
  if (!Cesium.defined(options?.rectangle)) {
    throw new Error("[createTerrainHeightMap] options.rectangle is required.");
  }
  if (options.rectangle.east < options.rectangle.west) {
    throw new Error(
      "[createTerrainHeightMap] Rectangle crosses the antimeridian. Split it before generating a height map."
    );
  }
  if (options.rectangle.north <= options.rectangle.south) {
    throw new Error("[createTerrainHeightMap] Rectangle north must be greater than south.");
  }

  const width = positiveTextureSize(options.width, "width");
  const height = positiveTextureSize(options.height, "height");
  const context = viewer.scene.context;
  const resolved = await resolveTerrainTiles(viewer.terrainProvider, options);
  const raster = rasterizeTerrainHeightMap(
    context,
    resolved.meshes,
    width,
    height,
    resolved.minHeight,
    resolved.maxHeight
  );

  return new TerrainHeightMap(raster, {
    rectangle: Cesium.Rectangle.clone(options.rectangle),
    level: resolved.level,
    width,
    height,
    minHeight: resolved.minHeight,
    maxHeight: resolved.maxHeight,
    tileCount: resolved.tileCount,
    missingTiles: resolved.missingTiles
  });
}

/**
 * 解析纹理尺寸：未传则用 {@link DEFAULT_TEXTURE_SIZE}。
 *
 * @param value 调用方传入的宽或高
 * @param name 字段名，用于错误信息
 * @returns 正整数边长
 * @throws 不是 ≥ 1 的整数时抛出
 */
function positiveTextureSize(value: number | undefined, name: string): number {
  const resolved = value ?? DEFAULT_TEXTURE_SIZE;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`[createTerrainHeightMap] ${name} must be an integer greater than or equal to 1.`);
  }
  return resolved;
}
