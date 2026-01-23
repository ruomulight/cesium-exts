import { HeatmapConfig } from "./config";
import { Canvas2dRenderer } from "./renderer/canvas2d";
import { CanvasWebGLRenderer } from "./renderer/canvas-webgl";

/**
 * 渲染器工厂，根据配置返回对应的渲染器类
 */
export const Renderer = (function () {
  const type = HeatmapConfig.defaultRenderer;
  if (type === "webgl") {
    return CanvasWebGLRenderer;
  }
  return Canvas2dRenderer;
})();
