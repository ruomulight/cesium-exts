/**
 * 地形高度图：从 Cesium 地形瓦片栅格化一张连续的浮点高程纹理。
 *
 * 公开入口是 {@link createTerrainHeightMap}。点查询请继续使用 Cesium 的 `sampleTerrainMostDetailed`。
 */
export { createTerrainHeightMap } from "./createTerrainHeightMap";
export type { TerrainHeightMapOptions, TerrainHeightMapResult, TerrainTileRef } from "./types";
