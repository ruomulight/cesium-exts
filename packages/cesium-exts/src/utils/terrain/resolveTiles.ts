import * as Cesium from "cesium";

import type { ResolvedTerrainTiles, TerrainHeightMapOptions, TerrainHeightMesh, TerrainTileRef } from "./types";

interface TerrainMeshEncoding {
  decodePosition(buffer: Float32Array, index: number, result: Cesium.Cartesian3): Cesium.Cartesian3;
}

interface TerrainMeshLike {
  vertices: ArrayLike<number>;
  indices: ArrayLike<number>;
  stride: number;
  indexCountWithoutSkirts: number;
  vertexCountWithoutSkirts: number;
  encoding: TerrainMeshEncoding;
}

interface MeshTerrainData extends Cesium.TerrainData {
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

interface TileJob {
  tile: TerrainTileRef;
  data?: Cesium.TerrainData;
}

const DEFAULT_MAX_TILES = 256;
const DEFAULT_AVAILABILITY_PASSES = 24;
const DEFAULT_REQUEST_RETRIES = 5;
const AVAILABILITY_WAIT_MS = 8000;

/**
 * 把矩形内的地形收敛到稳定 LOD，再解码成高度图 Mesh。
 *
 * availability 是按需加载的树。做法与 `sampleTerrainMostDetailed` 相同：
 * 记录当前 level，补拉未知瓦片的 availability，level 变化就再来一轮。
 * `requestTileGeometry` 在调度器饱和时返回 undefined，按批重试，失败的瓦片记入 missingTiles。
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
    const deeperTiles = withinCap ? listIntersectingTiles(tilingScheme, rectangle, deeperLevel) : [];
    if (deeperTiles.length > 0 && deeperTiles.length <= maxTiles) {
      const unknownDeeper = deeperTiles.filter(
        tile => terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) === undefined
      );
      if (unknownDeeper.length > 0) {
        await ensureTilesKnown(terrainProvider, availability, tilingScheme, unknownDeeper);
      }
    }

    level = levelFittingTileBudget(availability, tilingScheme, rectangle, levelCap, maxTiles);
    const deeperSettled =
      deeperTiles.length === 0 ||
      deeperTiles.length > maxTiles ||
      deeperTiles.every(tile => terrainProvider.getTileDataAvailable(tile.x, tile.y, tile.level) !== undefined);
    if (level === probedLevel && deeperSettled) break;
  }

  return { level, tiles: listIntersectingTiles(tilingScheme, rectangle, level) };
}

function levelFittingTileBudget(
  availability: Cesium.TileAvailability,
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  levelCap: number | undefined,
  maxTiles: number
): number {
  let level = cappedLevel(availability, rectangle, levelCap);
  while (level > 0 && listIntersectingTiles(tilingScheme, rectangle, level).length > maxTiles) {
    level -= 1;
  }
  return level;
}

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

function listIntersectingTiles(
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  level: number
): TerrainTileRef[] {
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
  if (xCount <= 0 || yCount <= 0) return [];

  const startX = clamp(Math.min(southWest.x, northEast.x), 0, xCount - 1);
  const endX = clamp(Math.max(southWest.x, northEast.x), 0, xCount - 1);
  const startY = clamp(Math.min(southWest.y, northEast.y), 0, yCount - 1);
  const endY = clamp(Math.max(southWest.y, northEast.y), 0, yCount - 1);

  const tiles: TerrainTileRef[] = [];
  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      tiles.push({ x, y, level });
    }
  }
  return tiles;
}

function tileCenter(tilingScheme: Cesium.TilingScheme, tile: TerrainTileRef): Cesium.Cartographic {
  const tileRectangle = tilingScheme.tileXYToRectangle(tile.x, tile.y, tile.level);
  return Cesium.Rectangle.center(tileRectangle);
}

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

async function decodeMeshes(
  tilingScheme: Cesium.TilingScheme,
  rectangle: Cesium.Rectangle,
  loaded: TileJob[],
  maxAttempts: number,
  missingTiles: TerrainTileRef[]
): Promise<{ meshes: TerrainHeightMesh[]; minHeight: number; maxHeight: number }> {
  const ellipsoid = tilingScheme.ellipsoid;
  const decoded = await Promise.all(
    loaded.map(async job => {
      const data = job.data;
      if (!data || !isMeshTerrainData(data)) return undefined;

      const mesh = await createMeshWithRetry(data, tilingScheme, job.tile, maxAttempts);
      if (!mesh) return undefined;
      return decodeMesh(mesh, rectangle, ellipsoid) ?? undefined;
    })
  );

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

function decodeMesh(
  mesh: TerrainMeshLike,
  rectangle: Cesium.Rectangle,
  ellipsoid: Cesium.Ellipsoid
): { positions: Float32Array; indices: Uint16Array | Uint32Array; minHeight: number; maxHeight: number } | undefined {
  if (typeof mesh.encoding?.decodePosition !== "function" || mesh.stride <= 0) return undefined;

  const vertices = mesh.vertices instanceof Float32Array ? mesh.vertices : Float32Array.from(mesh.vertices);
  const vertexCount =
    mesh.vertexCountWithoutSkirts > 0 ? mesh.vertexCountWithoutSkirts : Math.floor(vertices.length / mesh.stride);
  const indices = copySurfaceIndices(mesh);
  if (vertexCount <= 0 || !indices) return undefined;

  const width = rectangle.east - rectangle.west;
  const heightSpan = rectangle.north - rectangle.south;
  if (width <= 0 || heightSpan <= 0) return undefined;

  const positions = new Float32Array(vertexCount * 3);
  const cartesian = new Cesium.Cartesian3();
  const cartographic = new Cesium.Cartographic();
  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < vertexCount; index++) {
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

function copySurfaceIndices(mesh: TerrainMeshLike): Uint16Array | Uint32Array | undefined {
  const count = mesh.indexCountWithoutSkirts > 0 ? mesh.indexCountWithoutSkirts : mesh.indices.length;
  if (count <= 0) return undefined;

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

function isMeshTerrainData(data: Cesium.TerrainData): data is MeshTerrainData {
  return typeof (data as MeshTerrainData).createMesh === "function";
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new Error(`[createTerrainHeightMap] ${name} must be an integer greater than or equal to 1.`);
  }
  return resolved;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function yieldEventLoop(): Promise<void> {
  return delay(0);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds);
  });
}
