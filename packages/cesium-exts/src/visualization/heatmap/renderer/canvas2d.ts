import { type ResolvedHeatmapOptions } from "../config";
import { type HeatmapRenderData, type HeatmapRenderer, type HeatmapRenderPoint } from "../types";
import {
  createColorPalette,
  mountCanvas,
  opacityToByte,
  resolveCanvasSize,
  sampleHeatValue
} from "./shared";

/**
 * Canvas 2D 热力图渲染器。
 *
 * 先在离屏 shadow canvas 上以灰度 alpha 叠加点模板，再按 256 色调色板着色到可见画布。
 * 卸载时必须调用 {@link Canvas2dRenderer.destroy}。
 */
export class Canvas2dRenderer implements HeatmapRenderer {
  /** 可见输出画布 */
  public readonly canvas: HTMLCanvasElement;
  /** 灰度强度缓冲，仅用于合成与 {@link Canvas2dRenderer.getValueAt} */
  private readonly shadowCanvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly shadowCtx: CanvasRenderingContext2D;
  /** 为 true 时 destroy 会移除 canvas 节点 */
  private readonly _ownsCanvas: boolean;
  private readonly _container: HTMLElement | undefined;

  private _width = 0;
  private _height = 0;
  /** 脏矩形，仅对本次 _colorize 范围内的像素上色 */
  private _minX = Infinity;
  private _minY = Infinity;
  private _maxX = -Infinity;
  private _maxY = -Infinity;
  /** 256×1 渐变烘焙后的 RGBA 调色板 */
  private _palette: Uint8ClampedArray;
  /** 点模板缓存，键为 `半径:模糊因子` */
  private readonly _templates = new Map<string, HTMLCanvasElement>();
  private _blur = 0;
  private _opacity = 0;
  private _maxOpacity = 0;
  private _minOpacity = 0;
  private _useGradientOpacity = false;
  private _min = 0;
  private _max = 0;
  private _destroyed = false;

  /**
   * @param config 已解析的完整配置
   */
  constructor(config: ResolvedHeatmapOptions) {
    this._ownsCanvas = !config.canvas;
    this._container = config.container;
    this.shadowCanvas = document.createElement("canvas");
    this.canvas = config.canvas ?? document.createElement("canvas");

    const size = resolveCanvasSize(this.canvas, config);
    this._width = this.canvas.width = this.shadowCanvas.width = size.width;
    this._height = this.canvas.height = this.shadowCanvas.height = size.height;

    const shadowCtx = this.shadowCanvas.getContext("2d", { willReadFrequently: true });
    const ctx = this.canvas.getContext("2d");
    if (!shadowCtx || !ctx) {
      throw new Error("[heatmap] Canvas 2D context is not available.");
    }
    this.shadowCtx = shadowCtx;
    this.ctx = ctx;

    mountCanvas(this.canvas, config.container);
    this._palette = createColorPalette(config.gradient);
    this._applyStyles(config);
  }

  /**
   * 将点叠加到已有 alpha 缓冲后上色。调用方须保证极值未变。
   *
   * @param data 本次增量点
   */
  public renderPartial(data: HeatmapRenderData): void {
    if (this._destroyed || data.points.length === 0) return;
    this._drawAlpha(data);
    this._colorize();
  }

  /**
   * 清空画布后全量重绘。
   *
   * @param data 当前全部聚合点
   */
  public renderAll(data: HeatmapRenderData): void {
    if (this._destroyed) return;
    this._clear();
    if (data.points.length === 0) return;
    this._drawAlpha(data);
    this._colorize();
  }

  /**
   * 更新渐变、模糊、透明度与尺寸。模糊变化会清空点模板缓存。
   *
   * @param config 新配置
   */
  public updateConfig(config: ResolvedHeatmapOptions): void {
    if (this._destroyed) return;
    this._palette = createColorPalette(config.gradient);
    this._templates.clear();
    this._applyStyles(config);
  }

  /**
   * @param width 宽度（像素）
   * @param height 高度（像素）
   */
  public setDimensions(width: number, height: number): void {
    if (this._destroyed || (width === this._width && height === this._height)) return;
    this._width = width;
    this._height = height;
    this.canvas.width = this.shadowCanvas.width = width;
    this.canvas.height = this.shadowCanvas.height = height;
    this._resetBoundaries();
  }

  /**
   * 读取 shadow canvas 上该像素的 alpha，并反推热力值。
   *
   * @param point 画布像素坐标
   */
  public getValueAt(point: { x: number; y: number }): number {
    if (this._destroyed || this._width <= 0 || this._height <= 0) return 0;
    const img = this.shadowCtx.getImageData(point.x, point.y, 1, 1);
    return sampleHeatValue(img.data[3] ?? 0, this._min, this._max);
  }

  /** @returns PNG Data URL */
  public getDataURL(): string {
    return this.canvas.toDataURL();
  }

  /**
   * 清空缓冲并移除由本实例创建的 canvas。
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._templates.clear();
    this._clear();
    if (this._ownsCanvas) {
      this.canvas.remove();
    } else if (this._container && this.canvas.parentElement === this._container) {
      this._container.removeChild(this.canvas);
    }
    this._destroyed = true;
  }

  /** 应用模糊、透明度与背景色；尺寸变化时才重置 canvas 像素缓冲。 */
  private _applyStyles(config: ResolvedHeatmapOptions): void {
    this._blur = config.blur;

    if (config.backgroundColor) {
      this.canvas.style.backgroundColor = config.backgroundColor;
    }

    const width = config.width ?? this._width;
    const height = config.height ?? this._height;
    this.setDimensions(width, height);

    this._opacity = opacityToByte(config.opacity);
    this._maxOpacity = opacityToByte(config.maxOpacity);
    this._minOpacity = opacityToByte(config.minOpacity);
    this._useGradientOpacity = config.useGradientOpacity;
  }

  /** 清空可见画布与 alpha 缓冲，并重置脏矩形。 */
  private _clear(): void {
    this.shadowCtx.clearRect(0, 0, this._width, this._height);
    this.ctx.clearRect(0, 0, this._width, this._height);
    this._resetBoundaries();
  }

  /** 脏矩形重置为“尚未绘制”状态。 */
  private _resetBoundaries(): void {
    this._minX = Infinity;
    this._minY = Infinity;
    this._maxX = -Infinity;
    this._maxY = -Infinity;
  }

  /**
   * 按半径与模糊因子缓存点模板。`blurFactor === 1` 时画实心圆，否则为径向渐隐。
   */
  private _getPointTemplate(radius: number, blurFactor: number): HTMLCanvasElement {
    const key = `${radius}:${blurFactor}`;
    const cached = this._templates.get(key);
    if (cached) return cached;

    const tplCanvas = document.createElement("canvas");
    const tplCtx = tplCanvas.getContext("2d");
    if (!tplCtx) {
      throw new Error("[heatmap] Failed to create point template canvas.");
    }

    tplCanvas.width = tplCanvas.height = radius * 2;
    const x = radius;
    const y = radius;

    if (blurFactor === 1) {
      tplCtx.beginPath();
      tplCtx.arc(x, y, radius, 0, 2 * Math.PI, false);
      tplCtx.fillStyle = "rgba(0,0,0,1)";
      tplCtx.fill();
    } else {
      const gradient = tplCtx.createRadialGradient(x, y, radius * blurFactor, x, y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      tplCtx.fillStyle = gradient;
      tplCtx.fillRect(0, 0, 2 * radius, 2 * radius);
    }

    this._templates.set(key, tplCanvas);
    return tplCanvas;
  }

  /** 以归一化强度把点盖到 shadow canvas，并扩大脏矩形。 */
  private _drawAlpha(data: HeatmapRenderData): void {
    const min = (this._min = data.min);
    const max = (this._max = data.max);
    const range = max - min || 1;
    const blurFactor = 1 - this._blur;

    for (const point of data.points) {
      this._stampPoint(point, min, range, blurFactor);
    }
  }

  /** 以 `(value-min)/range` 为 alpha 盖印点模板，并扩展脏矩形。 */
  private _stampPoint(point: HeatmapRenderPoint, min: number, range: number, blurFactor: number): void {
    const radius = point.radius;
    const rectX = point.x - radius;
    const rectY = point.y - radius;
    const tpl = this._getPointTemplate(radius, blurFactor);
    const templateAlpha = Math.max((Math.min(point.value, this._max) - min) / range, 0.01);

    this.shadowCtx.globalAlpha = templateAlpha;
    this.shadowCtx.drawImage(tpl, rectX, rectY);

    if (rectX < this._minX) this._minX = rectX;
    if (rectY < this._minY) this._minY = rectY;
    if (rectX + 2 * radius > this._maxX) this._maxX = rectX + 2 * radius;
    if (rectY + 2 * radius > this._maxY) this._maxY = rectY + 2 * radius;
  }

  /**
   * 仅处理脏矩形：用 alpha 查调色板后写回可见画布。
   * `opacity > 0` 时使用统一透明度，否则按 min/maxOpacity 夹取。
   */
  private _colorize(): void {
    let x = this._minX;
    let y = this._minY;
    let width = this._maxX - x;
    let height = this._maxY - y;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + width > this._width) width = this._width - x;
    if (y + height > this._height) height = this._height - y;
    if (width <= 0 || height <= 0) return;

    const img = this.shadowCtx.getImageData(x, y, width, height);
    const imgData = img.data;
    const palette = this._palette;
    const opacity = this._opacity;
    const maxOpacity = this._maxOpacity;
    const minOpacity = this._minOpacity;
    const useGradientOpacity = this._useGradientOpacity;

    for (let i = 3; i < imgData.length; i += 4) {
      const alpha = imgData[i]!;
      if (!alpha) continue;

      const offset = alpha * 4;
      let finalAlpha: number;
      if (opacity > 0) {
        finalAlpha = opacity;
      } else if (alpha < maxOpacity) {
        finalAlpha = alpha < minOpacity ? minOpacity : alpha;
      } else {
        finalAlpha = maxOpacity;
      }

      imgData[i - 3] = palette[offset]!;
      imgData[i - 2] = palette[offset + 1]!;
      imgData[i - 1] = palette[offset + 2]!;
      imgData[i] = useGradientOpacity ? palette[offset + 3]! : finalAlpha;
    }

    this.ctx.putImageData(img, x, y);
    this._resetBoundaries();
  }
}
