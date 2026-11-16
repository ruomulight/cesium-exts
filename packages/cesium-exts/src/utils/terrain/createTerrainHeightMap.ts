import * as Cesium from "cesium";

import type { TerrainHeightMapOptions, TerrainHeightMapResult, TerrainTileRef } from "./types";

import { type RasterizedHeightMap, rasterizeTerrainHeightMap, readHeightTexels } from "./rasterizeHeightMap";
import { resolveTerrainTiles } from "./resolveTiles";

const DEFAULT_TEXTURE_SIZE = 1024;

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

  private readonly _raster: RasterizedHeightMap;
  private _destroyed = false;

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

  readHeights(): Float32Array {
    if (this._destroyed) {
      throw new Error("[createTerrainHeightMap] Cannot read heights after destroy().");
    }
    return readHeightTexels(this._raster);
  }

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

function positiveTextureSize(value: number | undefined, name: string): number {
  const resolved = value ?? DEFAULT_TEXTURE_SIZE;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`[createTerrainHeightMap] ${name} must be an integer greater than or equal to 1.`);
  }
  return resolved;
}
