import type * as Cesium from "cesium";

/**
 * 地形瓦片坐标。
 *
 * `level` 是 availability 收敛、并按 `maxTiles` 下调之后的级别，不一定等于请求时传入的上限。
 */
export interface TerrainTileRef {
  /** 瓦片列号（西 → 东）。 */
  x: number;
  /** 瓦片行号，方向取决于 tiling scheme。 */
  y: number;
  /** 瓦片级别。 */
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
   *
   * 有的地形服务一开始只知道 0 级，每一级都要再请求一次 tilemap，轮数要够爬到目标级别。
   */
  maxAvailabilityPasses?: number;
  /**
   * 每个瓦片 `requestTileGeometry` / `createMesh` 的总尝试次数。
   *
   * 调度器饱和时会返回 `undefined`，需要让出事件循环后重试。默认 5。
   */
  maxRequestRetries?: number;
}

/**
 * 已经映射到高度图 NDC 的一块地形 Mesh。
 *
 * `positions` 交错存储 `(x, y, heightMeters)`：
 * - `x` / `y` 为 NDC（西 = -1，东 = +1；南 = -1，北 = +1）
 * - `z` 为相对椭球的高程（米）
 */
export interface TerrainHeightMesh {
  /** 交错顶点：`(ndcX, ndcY, heightMeters)`。 */
  positions: Float32Array;
  /** 三角形索引，不含 skirt。 */
  indices: Uint16Array | Uint32Array;
}

/**
 * availability 收敛并完成几何解码后的结果。
 */
export interface ResolvedTerrainTiles {
  /** 实际使用的地形级别。 */
  level: number;
  /** 该级别与矩形相交的瓦片总数（含未能加载的）。 */
  tileCount: number;
  /** 请求或解码失败的瓦片。 */
  missingTiles: TerrainTileRef[];
  /** 已解码并映射到 NDC 的地形 Mesh。 */
  meshes: TerrainHeightMesh[];
  /** 所有成功 Mesh 中的最低高程（米）；无有效 Mesh 时为 0。 */
  minHeight: number;
  /** 所有成功 Mesh 中的最高高程（米）；无有效 Mesh 时为 0。 */
  maxHeight: number;
}

/**
 * GPU 高度图。
 *
 * `texture` 是 RGBA32F：R 为椭球高（米），A 为 1 表示该像素被地形覆盖。
 * {@link TerrainHeightMapResult.readHeights} 只返回 R。行 0 是帧缓冲底部，对应矩形南边，与 `readPixels` 一致。
 * 未覆盖像素为 `NaN`。{@link TerrainHeightMapResult.destroy} 之后纹理和读回都不可再用。
 */
export interface TerrainHeightMapResult {
  /** RGBA32F 高度纹理，R = 高程（米），A = 覆盖标记。 */
  readonly texture: Cesium.Texture;
  /** 高度图覆盖的地理范围（弧度），与请求时一致。 */
  readonly rectangle: Cesium.Rectangle;
  /** 实际栅格化使用的地形级别。 */
  readonly level: number;
  /** 纹理宽度（像素）。 */
  readonly width: number;
  /** 纹理高度（像素）。 */
  readonly height: number;
  /** 参与深度编码的最低高程（米）。 */
  readonly minHeight: number;
  /** 参与深度编码的最高高程（米）。 */
  readonly maxHeight: number;
  /** 目标级别上与矩形相交的瓦片总数。 */
  readonly tileCount: number;
  /** 未能加载或解码的瓦片。 */
  readonly missingTiles: readonly TerrainTileRef[];
  /**
   * 从 GPU 读回 R 通道高程。
   *
   * @returns 长度为 `width * height` 的数组；行 0 对应南边；未覆盖像素为 `NaN`
   */
  readHeights(): Float32Array;
  /**
   * 释放 GPU 资源。
   *
   * 重复调用是安全的；之后不可再读回或使用纹理。
   */
  destroy(): void;
}
