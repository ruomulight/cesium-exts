import { HeatmapConfig } from "../config";

/**
 * 渲染器配置接口
 */
export interface RendererConfig {
  container: HTMLElement;
  canvas?: HTMLCanvasElement;
  width?: number;
  height?: number;
  gradient?: { [key: number]: string };
  defaultGradient?: { [key: number]: string };
  blur?: number;
  defaultBlur?: number;
  opacity?: number;
  maxOpacity?: number;
  defaultMaxOpacity?: number;
  minOpacity?: number;
  defaultMinOpacity?: number;
  useGradientOpacity?: boolean;
  backgroundColor?: string;
}

/**
 * Canvas 2D 渲染器类
 */
export class Canvas2dRenderer {
  public canvas: HTMLCanvasElement;
  public shadowCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private readonly shadowCtx: CanvasRenderingContext2D;
  private _width: number = 0;
  private _height: number = 0;
  private _renderBoundaries: number[] = [10000, 10000, 0, 0];
  private _palette: Uint8ClampedArray;
  private _templates: { [key: number]: HTMLCanvasElement } = {};
  private _blur: number = 0;
  private _opacity: number = 0;
  private _maxOpacity: number = 0;
  private _minOpacity: number = 0;
  private _useGradientOpacity: boolean = false;
  private _min: number = 0;
  private _max: number = 0;

  /**
   * 构造函数
   * @param config - 渲染器配置
   */
  constructor(config: RendererConfig) {
    const container = config.container;
    const shadowCanvas = (this.shadowCanvas = document.createElement("canvas"));
    const canvas = (this.canvas = config.canvas || document.createElement("canvas"));

    canvas.className = "heatmap-canvas";

    const computed = getComputedStyle(container) || {};

    this._width = canvas.width = shadowCanvas.width = config.width || +(computed.width?.replace(/px/, "") || 0);
    this._height = canvas.height = shadowCanvas.height = config.height || +(computed.height?.replace(/px/, "") || 0);

    this.shadowCtx = shadowCanvas.getContext("2d", { willReadFrequently: true })!;
    this.ctx = canvas.getContext("2d")!;

    canvas.style.cssText = shadowCanvas.style.cssText = "position:absolute;left:0;top:0;";
    container.style.position = "relative";
    container.appendChild(canvas);

    this._palette = this._getColorPalette(config);
    this._setStyles(config);
  }

  /**
   * 获取颜色调色板
   * @param config - 配置对象
   * @returns 调色板数据
   */
  private _getColorPalette(config: any): Uint8ClampedArray {
    const gradientConfig = config.gradient || config.defaultGradient || HeatmapConfig.defaultGradient;
    const paletteCanvas = document.createElement("canvas");
    const paletteCtx = paletteCanvas.getContext("2d")!;

    paletteCanvas.width = 256;
    paletteCanvas.height = 1;

    const gradient = paletteCtx.createLinearGradient(0, 0, 256, 1);
    for (const key in gradientConfig) {
      gradient.addColorStop(Number(key), gradientConfig[key]);
    }

    paletteCtx.fillStyle = gradient;
    paletteCtx.fillRect(0, 0, 256, 1);

    return paletteCtx.getImageData(0, 0, 256, 1).data;
  }

  /**
   * 获取点模板（缓存）
   * @param radius - 半径
   * @param blurFactor - 模糊因子
   * @returns 模板 Canvas
   */
  private _getPointTemplate(radius: number, blurFactor: number): HTMLCanvasElement {
    const tplCanvas = document.createElement("canvas");
    const tplCtx = tplCanvas.getContext("2d")!;
    const x = radius;
    const y = radius;
    tplCanvas.width = tplCanvas.height = radius * 2;

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

    return tplCanvas;
  }

  /**
   * 准备渲染数据
   * @param data - 原始数据
   * @returns 扁平化的渲染数据
   */
  private _prepareData(data: any): any {
    const renderData = [];
    const min = data.min;
    const max = data.max;
    const radi = data.radi;
    const points = data.data;

    const xValues = Object.keys(points);
    let xValuesLen = xValues.length;

    while (xValuesLen--) {
      const xValue = xValues[xValuesLen];
      if (xValue === undefined) continue;
      const xPoints = points[xValue];
      if (!xPoints) continue;

      const yValues = Object.keys(xPoints);
      let yValuesLen = yValues.length;
      while (yValuesLen--) {
        const yValue = yValues[yValuesLen];
        if (yValue === undefined) continue;

        const value = xPoints[yValue];
        const radius = radi[xValue]?.[yValue];
        renderData.push({
          x: Number(xValue),
          y: Number(yValue),
          value: value,
          radius: radius
        });
      }
    }

    return {
      min: min,
      max: max,
      data: renderData
    };
  }

  /**
   * 渲染部分数据
   * @param data - 数据对象
   */
  public renderPartial(data: any): void {
    if (data.data.length > 0) {
      this._drawAlpha(data);
      this._colorize();
    }
  }

  /**
   * 渲染全部数据
   * @param data - 内部数据格式
   */
  public renderAll(data: any): void {
    this._clear();
    if (data.data && Object.keys(data.data).length > 0) {
      this._drawAlpha(this._prepareData(data));
      this._colorize();
    }
  }

  /**
   * 更新渐变配置
   * @param config - 配置对象
   */
  private _updateGradient(config: RendererConfig): void {
    this._palette = this._getColorPalette(config);
  }

  /**
   * 更新配置
   * @param config - 配置对象
   */
  public updateConfig(config: RendererConfig): void {
    if (config["gradient"]) {
      this._updateGradient(config);
    }
    this._setStyles(config);
  }

  /**
   * 设置尺寸
   * @param width - 宽度
   * @param height - 高度
   */
  public setDimensions(width: number, height: number): void {
    this._width = width;
    this._height = height;
    this.canvas.width = this.shadowCanvas.width = width;
    this.canvas.height = this.shadowCanvas.height = height;
  }

  /**
   * 清除画布
   */
  private _clear(): void {
    this.shadowCtx.clearRect(0, 0, this._width, this._height);
    this.ctx.clearRect(0, 0, this._width, this._height);
  }

  /**
   * 设置样式
   * @param config - 配置对象
   */
  private _setStyles(config: RendererConfig): void {
    this._blur = config.blur === 0 ? 0 : config.blur || config.defaultBlur || HeatmapConfig.defaultBlur;

    if (config.backgroundColor) {
      this.canvas.style.backgroundColor = config.backgroundColor;
    }

    this._width = this.canvas.width = this.shadowCanvas.width = config.width || this._width;
    this._height = this.canvas.height = this.shadowCanvas.height = config.height || this._height;

    this._opacity = (config.opacity || 0) * 255;
    this._maxOpacity = (config.maxOpacity || config.defaultMaxOpacity || HeatmapConfig.defaultMaxOpacity) * 255;
    this._minOpacity = (config.minOpacity || config.defaultMinOpacity || HeatmapConfig.defaultMinOpacity) * 255;
    this._useGradientOpacity = !!config.useGradientOpacity;
  }

  /**
   * 绘制 Alpha 通道
   * @param data - 准备好的渲染数据
   */
  private _drawAlpha(data: any): void {
    const min = (this._min = data.min);
    const max = (this._max = data.max);
    const points = data.data || [];
    let dataLen = points.length;
    const blur = 1 - this._blur;

    while (dataLen--) {
      const point = points[dataLen];
      const x = point.x;
      const y = point.y;
      const radius = point.radius;
      const value = Math.min(point.value, max);
      const rectX = x - radius;
      const rectY = y - radius;
      const shadowCtx = this.shadowCtx;

      let tpl: HTMLCanvasElement;
      const cachedTpl = this._templates[radius];
      if (!cachedTpl) {
        this._templates[radius] = tpl = this._getPointTemplate(radius, blur);
      } else {
        tpl = cachedTpl;
      }

      const templateAlpha = (value - min) / (max - min);
      shadowCtx.globalAlpha = templateAlpha < 0.01 ? 0.01 : templateAlpha;
      shadowCtx.drawImage(tpl, rectX, rectY);

      if (rectX < this._renderBoundaries[0]!) this._renderBoundaries[0] = rectX;
      if (rectY < this._renderBoundaries[1]!) this._renderBoundaries[1] = rectY;
      if (rectX + 2 * radius > this._renderBoundaries[2]!) this._renderBoundaries[2] = rectX + 2 * radius;
      if (rectY + 2 * radius > this._renderBoundaries[3]!) this._renderBoundaries[3] = rectY + 2 * radius;
    }
  }

  /**
   * 上色
   */
  private _colorize(): void {
    let x = this._renderBoundaries[0] ?? 0;
    let y = this._renderBoundaries[1] ?? 0;
    let width = (this._renderBoundaries[2] ?? 0) - x;
    let height = (this._renderBoundaries[3] ?? 0) - y;
    const maxWidth = this._width;
    const maxHeight = this._height;
    const opacity = this._opacity;
    const maxOpacity = this._maxOpacity;
    const minOpacity = this._minOpacity;
    const useGradientOpacity = this._useGradientOpacity;

    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x + width > maxWidth) width = maxWidth - x;
    if (y + height > maxHeight) height = maxHeight - y;

    // 避免 width 或 height 为 0 导致错误
    if (width <= 0 || height <= 0) return;

    const img = this.shadowCtx.getImageData(x, y, width, height);
    const imgData = img.data;
    const len = imgData.length;
    const palette = this._palette;

    for (let i = 3; i < len; i += 4) {
      const alpha = imgData[i]!;
      const offset = alpha * 4;

      if (!offset) continue;

      let finalAlpha: number;
      if (opacity > 0) {
        finalAlpha = opacity;
      } else {
        if (alpha < maxOpacity) {
          if (alpha < minOpacity) {
            finalAlpha = minOpacity;
          } else {
            finalAlpha = alpha;
          }
        } else {
          finalAlpha = maxOpacity;
        }
      }

      imgData[i - 3] = palette[offset]!;
      imgData[i - 2] = palette[offset + 1]!;
      imgData[i - 1] = palette[offset + 2]!;
      imgData[i] = useGradientOpacity ? palette[offset + 3]! : finalAlpha;
    }

    // 注意：在现代浏览器中 ImageData.data 是只读的，但我们可以原地修改它
    this.ctx.putImageData(img, x, y);
    this._renderBoundaries = [1000, 1000, 0, 0];
  }

  /**
   * 获取某点的值
   * @param point - 坐标点
   * @returns 数值
   */
  public getValueAt(point: { x: number; y: number }): number {
    const shadowCtx = this.shadowCtx;
    const img = shadowCtx.getImageData(point.x, point.y, 1, 1);
    const data = img.data[3]!;
    const max = this._max;
    const min = this._min;

    return (Math.abs(max - min) * (data / 255)) >> 0;
  }

  /**
   * 获取 DataURL
   * @returns base64 字符串
   */
  public getDataURL(): string {
    return this.canvas.toDataURL();
  }
}
