/**
 * 将 Cesium 地形瓦片栅格化为覆盖指定地理矩形的浮点高程纹理。
 *
 * 两个入口共用瓦片可用性探测、级别选择和网格解码。WebGL 入口
 * {@link createTerrainHeightMap} 使用 Viewer 的渲染上下文。WebGPU 入口
 * {@link createWebGpuTerrainHeightMap} 使用调用方提供的设备离屏绘制。
 * 结果的 R 通道存储椭球高，A 通道标记覆盖范围。两种读回接口均从南侧开始逐行返回。
 */
export { createTerrainHeightMap, createWebGpuTerrainHeightMap } from "./createTerrainHeightMap";
export type {
  TerrainHeightMapOptions,
  TerrainHeightMapResult,
  TerrainTileRef,
  WebGpuTerrainHeightMapResult
} from "./types";
