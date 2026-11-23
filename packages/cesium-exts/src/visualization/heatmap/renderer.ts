import { type ResolvedHeatmapOptions } from "./config";
import { Canvas2dRenderer } from "./renderer/canvas2d";
import { CanvasWebGLRenderer } from "./renderer/canvas-webgl";
import { type HeatmapRenderer } from "./types";

export type { HeatmapRenderData, HeatmapRenderer, HeatmapRenderPoint } from "./types";

/**
 * 按配置创建渲染器。
 *
 * 默认尝试 WebGL；上下文或着色器初始化失败时回退 Canvas2D。
 * 若用户传入的 canvas 已被 WebGL 占用，回退时会另建一张画布。
 *
 * @param options - 已解析的完整配置。
 * @returns 可用的 WebGL 渲染器或回退后的 Canvas2D 渲染器。
 * @throws {@link Error} 指定画布的上下文已被占用，或无法创建 Canvas2D 上下文。
 */
export function createRenderer(options: ResolvedHeatmapOptions): HeatmapRenderer {
  if (options.renderer === "canvas2d") {
    return new Canvas2dRenderer(options);
  }

  try {
    return new CanvasWebGLRenderer(options);
  } catch {
    const canvas = options.canvas;
    const webglLocked = Boolean(canvas && (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")));
    return new Canvas2dRenderer(webglLocked ? { ...options, canvas: undefined } : options);
  }
}
