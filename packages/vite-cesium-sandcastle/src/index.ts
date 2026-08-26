import type { IndexHtmlTransformHook, Plugin } from "vite";

import fs from "fs-extra";
import path from "path";

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

  /**
   * 仅在开发模式（`vite dev` / `serve`）下生效的 Cesium 静态资源基础路径。
   * 不传则开发模式也使用 `cesiumBaseUrl`。
   */
  devCesiumBaseUrl?: string;
}

/**
 * Vite 插件：在 HTML 中替换 Cesium 基础路径占位符。
 *
 * 对应 Sandcastle 模板中的 `__CESIUM_BASE_URL__` 占位符，在 `transformIndexHtml`
 * 的 `pre` 阶段将占位符替换为实际的 Cesium 静态资源基础路径。
 *
 * 开发模式（`command === "serve"`）下，如果传入了 `devCesiumBaseUrl`，
 * 则使用它；否则两种模式都回退到 `cesiumBaseUrl`。
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
  const { placeholder = "__CESIUM_BASE_URL__", cesiumBaseUrl = "/cesium/", devCesiumBaseUrl } = options;

  // 用 config 钩子缓存当前模式：env.command === "serve" 表示开发模式
  // 闭包变量供 transformIndexHtml 消费
  let isDev = false;

  let outDir = "dist";

  const handler: IndexHtmlTransformHook = html => {
    // 开发模式下若单独指定了 devCesiumBaseUrl，则使用它；否则回退到 cesiumBaseUrl
    const finalBaseUrl = isDev && devCesiumBaseUrl ? devCesiumBaseUrl : cesiumBaseUrl;
    return html.replaceAll(placeholder, finalBaseUrl);
  };

  return {
    name: "vite-cesium-sandcastle",

    // 在 Vite 解析配置阶段读取当前命令/模式
    // 调用顺序: config -> configResolved -> transformIndexHtml
    config(c, env) {
      if (c.build?.outDir) {
        if (c.root !== undefined) {
          outDir = path.join(c.root, c.build.outDir);
        } else {
          outDir = c.build.outDir;
        }
      }
      // env.command: "serve" (开发) | "build" (生产)
      // env.mode:    "development" | "production" | 自定义字符串
      isDev = env.mode === "serve";
      console.log(`[vite-cesium-sandcastle] mode: ${env.mode}, command: ${env.command}`);
      console.log("c:", JSON.stringify(c, null, 2));
    },

    async closeBundle() {
      if (isDev) {
        try {
          // 构建结束后，复制静态资源到 dist 目录
          await fs.copy(
            path.join("node_modules/tweakpane/dist/tweakpane.min.js", "Assets"),
            path.join(outDir, "public", "Assets")
          );
          // if (!rebuildCesium) {
          //   await fs.copy(path.join(cesiumBuildPath, "Cesium.js"), path.join(outDir, CESIUM_BASE_URL, "Cesium.js"));
          // }
        } catch (err) {
          console.error("VitePluginCesium: 文件复制失败", err);
        }
      }
    },

    transformIndexHtml: {
      order: "pre",
      handler
    }
  };
}
