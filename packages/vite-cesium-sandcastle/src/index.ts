import type { IndexHtmlTransformHook, Plugin } from "vite";

/**
 * 传递给 vite-cesium-sandcastle 插件的配置选项。
 * @interface ViteCesiumSandcastleOptions
 */
export interface ViteCesiumSandcastleOptions {
  /**
   * HTML 中需要被替换的占位符。
   * @default "__CESIUM_BASE_URL__"
   */
  placeholder?: string;

  /**
   * 占位符被替换成的 Cesium 静态资源基础路径。
   * @default "/cesium/"
   */
  cesiumBaseUrl?: string;
}

/**
 * Vite 插件：在 HTML 中替换 Cesium 基础路径占位符。
 *
 * 对应 Sandcastle 模板中的 `__CESIUM_BASE_URL__` 占位符，在 `transformIndexHtml`
 * 的 `pre` 阶段将占位符替换为实际的 Cesium 静态资源基础路径。
 *
 * @param options - 插件配置项（可选）
 * @returns 返回一个 Vite Plugin 对象
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from "vite";
 * import cesiumSandcastle from "vite-cesium-sandcastle";
 *
 * export default defineConfig({
 *   plugins: [cesiumSandcastle({ cesiumBaseUrl: "/cesium/" })]
 * });
 * ```
 */
export default function viteCesiumSandcastle(options: ViteCesiumSandcastleOptions = {}): Plugin {
  const { placeholder = "__CESIUM_BASE_URL__", cesiumBaseUrl = "/cesium/" } = options;

  const handler: IndexHtmlTransformHook = html => html.replaceAll(placeholder, cesiumBaseUrl);

  return {
    name: "vite-cesium-sandcastle",
    transformIndexHtml: {
      order: "pre",
      handler
    }
  };
}
