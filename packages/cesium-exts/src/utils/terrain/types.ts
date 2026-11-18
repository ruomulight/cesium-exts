import type * as Cesium from "cesium";

/**
 * 地形瓦片坐标。
 *
 * 用于标识一次瓦片请求。高度图结果中的坐标采用实际选定的地形级别。
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
 * 两种渲染后端使用相同的输入。矩形坐标使用弧度，跨日期变更线的范围须拆成两个矩形。
 */
export interface TerrainHeightMapOptions {
  /** 高度图覆盖的地理范围，弧度。 */
  rectangle: Cesium.Rectangle;
  /** 输出纹理宽度，默认 1024。 */
  width?: number;
  /** 输出纹理高度，默认 1024。 */
  height?: number;
  /** 地形级别上限。省略时，由瓦片可用性、探测轮数和瓦片预算决定实际级别。 */
  level?: number;
  /** 相交瓦片预算。超出时逐级下调，最低降到 0 级。默认 256。 */
  maxTiles?: number;
  /**
   * 瓦片可用性信息的最大探测轮数。默认 24。
   *
   * 逐级提供可用性信息的服务（如 ArcGIS World Elevation）可能需要多轮请求才能找到较高的可用级别。
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
 * `positions` 按 `(x, y, heightMeters)` 交错存储。
 * 矩形西、东边对应 NDC x = -1、+1，南、北边对应 NDC y = -1、+1。
 * 矩形外的顶点可超出该范围，由栅格化阶段裁剪。
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
 * Cesium WebGL 高度图。
 *
 * 浮点纹理属于创建高度图的 Cesium 上下文。R 为椭球高（米），A 为 1 表示覆盖，为 0 表示未覆盖。
 * 读取结果按从南到北、从西到东的顺序排列。用完后调用 {@link TerrainHeightMapResult.destroy}。
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
  /** 已解码网格顶点的最低高程（米），包含矩形外的顶点。无可用网格时为 0。 */
  readonly minHeight: number;
  /** 已解码网格顶点的最高高程（米），包含矩形外的顶点。无可用网格时为 0。 */
  readonly maxHeight: number;
  /** 目标级别上与矩形相交的瓦片总数。 */
  readonly tileCount: number;
  /** 已尝试请求但加载或解码失败的瓦片。服务明确标为不可用的瓦片会被跳过。 */
  readonly missingTiles: readonly TerrainTileRef[];
  /**
   * 从帧缓冲同步读回高程。调用可能等待 GPU 完成绘制。
   *
   * @returns 长度为 `width * height` 的数组，未覆盖像素为 `NaN`
   * @throws 高度图已销毁时抛出
   */
  readHeights(): Float32Array;
  /**
   * 释放 GPU 资源。
   *
   * 重复调用是安全的；之后不可再读回或使用纹理。
   */
  destroy(): void;
}

/**
 * WebGPU 高度图。纹理可在创建它的 `GPUDevice` 上绑定，纹理第 0 行对应矩形南边。
 *
 * 调用结果的 `destroy()` 释放纹理。设备的生命周期由调用方管理。
 */
export interface WebGpuTerrainHeightMapResult extends Omit<TerrainHeightMapResult, "texture" | "readHeights"> {
  /** `rgba32float` 纹理。R 为椭球高（米），A 为覆盖标记。 */
  readonly texture: GPUTexture;
  /**
   * 异步等待 GPU 复制完成，再将覆盖像素的 R 通道提取到新的数组。
   *
   * @returns 长度为 `width * height` 的数组。行 0 对应南边，未覆盖像素为 `NaN`
   * @throws 高度图已销毁或 GPU 读回失败时拒绝
   */
  readHeightsAsync(): Promise<Float32Array>;
}
