import * as Cesium from "cesium";

import type { ResolvedTerrainTiles, TerrainHeightMapOptions, TerrainHeightMesh, TerrainTileRef } from "./types";

/** Cesium 量化 Mesh 顶点编码。 */
interface TerrainMeshEncoding {
  /**
   * 把第 `index` 个顶点解码为笛卡尔坐标。
   *
   * @param buffer 交错顶点缓冲
   * @param index 顶点序号
   * @param result 复用的输出向量
   */
  decodePosition(buffer: Float32Array, index: number, result: Cesium.Cartesian3): Cesium.Cartesian3;
}

/** `TerrainData.createMesh` 返回的量化 Mesh。 */
interface TerrainMeshLike {
  /** 交错顶点缓冲。 */
  vertices: ArrayLike<number>;
  /** 三角形索引，前 `indexCountWithoutSkirts` 个属于地表。 */
  indices: ArrayLike<number>;
  /** 每个顶点占用的 float 数。 */
  stride: number;
  /** 不含 skirt 的索引数量。 */
  indexCountWithoutSkirts: number;
  /** 不含 skirt 的顶点数量。 */
  vertexCountWithoutSkirts: number;
  /** 量化位置解码器。 */
  encoding: TerrainMeshEncoding;
}

/** 提供 `createMesh` 的地形数据（量化 Mesh 地形）。 */
interface MeshTerrainData extends Cesium.TerrainData {
  /**
   * 由量化缓冲生成可绘制 Mesh。
   *
   * 调度器饱和时可能返回 `undefined`，需要重试。
   */
  createMesh(options: {
    tilingScheme: Cesium.TilingScheme;
    x: number;
    y: number;
    level: number;
    exaggeration: number;
    exaggerationRelativeHeight: number;
    throttle: boolean;
  }): Promise<TerrainMeshLike> | undefined;
}

/** 一次瓦片几何请求。`data` 在成功拉取后填入。 */
interface TileJob {
  tile: TerrainTileRef;
  data?: Cesium.TerrainData;
}

/** 单次允许请求的默认瓦片数。 */
const DEFAULT_MAX_TILES = 256;
/** availability 收敛的默认最大轮数。 */
const DEFAULT_AVAILABILITY_PASSES = 24;
/** `requestTileGeometry` / `createMesh` 的默认总尝试次数。 */
const DEFAULT_REQUEST_RETRIES = 5;
/** 等待未知瓦片变为已知的超时（毫秒）。 */
const AVAILABILITY_WAIT_MS = 8000;
/** 限制 Mesh 创建并发，避免同时启动大量 Worker 任务和解码回调。 */
const MESH_CONCURRENCY = 4;
/** 单次主线程解码的时间预算（毫秒）。 */
const DECODE_TIME_SLICE_MS = 4;

/**
 * 把矩形内的地形收敛到稳定 LOD，再解码成高度图 Mesh。
 *
 * availability 是按需加载的树。做法与 `sampleTerrainMostDetailed` 相同：
 * 记录当前 level，补拉未知瓦片的 availability，level 变化就再来一轮。
 * `requestTileGeometry` 在调度器饱和时返回 `undefined`，按批重试，失败的瓦片记入 `missingTiles`。
 *
 * @param terrainProvider 必须暴露 `availability`；椭球地形无法生成高度图
 * @param options 覆盖范围与瓦片预算等参数
 * @returns 实际级别、解码网格及尝试请求后仍失败的瓦片
 * @throws 地形提供者不带 availability 时抛出
 */
export async function resolveTerrainTiles(
  terrainProvider: Cesium.TerrainProvider,
  options: TerrainHeightMapOptions
): Promise<ResolvedTerrainTiles> {
  const rectangle = options.rectangle;
  const availability = terrainProvider.availability;
  if (!Cesium.defined(availability)) {
    throw new Error(
      "[createTerrainHeightMap] Terrain provider must expose tile availability. Ellipsoid terrain cannot produce a height map."
    );
  }

  const maxTiles = positiveInteger(options.maxTiles, DEFAULT_MAX_TILES, "maxTiles");
  const maxAvailabilityPasses = positiveInteger(
    options.maxAvailabilityPasses,
    DEFAULT_AVAILABILITY_PASSES,
    "maxAvailabilityPasses"
  );
  const maxRequestRetries = positiveInteger(options.maxRequestRetries, DEFAULT_REQUEST_RETRIES, "maxRequestRetries");

  const { level, tiles } = await convergeAvailability(
    terrainProvider,
    availability,
    rectangle,
    options.level,
    maxTiles,
    maxAvailabilityPasses
  );

  const requestTiles = tiles.filter(tile => terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) !== false);
  const { loaded, missingTiles } = await requestGeometryBatch(terrainProvider, requestTiles, maxRequestRetries);
  const decoded = await decodeMeshes(terrainProvider.tilingScheme, rectangle, loaded, maxRequestRetries, missingTiles);

  return {
    level,
    tileCount: tiles.length,
    missingTiles,
    meshes: decoded.meshes,
    minHeight: decoded.minHeight,
    maxHeight: decoded.maxHeight
  };
}

/**
 * 迭代补全 availability，直到级别稳定或达到轮数上限。
 *
 * 当前级别已知后，还会探测下一级的 unknown 瓦片——ArcGIS 这类服务起初只登记了 0 级，
 * 必须先把更深一级的 tilemap 拉回来，`computeBestAvailableLevelOverRectangle` 才会升高。
 *
 * @param terrainProvider 地形提供者
 * @param availability 瓦片可用性树
 * @param rectangle 查询范围（弧度）
 * @param levelCap 级别上限；未传则不限制
 * @param maxTiles 瓦片数量预算
 * @param maxPasses 最大收敛轮数
 * @returns 最终级别及该级与矩形相交的全部瓦片
 */
async function convergeAvailability(
  terrainProvider: Cesium.TerrainProvider,
  availability: Cesium.TileAvailability,
  rectangle: Cesium.Rectangle,
  levelCap: number | undefined,
  maxTiles: number,
  maxPasses: number
): Promise<{ level: number; tiles: TerrainTileRef[] }> {
  const tilingScheme = terrainProvider.tilingScheme;
  let level = levelFittingTileBudget(availability, tilingScheme, rectangle, levelCap, maxTiles);

  for (let pass = 0; pass < maxPasses; pass++) {
    const probedLevel = level;
    await ensureTilesKnown(
      terrainProvider,
      availability,
      tilingScheme,
      listIntersectingTiles(tilingScheme, rectangle, probedLevel)
    );

    // ArcGIS 这类服务起初只登记了 0 级。下一级还是 unknown 时要先把 tilemap 拉回来，
    // computeBestAvailableLevelOverRectangle 才会升高。
    const deeperLevel = probedLevel + 1;
    const withinCap = levelCap === undefined || deeperLevel <= Math.floor(levelCap);
    const deeperWithinBudget = withinCap && intersectingTileCount(tilingScheme, rectangle, deeperLevel) <= maxTiles;
    const deeperTiles = deeperWithinBudget ? listIntersectingTiles(tilingScheme, rectangle, deeperLevel) : [];
    if (deeperTiles.length > 0) {
      const unknownDeeper = deeperTiles.filter(
        tile => terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) === undefined
      );
      if (unknownDeeper.length > 0) {
        await ensureTilesKnown(terrainProvider, availability, tilingScheme, unknownDeeper);
      }
    }

    level = levelFittingTileBudget(availability, tilingScheme, rectangle, levelCap, maxTiles);
    const deeperSettled = deeperTiles.every(
      tile => terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) !== undefined
    );
    if (level === probedLevel && deeperSettled) break;
  }

  return { level, tiles: listIntersectingTiles(tilingScheme, rectangle, level) };
}

/**
 * 在瓦片预算内选取最高可用级别。
 *
 * 先取 availability 给出的最佳级别（可被 `levelCap` 限制），再逐级下调直到瓦片数不超过 `maxTiles`。
 *
 * @param availability 瓦片可用性树
 * @param tilingScheme 用于枚举相交瓦片
 * @param rectangle 查询范围
 * @param levelCap 可选级别上限
 * @param maxTiles 瓦片数量预算
 * @returns 满足预算的最高级别
 */
function levelFittingTileBudget(
  availability: Cesium.TileAvailability,
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  levelCap: number | undefined,
  maxTiles: number
): number {
  let level = cappedLevel(availability, rectangle, levelCap);
  while (level > 0 && intersectingTileCount(tilingScheme, rectangle, level) > maxTiles) {
    level -= 1;
  }
  return level;
}

/**
 * 请求未知瓦片的 availability，必要时先展开 level 1 根节点。
 *
 * 父地形还没覆盖这块时，官方实现会先拉 level 1 的根瓦片，把 availability 树展开。
 *
 * @param terrainProvider 地形提供者
 * @param availability 瓦片可用性树
 * @param tilingScheme 用于计算瓦片中心
 * @param tiles 需要确认可用性的瓦片
 */
async function ensureTilesKnown(
  terrainProvider: Cesium.TerrainProvider,
  availability: Cesium.TileAvailability,
  tilingScheme: Cesium.TilingScheme,
  tiles: TerrainTileRef[]
): Promise<void> {
  const pending: Promise<void>[] = [];
  const unknown: TerrainTileRef[] = [];

  for (const tile of tiles) {
    if (terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) === undefined) {
      unknown.push(tile);
      const availabilityPromise = terrainProvider.loadTileDataAvailability(tile.x, tile.y, tile.level);
      if (availabilityPromise)
        pending.push(
          availabilityPromise.then(
            () => undefined,
            () => undefined
          )
        );
    }

    // 父地形还没覆盖这块时，官方实现会先拉 level 1 的根瓦片，把 availability 树展开。
    const center = tileCenter(tilingScheme, tile);
    if (availability.computeMaximumLevelAtPosition(center) === 0) {
      const parent = tilingScheme.positionToTileXY(center, 1);
      const parentTile = { x: parent.x, y: parent.y, level: 1 };
      const parentPromise = terrainProvider.loadTileDataAvailability(parentTile.x, parentTile.y, parentTile.level);
      if (parentPromise) {
        pending.push(
          parentPromise.then(
            () => undefined,
            () => undefined
          )
        );
      } else if (terrainProvider.getTileDataAvailable(parentTile.x, parentTile.y, parentTile.level) === undefined) {
        unknown.push(parentTile);
      }
    }
  }

  if (pending.length > 0) await Promise.all(pending);
  await waitUntilKnown(terrainProvider, unknown);
}

/**
 * 轮询直到瓦片 availability 变为已知，或超过 {@link AVAILABILITY_WAIT_MS}。
 *
 * @param terrainProvider 地形提供者
 * @param tiles 仍为 unknown 的瓦片
 */
async function waitUntilKnown(terrainProvider: Cesium.TerrainProvider, tiles: TerrainTileRef[]): Promise<void> {
  let remaining = tiles;
  const deadline = Date.now() + AVAILABILITY_WAIT_MS;
  while (remaining.length > 0 && Date.now() < deadline) {
    remaining = remaining.filter(
      tile => terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) === undefined
    );
    if (remaining.length > 0) await delay(50);
  }
}

/**
 * 取矩形上当前可用的最高级别，并应用可选上限。
 *
 * @param availability 瓦片可用性树
 * @param rectangle 查询范围
 * @param levelCap 可选级别上限
 * @returns 非负整数级别
 */
function cappedLevel(
  availability: Cesium.TileAvailability,
  rectangle: Cesium.Rectangle,
  levelCap: number | undefined
): number {
  const raw = availability.computeBestAvailableLevelOverRectangle(rectangle);
  const level = Number.isFinite(raw) ? Math.max(0, Math.floor(raw)) : 0;
  if (levelCap === undefined) return level;
  return Math.min(level, Math.max(0, Math.floor(levelCap)));
}

/**
 * 列出与矩形相交的全部瓦片。
 *
 * 矩形边沿向内收缩 1e-6，避免边界点被相邻瓦片重复计入。
 *
 * @param tilingScheme 瓦片方案
 * @param rectangle 查询范围（弧度）
 * @param level 目标级别
 * @returns 相交瓦片列表；级别无效时为空数组
 */
function listIntersectingTiles(
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  level: number
): TerrainTileRef[] {
  const { startX, endX, startY, endY } = intersectingTileRange(tilingScheme, rectangle, level);
  const tiles: TerrainTileRef[] = [];
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      tiles.push({ x, y, level });
    }
  }
  return tiles;
}

/** 只计算数量，避免预算检查时分配高层级的整片瓦片列表。 */
function intersectingTileCount(tilingScheme: Cesium.TilingScheme, rectangle: Cesium.Rectangle, level: number): number {
  const { startX, endX, startY, endY } = intersectingTileRange(tilingScheme, rectangle, level);
  return (endX - startX + 1) * (endY - startY + 1);
}

/** 计算瓦片索引范围，供枚举和预算检查复用。 */
function intersectingTileRange(
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  level: number
): { startX: number; endX: number; startY: number; endY: number } {
  const lonSpan = rectangle.east - rectangle.west;
  const latSpan = rectangle.north - rectangle.south;
  const west = rectangle.west + lonSpan * 1e-6;
  const east = rectangle.east - lonSpan * 1e-6;
  const south = rectangle.south + latSpan * 1e-6;
  const north = rectangle.north - latSpan * 1e-6;

  const southWest = tilingScheme.positionToTileXY(Cesium.Cartographic.fromRadians(west, south), level);
  const northEast = tilingScheme.positionToTileXY(Cesium.Cartographic.fromRadians(east, north), level);
  const xCount = tilingScheme.getNumberOfXTilesAtLevel(level);
  const yCount = tilingScheme.getNumberOfYTilesAtLevel(level);
  if (xCount <= 0 || yCount <= 0) return { startX: 0, endX: -1, startY: 0, endY: -1 };

  const startX = clamp(Math.min(southWest.x, northEast.x), 0, xCount - 1);
  const endX = clamp(Math.max(southWest.x, northEast.x), 0, xCount - 1);
  const startY = clamp(Math.min(southWest.y, northEast.y), 0, yCount - 1);
  const endY = clamp(Math.max(southWest.y, northEast.y), 0, yCount - 1);

  return { startX, endX, startY, endY };
}

/**
 * 瓦片矩形的地理中心。
 *
 * @param tilingScheme 瓦片方案
 * @param tile 瓦片坐标
 * @returns 中心点的地理坐标
 */
function tileCenter(tilingScheme: Cesium.TilingScheme, tile: TerrainTileRef): Cesium.Cartographic {
  const tileRectangle = tilingScheme.tileXYToRectangle(tile.x, tile.y, tile.level);
  return Cesium.Rectangle.center(tileRectangle);
}

/**
 * 批量请求瓦片几何。调度器饱和或失败时按批重试。
 *
 * @param terrainProvider 地形提供者
 * @param tiles 待请求的瓦片
 * @param maxAttempts 总尝试次数
 * @returns 成功加载的任务，以及最终仍失败的瓦片
 */
async function requestGeometryBatch(
  terrainProvider: Cesium.TerrainProvider,
  tiles: TerrainTileRef[],
  maxAttempts: number
): Promise<{ loaded: TileJob[]; missingTiles: TerrainTileRef[] }> {
  let active: TileJob[] = tiles.map(tile => ({ tile }));
  const loaded: TileJob[] = [];

  for (let attempt = 1; attempt <= maxAttempts && active.length > 0; attempt++) {
    const failed: TileJob[] = [];
    await Promise.all(
      active.map(async job => {
        try {
          const promise = terrainProvider.requestTileGeometry(job.tile.x, job.tile.y, job.tile.level);
          if (!promise) {
            failed.push(job);
            return;
          }
          job.data = await promise;
          loaded.push(job);
        } catch {
          failed.push(job);
        }
      })
    );
    active = failed;
    if (active.length > 0 && attempt < maxAttempts) {
      await yieldEventLoop();
    }
  }

  return {
    loaded,
    missingTiles: active.map(job => job.tile)
  };
}

/**
 * 把已加载的 TerrainData 解码为高度图 NDC Mesh，并统计高程范围。
 *
 * 每批并发创建最多 4 块网格，随后顺序转换坐标，避免多个大瓦片同时在主线程解码。
 * 解码失败的瓦片会追加到 `missingTiles`。高程范围统计包含整块网格，未纳入有效网格时返回 0。
 *
 * @param tilingScheme 用于椭球与坐标转换
 * @param rectangle 高度图覆盖范围，用于映射 NDC
 * @param loaded 已拉取几何的任务
 * @param maxAttempts `createMesh` 重试次数
 * @param missingTiles 失败瓦片收集器，解码失败时就地追加
 * @returns NDC Mesh 以及全局高程范围
 */
async function decodeMeshes(
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  loaded: TileJob[],
  maxAttempts: number,
  missingTiles: TerrainTileRef[]
): Promise<{ meshes: TerrainHeightMesh[]; minHeight: number; maxHeight: number }> {
  const ellipsoid = tilingScheme.ellipsoid;
  const decoded: Awaited<ReturnType<typeof decodeMesh>>[] = new Array(loaded.length);
  for (let offset = 0; offset < loaded.length; offset += MESH_CONCURRENCY) {
    const batch = loaded.slice(offset, offset + MESH_CONCURRENCY);
    const meshes = await Promise.all(
      batch.map(job => {
        if (!job.data || !isMeshTerrainData(job.data)) return undefined;
        return createMeshWithRetry(job.data, tilingScheme, job.tile, maxAttempts);
      })
    );
    for (let index = 0; index < batch.length; index++) {
      const mesh = meshes[index];
      if (mesh) decoded[offset + index] = await decodeMesh(mesh, rectangle, ellipsoid);
      // 已解码的顶点缓冲不再需要原始 TerrainData，及时解除引用。
      delete batch[index]!.data;
      await yieldEventLoop();
    }
  }

  const meshes: TerrainHeightMesh[] = [];
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < loaded.length; index++) {
    const mesh = decoded[index];
    const tile = loaded[index]?.tile;
    if (!mesh || !tile) {
      if (tile) missingTiles.push(tile);
      continue;
    }
    minHeight = Math.min(minHeight, mesh.minHeight);
    maxHeight = Math.max(maxHeight, mesh.maxHeight);
    meshes.push({ positions: mesh.positions, indices: mesh.indices });
  }

  if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) {
    minHeight = 0;
    maxHeight = 0;
  }

  return { meshes, minHeight, maxHeight };
}

/**
 * 带重试地调用 `createMesh`。
 *
 * 被推迟（返回 `undefined`）或抛错时让出事件循环再试。
 *
 * @param data 量化 Mesh 地形数据
 * @param tilingScheme 瓦片方案
 * @param tile 瓦片坐标
 * @param maxAttempts 总尝试次数
 * @returns 解码后的 Mesh；全部失败时为 `undefined`
 */
async function createMeshWithRetry(
  data: MeshTerrainData,
  tilingScheme: Cesium.TilingScheme,
  tile: TerrainTileRef,
  maxAttempts: number
): Promise<TerrainMeshLike | undefined> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const promise = data.createMesh({
        tilingScheme,
        x: tile.x,
        y: tile.y,
        level: tile.level,
        exaggeration: 1,
        exaggerationRelativeHeight: 0,
        throttle: false
      });
      if (promise) return await promise;
    } catch {
      // createMesh 被推迟或解析失败时进入下一轮。
    }
    if (attempt < maxAttempts) await yieldEventLoop();
  }
  return undefined;
}

/**
 * 解码一块地形 Mesh：丢弃 skirt，顶点映射到高度图 NDC，z 保留米制高程。
 *
 * NDC x：西 = -1，东 = +1；NDC y：南 = -1，北 = +1。
 *
 * @param mesh 量化 Mesh
 * @param rectangle 高度图覆盖范围
 * @param ellipsoid 用于笛卡尔 → 地理坐标
 * @returns 解码结果；编码不可用或没有有效高程时返回 `undefined`
 */
async function decodeMesh(
  mesh: TerrainMeshLike,
  rectangle: Cesium.Rectangle,
  ellipsoid: Cesium.Ellipsoid
): Promise<
  { positions: Float32Array; indices: Uint16Array | Uint32Array; minHeight: number; maxHeight: number } | undefined
> {
  if (typeof mesh.encoding?.decodePosition !== "function" || mesh.stride <= 0) return undefined;

  const vertices = mesh.vertices instanceof Float32Array ? mesh.vertices : Float32Array.from(mesh.vertices);
  const vertexCount =
    mesh.vertexCountWithoutSkirts > 0 ? mesh.vertexCountWithoutSkirts : Math.floor(vertices.length / mesh.stride);
  const indices = surfaceIndices(mesh);
  if (vertexCount <= 0 || !indices) return undefined;

  const width = rectangle.east - rectangle.west;
  const heightSpan = rectangle.north - rectangle.south;
  if (width <= 0 || heightSpan <= 0) return undefined;

  const positions = new Float32Array(vertexCount * 3);
  const cartesian = new Cesium.Cartesian3();
  const cartographic = new Cesium.Cartographic();
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  let sliceStarted = performance.now();

  for (let index = 0; index < vertexCount; index++) {
    // 每处理 256 个顶点检查一次时间预算，减少逐顶点计时开销。
    if (index % 256 === 0 && performance.now() - sliceStarted >= DECODE_TIME_SLICE_MS) {
      await yieldEventLoop();
      sliceStarted = performance.now();
    }
    mesh.encoding.decodePosition(vertices, index, cartesian);
    Cesium.Cartographic.fromCartesian(cartesian, ellipsoid, cartographic);
    const longitude = cartographic.longitude;
    const latitude = cartographic.latitude;
    const height = cartographic.height;
    positions[index * 3] = ((longitude - rectangle.west) / width) * 2 - 1;
    positions[index * 3 + 1] = ((latitude - rectangle.south) / heightSpan) * 2 - 1;
    positions[index * 3 + 2] = height;
    if (Number.isFinite(height)) {
      minHeight = Math.min(minHeight, height);
      maxHeight = Math.max(maxHeight, height);
    }
  }

  if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight)) return undefined;
  return { positions, indices, minHeight, maxHeight };
}

/**
 * 取不含 skirt 的三角形索引。类型化数组复用视图，其余输入按最大索引复制。
 *
 * @param mesh 量化 Mesh
 * @returns 地表索引；没有有效索引时为 `undefined`
 */
function surfaceIndices(mesh: TerrainMeshLike): Uint16Array | Uint32Array | undefined {
  const count = mesh.indexCountWithoutSkirts > 0 ? mesh.indexCountWithoutSkirts : mesh.indices.length;
  if (count <= 0) return undefined;
  // Cesium Mesh 的索引已是类型化数组；上传前只需视图，无须再次扫描与复制。
  if (mesh.indices instanceof Uint16Array || mesh.indices instanceof Uint32Array) {
    return mesh.indices.subarray(0, count);
  }

  let maxIndex = 0;
  for (let index = 0; index < count; index++) {
    const value = mesh.indices[index] ?? 0;
    if (value > maxIndex) maxIndex = value;
  }

  const indices = maxIndex > 65535 ? new Uint32Array(count) : new Uint16Array(count);
  for (let index = 0; index < count; index++) {
    indices[index] = mesh.indices[index] ?? 0;
  }
  return indices;
}

/**
 * 判断 TerrainData 是否提供 `createMesh`（量化 Mesh 地形）。
 *
 * @param data 地形数据
 * @returns 是否为 Mesh 地形
 */
function isMeshTerrainData(data: Cesium.TerrainData): data is MeshTerrainData {
  return typeof (data as MeshTerrainData).createMesh === "function";
}

/**
 * 解析为正整数；未传则用 `fallback`。
 *
 * @param value 调用方传入值
 * @param fallback 缺省值
 * @param name 字段名，用于错误信息
 * @returns 正整数
 * @throws 不是 ≥ 1 的整数时抛出
 */
function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`[createTerrainHeightMap] ${name} must be an integer greater than or equal to 1.`);
  }
  return resolved;
}

/**
 * 将 `value` 限制在 `[min, max]`。
 *
 * @param value 原始值
 * @param min 下限
 * @param max 上限
 * @returns 夹紧后的值
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * 让出当前事件循环，让 Cesium 有机会渲染场景或更新请求调度器。
 *
 * @returns 在下一个宏任务中 resolve 的 Promise
 */
function yieldEventLoop(): Promise<void> {
  return delay(0);
}

/**
 * 延迟指定毫秒。
 *
 * @param milliseconds 等待时长
 */
function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}
