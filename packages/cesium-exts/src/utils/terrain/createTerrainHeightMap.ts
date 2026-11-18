import * as Cesium from "cesium";

import type {} from "../../../types/cesium-extensions";
import type {
  TerrainHeightMapOptions,
  TerrainHeightMapResult,
  TerrainTileRef,
  WebGpuTerrainHeightMapResult
} from "./types";

import { type RasterizedHeightMap, rasterizeWebGlTerrainHeightMap, readWebGlHeightTexels } from "./rasterizeWebGl";
import { rasterizeWebGpuTerrainHeightMap, readWebGpuHeightTexels } from "./rasterizeWebGpu";
import { resolveTerrainTiles } from "./resolveTiles";

/** 未指定 `width` / `height` 时的默认纹理边长。 */
const DEFAULT_TEXTURE_SIZE = 1024;

/**
 * Cesium WebGL 地形高度图。由 {@link createTerrainHeightMap} 返回。
 *
 * 持有浮点颜色纹理、深度纹理与帧缓冲。绘制用缓冲与着色器在生成时释放。
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
   * 从帧缓冲同步读回 R 通道高程。
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
    return readWebGlHeightTexels(this._raster);
  }

  /**
   * 释放纹理与帧缓冲。
   *
   * 重复调用是安全的。Framebuffer 持有颜色纹理和深度纹理，一并释放。
   */
  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    // Framebuffer 持有颜色纹理和深度纹理，一并释放。
    this._raster.framebuffer.destroy();
  }
}

/**
 * 使用 Viewer 的 WebGL 上下文生成浮点地形高度图。
 *
 * 在级别上限和瓦片预算内探测可用地形，将选定级别的网格绘制到同一张纹理。
 * 结果可由同一 Cesium 上下文中的着色器采样，或通过 `readHeights()` 同步读回。
 *
 * @param viewer 提供渲染上下文及地形提供者的 Cesium Viewer
 * @param options 覆盖范围与纹理尺寸等参数
 * @returns WebGL 高度图。使用完毕后调用 {@link TerrainHeightMapResult.destroy}
 * @throws 输入参数无效、地形提供者缺少 `availability` 或 WebGL 上下文缺少所需支持时拒绝
 *
 * @example
 * ```ts
 * const heightMap = await createTerrainHeightMap(viewer, {
 *   rectangle: Cesium.Rectangle.fromDegrees(116.3, 39.8, 116.5, 40.0)
 * });
 * try {
 *   const heights = heightMap.readHeights();
 * } finally {
 *   heightMap.destroy();
 * }
 * ```
 */
export async function createTerrainHeightMap(
  viewer: Cesium.Viewer,
  options: TerrainHeightMapOptions
): Promise<TerrainHeightMapResult> {
  if (!viewer?.scene) {
    throw new Error("[createTerrainHeightMap] Construction requires a valid Cesium.Viewer instance.");
  }
  const { rectangle, width, height } = resolveTextureOptions(options);
  const context = viewer.scene.context;
  const resolved = await resolveTerrainTiles(viewer.terrainProvider, { ...options, rectangle });
  const raster = await rasterizeWebGlTerrainHeightMap(
    context,
    resolved.meshes,
    width,
    height,
    resolved.minHeight,
    resolved.maxHeight
  );

  return new TerrainHeightMap(raster, {
    rectangle,
    width,
    height,
    level: resolved.level,
    minHeight: resolved.minHeight,
    maxHeight: resolved.maxHeight,
    tileCount: resolved.tileCount,
    missingTiles: resolved.missingTiles
  });
}

/**
 * 使用调用方的 WebGPU 设备离屏生成地形高度图。
 *
 * 结果纹理可绑定到同一设备上的渲染或计算管线。CPU 消费者可用 `readHeightsAsync()` 异步读回。
 * 用完后调用结果的 `destroy()` 释放纹理。调用方负责管理 `device`。
 *
 * @param device 用于绘制及消费高度图的 WebGPU 设备
 * @param terrainProvider 提供瓦片及 availability 的 Cesium 地形提供者
 * @param options 覆盖范围与纹理尺寸等参数
 * @returns WebGPU 高度图，纹理第 0 行对应矩形南边
 * @throws 输入无效、设备纹理尺寸超限或 WebGPU 管线创建或提交出错时拒绝
 *
 * @example
 * ```ts
 * const adapter = await navigator.gpu?.requestAdapter();
 * if (!adapter) throw new Error("WebGPU unavailable");
 * const device = await adapter.requestDevice();
 * const heightMap = await createWebGpuTerrainHeightMap(device, viewer.terrainProvider, {
 *   rectangle: Cesium.Rectangle.fromDegrees(116.3, 39.8, 116.5, 40.0)
 * });
 * try {
 *   const heights = await heightMap.readHeightsAsync();
 * } finally {
 *   heightMap.destroy();
 * }
 * ```
 */
export async function createWebGpuTerrainHeightMap(
  device: GPUDevice,
  terrainProvider: Cesium.TerrainProvider,
  options: TerrainHeightMapOptions
): Promise<WebGpuTerrainHeightMapResult> {
  const { rectangle, width, height } = resolveTextureOptions(options);
  if (Math.max(width, height) > device.limits.maxTextureDimension2D) {
    throw new Error("[createWebGpuTerrainHeightMap] Height map exceeds the device texture size limit.");
  }

  const resolved = await resolveTerrainTiles(terrainProvider, { ...options, rectangle });
  const texture = await rasterizeWebGpuTerrainHeightMap(device, resolved, width, height);
  let destroyed = false;

  return {
    texture,
    rectangle,
    width,
    height,
    level: resolved.level,
    minHeight: resolved.minHeight,
    maxHeight: resolved.maxHeight,
    tileCount: resolved.tileCount,
    missingTiles: resolved.missingTiles,
    async readHeightsAsync() {
      if (destroyed) {
        throw new Error("[createWebGpuTerrainHeightMap] Cannot read heights after destroy().");
      }
      return readWebGpuHeightTexels(device, texture);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      texture.destroy();
    }
  };
}

/**
 * 校验两个渲染入口共用的范围和尺寸，并克隆矩形作为异步生成的输入快照。
 *
 * @param options 原始高度图参数
 * @returns 矩形副本与填充默认值后的纹理尺寸
 */
function resolveTextureOptions(options: TerrainHeightMapOptions) {
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

  return {
    rectangle: Cesium.Rectangle.clone(options.rectangle),
    width: positiveTextureSize(options.width, "width"),
    height: positiveTextureSize(options.height, "height")
  };
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
