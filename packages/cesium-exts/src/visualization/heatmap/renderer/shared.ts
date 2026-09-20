import { type ResolvedHeatmapOptions } from "../config";

/**
 * 将渐变色带烘焙为 256×1 调色板（RGBA，长度 1024）。
 *
 * @param gradient 键为 `0~1` 色停，值为 CSS 颜色
 */
export function createColorPalette(gradient: Record<number, string>): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("[heatmap] Failed to create 2D context for color palette.");
  }

  const fill = ctx.createLinearGradient(0, 0, 256, 1);
  for (const [stop, color] of Object.entries(gradient)) {
    fill.addColorStop(Number(stop), color);
  }

  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, 256, 1);
  return ctx.getImageData(0, 0, 256, 1).data;
}

/**
 * 解析画布尺寸：优先 `width` / `height`，否则读 container 计算样式，再回退到 canvas 当前尺寸。
 *
 * @param canvas 目标画布
 * @param options 尺寸与容器
 */
export function resolveCanvasSize(
  canvas: HTMLCanvasElement,
  options: Pick<ResolvedHeatmapOptions, "container" | "width" | "height">
): { width: number; height: number } {
  let width = options.width;
  let height = options.height;

  if ((width === undefined || height === undefined) && options.container) {
    const computed = getComputedStyle(options.container);
    width ??= Number.parseFloat(computed.width) || 0;
    height ??= Number.parseFloat(computed.height) || 0;
  }

  return {
    width: width ?? canvas.width ?? 0,
    height: height ?? canvas.height ?? 0
  };
}

/**
 * 将画布以绝对定位挂到容器上。无 container 时只设置 class，用于离屏绘制。
 *
 * @param canvas 输出画布
 * @param container 可选 DOM 容器
 */
export function mountCanvas(canvas: HTMLCanvasElement, container: HTMLElement | undefined): void {
  canvas.className = "heatmap-canvas";
  if (!container) return;

  canvas.style.cssText = "position:absolute;left:0;top:0;";
  container.style.position = "relative";
  if (canvas.parentElement !== container) {
    container.appendChild(canvas);
  }
}

/**
 * 将 `0~1` 透明度转为 `0~255` 字节。
 *
 * @param value 透明度
 */
export function opacityToByte(value: number): number {
  return value * 255;
}

/**
 * 由 alpha 缓冲反推热力值：`min + (max - min) * alpha / 255`。
 *
 * @param alpha 0~255 的强度通道
 * @param min 色带最小值
 * @param max 色带最大值
 */
export function sampleHeatValue(alpha: number, min: number, max: number): number {
  if (max === min) return min;
  return min + (Math.abs(max - min) * alpha) / 255;
}
