import {
  type HeatmapDataSet,
  type HeatmapInputPoint,
  type HeatmapOptions,
  type HeatmapPoint,
  type ResolvedHeatmapOptions,
  resolveHeatmapOptions
} from "./config";
import { Store } from "./data";
import { createRenderer } from "./renderer";
import { type HeatmapRenderer } from "./types";

/**
 * 离屏 / DOM Canvas 热力图引擎。
 *
 * 负责点数据聚合与 2D / WebGL 绘制，坐标系为画布像素，不绑定 Cesium。
 * 卸载时必须调用 {@link Heatmap.destroy}。
 *
 * @example
 * ```ts
 * const heatmap = new Heatmap({ container, width: 512, height: 512 });
 * heatmap.setData({ min: 0, max: 100, data: [{ x: 80, y: 120, value: 40 }] });
 * heatmap.destroy();
 * ```
 */
export class Heatmap {
  private _config: ResolvedHeatmapOptions;
  private readonly _store: Store;
  private _renderer: HeatmapRenderer;
  private _destroyed = false;

  /**
   * @param options 初始化配置；缺省字段由 {@link resolveHeatmapOptions} 填充
   */
  constructor(options: HeatmapOptions = {}) {
    this._config = resolveHeatmapOptions(options);
    this._store = new Store(this._config);
    this._renderer = createRenderer(this._config);
  }

  /** 当前输出画布 */
  public get canvas(): HTMLCanvasElement {
    return this._renderer.canvas;
  }

  /** 是否已调用 {@link Heatmap.destroy} */
  public get isDestroyed(): boolean {
    return this._destroyed;
  }

  /**
   * 追加数据点。相同像素位置的 `value` 会累加。
   *
   * 极值未变时走增量绘制；min/max 变化则全量重绘以保证色带正确。
   *
   * @param data 单个点或点数组
   */
  public addData(data: HeatmapInputPoint | HeatmapInputPoint[]): this {
    this._assertAlive();
    const { render, extremaChanged, payload } = this._store.addData(data);
    if (extremaChanged) this._emitExtrema();
    if (render === "all") this._renderer.renderAll(payload);
    else if (render === "partial") this._renderer.renderPartial(payload);
    return this;
  }

  /**
   * 用完整数据集替换当前数据并全量重绘。
   *
   * `min` / `max` 作为色带范围，不从点值重新推导。
   *
   * @param data 数据集
   */
  public setData(data: HeatmapDataSet): this {
    this._assertAlive();
    const payload = this._store.setData(data);
    this._emitExtrema();
    this._renderer.renderAll(payload);
    return this;
  }

  /**
   * 清空全部数据并重绘（画布变为空白）。
   */
  public removeData(): this {
    this._assertAlive();
    const payload = this._store.clear();
    this._emitExtrema();
    this._renderer.renderAll(payload);
    return this;
  }

  /**
   * 手动指定色带最大值并全量重绘。
   *
   * @param max 新的最大值
   */
  public setDataMax(max: number): this {
    this._assertAlive();
    this._renderer.renderAll(this._store.setDataMax(max));
    this._emitExtrema();
    return this;
  }

  /**
   * 手动指定色带最小值并全量重绘。
   *
   * @param min 新的最小值
   */
  public setDataMin(min: number): this {
    this._assertAlive();
    this._renderer.renderAll(this._store.setDataMin(min));
    this._emitExtrema();
    return this;
  }

  /**
   * 合并新配置（渐变、模糊、半径、尺寸等）并全量重绘。
   *
   * @param options 要覆盖的配置项
   */
  public configure(options: HeatmapOptions): this {
    this._assertAlive();
    this._config = resolveHeatmapOptions({ ...this._config, ...options });
    this._store.setRadius(this._config.radius);
    this._renderer.updateConfig(this._config);
    this._renderer.renderAll(this._store.getRenderData());
    return this;
  }

  /**
   * 调整画布尺寸并全量重绘。
   *
   * @param width 宽度（像素）
   * @param height 高度（像素）
   */
  public setDimensions(width: number, height: number): this {
    this._assertAlive();
    this._config = { ...this._config, width, height };
    this._renderer.setDimensions(width, height);
    this._renderer.renderAll(this._store.getRenderData());
    return this;
  }

  /** 按当前数据与配置重新绘制，不改数据 */
  public repaint(): this {
    this._assertAlive();
    this._renderer.renderAll(this._store.getRenderData());
    return this;
  }

  /**
   * 导出当前聚合后的点数据（拷贝）。
   */
  public getData(): { min: number; max: number; data: HeatmapPoint[] } {
    this._assertAlive();
    return this._store.getData();
  }

  /**
   * 将当前画面导出为 PNG Data URL。
   */
  public getDataURL(): string {
    this._assertAlive();
    return this._renderer.getDataURL();
  }

  /**
   * 读取指定像素的热力值（由 alpha 缓冲反推）。
   *
   * @param point 画布像素坐标
   */
  public getValueAt(point: { x: number; y: number }): number {
    this._assertAlive();
    return this._renderer.getValueAt(point);
  }

  /**
   * 释放渲染资源并清空数据。由引擎创建的 canvas 会从 DOM 移除。
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._renderer.destroy();
    this._store.clear();
    this._destroyed = true;
  }

  private _emitExtrema(): void {
    this._config.onExtremaChange?.({
      min: this._store.min,
      max: this._store.max,
      gradient: this._config.gradient
    });
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("[heatmap] Heatmap has been destroyed.");
    }
  }
}
