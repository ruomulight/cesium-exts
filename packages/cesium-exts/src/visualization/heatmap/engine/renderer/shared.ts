import { type ResolvedHeatmapOptions } from "../config";

/**
 * 将渐变色带烘焙为 256×1 调色板（RGBA，长度 1024）。
 *
 * @param gradient - 键为 `0~1` 色停，值为 CSS 颜色。
 * @returns 按色停从小到大采样的 RGBA 字节数组。
 * @throws 无法创建 Canvas 2D 上下文，或色停、CSS 颜色无效时抛出错误。
 */
export function createColorPalette(gradient: Record<number, string>): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("[heatmap] Failed to create 2D context for color palette.");
  }

  const fill = ctx.createLinearGradient(0, 0, 256, 0);
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
 * @param canvas - 目标画布。
 * @param options - 尺寸与容器配置。
 * @returns 非负整数像素尺寸；无效尺寸按 `0` 处理。
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
    width: normalizeDimension(width ?? canvas.width),
    height: normalizeDimension(height ?? canvas.height)
  };
}

/**
 * 将画布以绝对定位挂到容器上，保留已有类名与其他内联样式。
 *
 * @remarks
 * 仅将静态定位容器改为相对定位，避免覆盖调用方的绝对定位或固定定位。
 * 无容器时只添加类名，用于离屏绘制。
 *
 * @param canvas - 输出画布。
 * @param container - 可选的 DOM 容器。
 */
export function mountCanvas(canvas: HTMLCanvasElement, container: HTMLElement | undefined): void {
  canvas.classList.add("heatmap-canvas");
  if (!container) return;

  canvas.style.position = "absolute";
  canvas.style.left = "0";
  canvas.style.top = "0";
  if (getComputedStyle(container).position === "static") {
    container.style.position = "relative";
  }
  if (canvas.parentElement !== container) {
    container.appendChild(canvas);
  }
}

/**
 * 将 `0~1` 透明度转为 `0~255` 字节。
 *
 * @param value - 透明度。
 * @returns 限制在 `0~255` 范围内的透明度，保留小数精度。
 */
export function opacityToByte(value: number): number {
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 1) * 255 : 0;
}

/**
 * 由 alpha 缓冲反推热力值：`min + (max - min) * alpha / 255`。
 *
 * @remarks
 * 无强度的透明像素返回 `0`，即使色带最小值不为 `0`。
 * 重叠点经过 alpha 合成后，只能读取近似热力值，不能还原各点原始强度之和。
 *
 * @param alpha - `0~255` 的强度通道。
 * @param min - 色带最小值。
 * @param max - 色带最大值。
 * @returns 该像素的近似热力值；透明像素返回 `0`。
 */
export function sampleHeatValue(alpha: number, min: number, max: number): number {
  if (alpha <= 0) return 0;
  return min + ((max - min) * alpha) / 255;
}

/** 将 CSS 或显式配置尺寸转换为 Canvas 使用的非负整数像素。 */
function normalizeDimension(value: number): number {
  return Number.isFinite(value) ? Math.max(Math.floor(value), 0) : 0;
}
