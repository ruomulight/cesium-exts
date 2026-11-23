import {
  type HeatmapDataSet,
  type HeatmapDataSnapshot,
  type HeatmapInputPoint,
  type HeatmapOptions,
  type ResolvedHeatmapOptions,
  resolveHeatmapOptions
} from "./config";
import { Store } from "./data";
import { createRenderer } from "./renderer";
import { mountCanvas } from "./renderer/shared";
import { type HeatmapRenderer } from "./types";

/**
 * 离屏 / DOM Canvas 热力图引擎。
 *
 * 负责点数据聚合与 Canvas2D / WebGL 绘制，坐标原点位于画布左上角。
 * 实例依赖浏览器 Canvas API；用于 Cesium 时可将 {@link Heatmap.canvas} 作为纹理源。
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
   * @param options - 初始化配置；省略的字段使用默认值。
   * @throws {@link RangeError} 配置中的尺寸、半径或色带范围无效。
   * @throws {@link Error} 无法初始化可用的画布渲染器。
   */
  constructor(options: HeatmapOptions = {}) {
    this._config = resolveHeatmapOptions(options);
    this._store = new Store(this._config);
    this._renderer = createRenderer(this._config);
  }

  /** 当前输出画布。切换渲染后端后应重新读取此属性。 */
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
   * 新坐标且极值未变时增量绘制；重复坐标或极值变化时全量重绘，
   * 保证分批追加与聚合后一次绘制的结果一致。非法坐标会被忽略。
   *
   * @param data - 单个点或点数组。
   * @returns 当前实例，支持链式调用。
   */
  public addData(data: HeatmapInputPoint | HeatmapInputPoint[]): this {
    this._assertAlive();
    const { render, extremaChanged, payload } = this._store.addData(data);
    if (render === "all") this._renderer.renderAll(payload);
    else if (render === "partial") this._renderer.renderPartial(payload);
    if (extremaChanged) this._emitExtrema();
    return this;
  }

  /**
   * 用完整数据集替换当前数据并全量重绘。
   *
   * `min` / `max` 作为本次色带范围；后续追加超出范围的数据仍会扩展极值。
   *
   * @param data - 数据集。
   * @returns 当前实例，支持链式调用。
   * @throws {@link RangeError} 极值不是有限数字或最小值大于最大值。
   */
  public setData(data: HeatmapDataSet): this {
    this._assertAlive();
    const payload = this._store.setData(data);
    this._renderer.renderAll(payload);
    this._emitExtrema();
    return this;
  }

  /**
   * 清空全部数据并重绘（画布变为空白）。
   *
   * @returns 当前实例，支持链式调用。
   */
  public removeData(): this {
    this._assertAlive();
    const payload = this._store.clear();
    this._renderer.renderAll(payload);
    this._emitExtrema();
    return this;
  }

  /**
   * 手动指定色带最大值并全量重绘。
   *
   * @param max - 新的最大值。
   * @returns 当前实例，支持链式调用。
   * @throws {@link RangeError} 最大值不是有限数字或小于当前最小值。
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
   * @param min - 新的最小值。
   * @returns 当前实例，支持链式调用。
   * @throws {@link RangeError} 最小值不是有限数字或大于当前最大值。
   */
  public setDataMin(min: number): this {
    this._assertAlive();
    this._renderer.renderAll(this._store.setDataMin(min));
    this._emitExtrema();
    return this;
  }

  /**
   * 合并新配置并全量重绘。
   *
   * 字段映射和默认半径仅影响后续输入，已有聚合点保持不变。
   * 更换画布或渲染后端时重建渲染器。切换后端时默认新建画布；
   * 可通过 `canvas` 提供其他画布，当前画布无法切换上下文类型。
   * 容器尺寸仅在初始化时推断；移动容器后可通过 `setDimensions` 调整尺寸。
   *
   * @param options - 要覆盖的配置项；渐变整体替换。
   * @returns 当前实例，支持链式调用。
   * @throws {@link RangeError} 配置无效。
   */
  public configure(options: HeatmapOptions): this {
    this._assertAlive();
    const previous = this._config;
    const config = resolveHeatmapOptions({ ...previous, ...options });
    const rendererChanged = config.renderer !== previous.renderer;
    const canvasChanged = config.canvas !== previous.canvas && config.canvas !== this._renderer.canvas;

    if (rendererChanged || canvasChanged) {
      if (rendererChanged && (options.canvas === undefined || config.canvas === this._renderer.canvas)) {
        config.canvas = undefined;
      }
      // 新渲染器初始化成功后才释放旧资源，初始化失败时保留现有实例。
      const renderer = createRenderer(config);
      this._renderer.destroy();
      this._renderer = renderer;
    } else {
      this._renderer.updateConfig(config);
      if (config.container !== previous.container) {
        const canvas = this._renderer.canvas;
        if (!config.container && canvas.parentElement === previous.container) canvas.remove();
        mountCanvas(canvas, config.container);
      }
    }

    this._config = config;
    this._store.updateConfig(config);
    this._renderer.renderAll(this._store.getRenderData());
    return this;
  }

  /**
   * 调整画布尺寸并全量重绘。
   *
   * @param width - 宽度（像素），非负有限数字，小数向下取整。
   * @param height - 高度（像素），非负有限数字，小数向下取整。
   * @returns 当前实例，支持链式调用。
   * @throws {@link RangeError} 任一尺寸无效。
   */
  public setDimensions(width: number, height: number): this {
    this._assertAlive();
    const config = resolveHeatmapOptions({ ...this._config, width, height });
    this._renderer.setDimensions(config.width!, config.height!);
    this._config = config;
    this._renderer.renderAll(this._store.getRenderData());
    return this;
  }

  /**
   * 按当前数据与配置重新绘制。
   *
   * @returns 当前实例，支持链式调用。
   */
  public repaint(): this {
    this._assertAlive();
    this._renderer.renderAll(this._store.getRenderData());
    return this;
  }

  /**
   * 导出当前聚合后的点数据（拷贝）。
   *
   * @returns 标准字段名的聚合快照；修改返回值不会影响内部存储。
   */
  public getData(): HeatmapDataSnapshot {
    this._assertAlive();
    return this._store.getData();
  }

  /**
   * 将当前画面导出为 PNG Data URL。
   *
   * @returns `data:image/png` 开头的 URL；零尺寸画布由浏览器返回 `data:,`。
   */
  public getDataURL(): string {
    this._assertAlive();
    return this._renderer.getDataURL();
  }

  /**
   * 读取指定像素的热力值（由 alpha 缓冲反推）。
   *
   * @remarks
   * 重叠点经 alpha 合成后不再是输入值的算术和，本方法返回可视化强度的近似值。
   *
   * @param point - 画布像素坐标，小数向下取整。
   * @returns 由 alpha 反推的数值；坐标无效、越界或像素透明时返回 0。
   */
  public getValueAt(point: { x: number; y: number }): number {
    this._assertAlive();
    return this._renderer.getValueAt(point);
  }

  /**
   * 释放渲染资源并清空数据，可重复调用。
   *
   * 仅移除引擎创建的画布；调用方提供的画布保留在 DOM。
   * 销毁后，数据读写与绘制方法会抛出 {@link Error}。
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    try {
      this._renderer.destroy();
    } finally {
      this._store.clear();
    }
  }

  /** 绘制完成后通知调用方，并隔离回调可修改的渐变对象。 */
  private _emitExtrema(): void {
    this._config.onExtremaChange?.({
      min: this._store.min,
      max: this._store.max,
      gradient: { ...this._config.gradient }
    });
  }

  /** 阻止已释放资源上的数据读写与绘制操作。 */
  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("[heatmap] Heatmap has been destroyed.");
    }
  }
}
