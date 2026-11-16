import type * as Cesium from "cesium";

/** 地形瓦片坐标。level 是收敛并按瓦片数量下调之后的级别。 */
export interface TerrainTileRef {
  x: number;
  y: number;
  level: number;
}

/**
 * 生成地形高度图的参数。
 *
 * `rectangle` 使用弧度，且不能跨日界线（`east < west`）。
 * 北纬对应纹理顶部（NDC y = +1）。
 */
export interface TerrainHeightMapOptions {
  /** 高度图覆盖的地理范围，弧度。 */
  rectangle: Cesium.Rectangle;
  /** 输出纹理宽度，默认 1024。 */
  width?: number;
  /** 输出纹理高度，默认 1024。 */
  height?: number;
  /** 地形级别上限。不传则使用范围内当前可用的最高级别。 */
  level?: number;
  /** 单次允许请求的瓦片数，超出后逐级下调。默认 256。 */
  maxTiles?: number;
  /**
   * availability 收敛轮数。默认 24。
   * 有的地形服务一开始只知道 0 级，每一级都要再请求一次 tilemap，轮数要够爬到目标级别。
   */
  maxAvailabilityPasses?: number;
  /**
   * 每个瓦片 `requestTileGeometry` / `createMesh` 的总尝试次数。
   * 调度器饱和时会返回 undefined，需要让出事件循环后重试。默认 5。
   */
  maxRequestRetries?: number;
}

/** 已经映射到高度图 NDC 的一块地形 Mesh。position 为 (x, y, heightMeters)。 */
export interface TerrainHeightMesh {
  positions: Float32Array;
  indices: Uint16Array | Uint32Array;
}

/** availability 收敛并完成几何解码后的结果。 */
export interface ResolvedTerrainTiles {
  level: number;
  tileCount: number;
  missingTiles: TerrainTileRef[];
  meshes: TerrainHeightMesh[];
  minHeight: number;
  maxHeight: number;
}

/**
 * GPU 高度图。
 *
 * `texture` 是 RGBA32F：R 为椭球高（米），A 为 1 表示该像素被地形覆盖。
 * `readHeights` 只返回 R。行 0 是帧缓冲底部，对应矩形南边，与 `readPixels` 一致。
 * 未覆盖像素为 NaN。`destroy` 之后纹理和读回都不可再用。
 */
export interface TerrainHeightMapResult {
  readonly texture: Cesium.Texture;
  readonly rectangle: Cesium.Rectangle;
  readonly level: number;
  readonly width: number;
  readonly height: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly tileCount: number;
  readonly missingTiles: readonly TerrainTileRef[];
  readHeights(): Float32Array;
  destroy(): void;
}
