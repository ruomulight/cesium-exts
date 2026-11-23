import { type ResolvedHeatmapOptions } from "../config";
import { type HeatmapRenderData, type HeatmapRenderer, type HeatmapRenderPoint } from "../types";
import { createColorPalette, mountCanvas, opacityToByte, resolveCanvasSize, sampleHeatValue } from "./shared";

/** 限制不同半径模板数量，避免连续变化的半径长期占用离屏画布。 */
const MAX_CACHED_TEMPLATES = 128;

/**
 * Canvas 2D 热力图渲染器。
 *
 * @remarks
 * 先在离屏画布上以 source-over 合成点强度，再按 256 色调色板写入输出画布。
 * 仅对当前绘制影响的脏矩形执行像素读写，避免每次处理整张画布。
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

  private _width = 0;
  private _height = 0;
  /** 脏矩形，仅对本次 _colorize 范围内的像素上色 */
  private _minX = Infinity;
  private _minY = Infinity;
  private _maxX = -Infinity;
  private _maxY = -Infinity;
  /** 256×1 渐变烘焙后的 RGBA 调色板 */
  private _palette: Uint8ClampedArray;
  /** 保存色停副本，允许识别调用方原地修改的渐变配置。 */
  private _gradient: Record<number, string>;
  /** 点模板缓存，键为 `半径:模糊因子` */
  private readonly _templates = new Map<string, HTMLCanvasElement>();
  private _blur = 0;
  private _opacity = 0;
  private _maxOpacity = 0;
  private _minOpacity = 0;
  private _useGradientOpacity = false;
  /** 只清理由配置设置的背景色，初次使用时保留调用方原有样式。 */
  private _backgroundColor: string | undefined;
  private _min = 0;
  private _max = 0;
  private _destroyed = false;

  /**
   * @param config - 已解析的完整配置。
   * @throws 无法创建 Canvas 2D 上下文或渐变调色板时抛出错误。
   */
  constructor(config: ResolvedHeatmapOptions) {
    this._ownsCanvas = !config.canvas;
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

    this._palette = createColorPalette(config.gradient);
    this._gradient = { ...config.gradient };
    this._applyStyles(config);
    // 初始化成功后才挂载，失败时不向容器遗留画布节点。
    mountCanvas(this.canvas, config.container);
  }

  /**
   * 将点叠加到已有 alpha 缓冲后上色。调用方须保证极值未变。
   *
   * @param data - 本次新增且尚未绘制的点，色带范围必须与上次绘制一致。
   */
  public renderPartial(data: HeatmapRenderData): void {
    if (this._destroyed || data.points.length === 0) return;
    this._drawAlpha(data);
    this._colorize();
  }

  /**
   * 清空画布后全量重绘。
   *
   * @param data - 当前全部聚合点及色带范围。
   */
  public renderAll(data: HeatmapRenderData): void {
    if (this._destroyed) return;
    this._min = data.min;
    this._max = data.max;
    this._clear();
    if (data.points.length === 0) return;
    this._drawAlpha(data);
    this._colorize();
  }

  /**
   * 更新渐变、模糊、透明度与尺寸。模糊变化会清空点模板缓存。
   *
   * @param config - 新的完整配置。
   */
  public updateConfig(config: ResolvedHeatmapOptions): void {
    if (this._destroyed) return;
    const stops = Object.keys(config.gradient);
    if (
      stops.length !== Object.keys(this._gradient).length ||
      stops.some(stop => config.gradient[Number(stop)] !== this._gradient[Number(stop)])
    ) {
      this._palette = createColorPalette(config.gradient);
      this._gradient = { ...config.gradient };
    }
    if (this._blur !== config.blur) this._templates.clear();
    this._applyStyles(config);
  }

  /**
   * 调整输出与强度缓冲尺寸。尺寸变化会清空像素，需要由调用方重新绘制。
   *
   * @param width - 宽度（像素），按非负整数处理。
   * @param height - 高度（像素），按非负整数处理。
   */
  public setDimensions(width: number, height: number): void {
    if (this._destroyed) return;
    width = Number.isFinite(width) ? Math.max(Math.floor(width), 0) : 0;
    height = Number.isFinite(height) ? Math.max(Math.floor(height), 0) : 0;
    if (width === this._width && height === this._height) return;
    this._width = width;
    this._height = height;
    this.canvas.width = this.shadowCanvas.width = width;
    this.canvas.height = this.shadowCanvas.height = height;
    this._resetBoundaries();
  }

  /**
   * 读取 shadow canvas 上该像素的 alpha，并反推热力值。
   *
   * @param point - 画布像素坐标，小数部分向下取整。
   * @returns 由强度缓冲反推的近似值；越界、无效坐标或透明像素返回 `0`。
   */
  public getValueAt(point: { x: number; y: number }): number {
    if (this._destroyed || this._width <= 0 || this._height <= 0) return 0;
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= this._width || y >= this._height) {
      return 0;
    }
    const img = this.shadowCtx.getImageData(x, y, 1, 1);
    return sampleHeatValue(img.data[3] ?? 0, this._min, this._max);
  }

  /**
   * 导出当前输出画布。
   *
   * @returns PNG Data URL；空尺寸画布返回浏览器定义的 `"data:,"`。
   */
  public getDataURL(): string {
    return this.canvas.toDataURL();
  }

  /**
   * 清空缓冲并释放模板，可重复调用。
   *
   * @remarks
   * 仅移除本实例创建的输出画布；调用方传入的画布保留在 DOM 中。
   */
  public destroy(): void {
    if (this._destroyed) return;
    this._templates.clear();
    this._clear();
    if (this._ownsCanvas) {
      this.canvas.remove();
    }
    // 将离屏画布设为空尺寸，及时释放浏览器持有的像素缓冲。
    this.shadowCanvas.width = this.shadowCanvas.height = 0;
    this._destroyed = true;
  }

  /** 应用模糊、透明度与背景色；尺寸变化时才重置 canvas 像素缓冲。 */
  private _applyStyles(config: ResolvedHeatmapOptions): void {
    this._blur = config.blur;

    if (config.backgroundColor !== undefined || this._backgroundColor !== undefined) {
      this.canvas.style.backgroundColor = config.backgroundColor ?? "";
    }
    this._backgroundColor = config.backgroundColor;

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
   *
   * @param radius - 有限的正数半径（像素）。
   * @param blurFactor - 实心内圈半径占总半径的比例。
   * @returns 可反复盖印的离屏画布。
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

    // Canvas 尺寸必须是整数，向上取整避免小半径模板变成 0 像素或裁掉外缘。
    tplCanvas.width = tplCanvas.height = Math.max(Math.ceil(radius * 2), 1);
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

    if (this._templates.size >= MAX_CACHED_TEMPLATES) {
      const oldestKey = this._templates.keys().next().value;
      if (oldestKey !== undefined) this._templates.delete(oldestKey);
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
    if (this._width <= 0 || this._height <= 0) return;

    for (const point of data.points) {
      this._stampPoint(point, min, range, blurFactor);
    }
  }

  /** 以 `(value-min)/range` 为 alpha 盖印点模板，并扩展脏矩形。 */
  private _stampPoint(point: HeatmapRenderPoint, min: number, range: number, blurFactor: number): void {
    const radius = point.radius;
    if (!Number.isFinite(radius) || radius <= 0) return;
    const rectX = point.x - radius;
    const rectY = point.y - radius;
    // 完全位于画布外的点无需分配模板，也不应扩大本次像素处理范围。
    if (rectX >= this._width || rectY >= this._height || point.x + radius <= 0 || point.y + radius <= 0) return;
    const tpl = this._getPointTemplate(radius, blurFactor);
    const templateAlpha = Math.min(Math.max((Math.min(point.value, this._max) - min) / range, 0.01), 1);

    this.shadowCtx.globalAlpha = templateAlpha;
    this.shadowCtx.drawImage(tpl, rectX, rectY);

    if (rectX < this._minX) this._minX = rectX;
    if (rectY < this._minY) this._minY = rectY;
    if (rectX + tpl.width > this._maxX) this._maxX = rectX + tpl.width;
    if (rectY + tpl.height > this._maxY) this._maxY = rectY + tpl.height;
  }

  /**
   * 仅处理脏矩形：用 alpha 查调色板后写回可见画布。
   * `opacity > 0` 时使用统一透明度，否则按 min/maxOpacity 夹取。
   */
  private _colorize(): void {
    // 先取整数包围盒再与画布求交，既覆盖亚像素边缘，也避免负坐标使宽高膨胀。
    const x = Math.max(Math.floor(this._minX), 0);
    const y = Math.max(Math.floor(this._minY), 0);
    const right = Math.min(Math.ceil(this._maxX), this._width);
    const bottom = Math.min(Math.ceil(this._maxY), this._height);
    this._resetBoundaries();
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const width = right - x;
    const height = bottom - y;
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
      const finalAlpha = opacity > 0 ? opacity : Math.min(Math.max(alpha, minOpacity), maxOpacity);

      imgData[i - 3] = palette[offset]!;
      imgData[i - 2] = palette[offset + 1]!;
      imgData[i - 1] = palette[offset + 2]!;
      imgData[i] = useGradientOpacity ? palette[offset + 3]! : finalAlpha;
    }

    this.ctx.putImageData(img, x, y);
  }
}
