import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { type Plugin, type ResolvedConfig } from "vite";
import type { SandcastlePluginOptions } from "./types";

/**
 * Sandcastle 专用 Vite 插件，参照官方 Cesium Sandcastle 的 cesiumPathReplace + createSandcastleConfig 实现。
 *
 * 职责：
 * 1. 在 JS 层通过 `define` 注入 `__CESIUM_BASE_URL__`、`__INNER_ORIGIN__`、`__OUTER_ORIGIN__` 全局常量
 * 2. 在 HTML 层通过 `transformIndexHtml` 替换 `__CESIUM_BASE_URL__` 文本占位符
 *    （Vite 的 `define` 只替换 JS 标识符，无法替换 HTML 属性或字符串字面量中的占位符）
 * 3. 在构建时将 templates/Sandcastle.ts 编译为独立 JS 文件
 *    （bucket.html 已通过 <script> 标签加载 Cesium.js 和 Sandcastle.ts，
 *    两者均作为全局对象可用，无需 import map）
 *
 * @param options 插件配置选项
 * @returns Vite 插件对象
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { sandcastlePlugin } from './plugins/sandcastle';
 *
 * export default defineConfig({
 *   plugins: [
 *     sandcastlePlugin({ cesiumBaseUrl: '/cesium/', debug: true })
 *   ]
 * });
 * ```
 */
export function sandcastlePlugin(options: SandcastlePluginOptions | string = {}): Plugin {
  // 兼容旧版本的字符串参数
  const config: SandcastlePluginOptions = typeof options === "string" ? { cesiumBaseUrl: options } : options;

  let cesiumBaseUrl = config.cesiumBaseUrl ?? "/cesium/";
  const sandcastleOutDirName = config.sandcastleOutDir ?? "templates";
  // 确保路径以 / 结尾
  if (!cesiumBaseUrl.endsWith("/")) {
    cesiumBaseUrl += "/";
  }

  // 存储构建后的输出目录，供 closeBundle 使用
  let resolvedConfig: ResolvedConfig;
  // 判断当前是否为构建模式
  let isBuild = false;

  return {
    name: "sandcastle-config",

    config(_, { command }) {
      isBuild = command === "build";
      return {
        define: {
          // Cesium 静态资源路径（用于 bucket.html 的内联脚本和 JS 模块）
          __CESIUM_BASE_URL__: JSON.stringify(cesiumBaseUrl),
          // iframe 通信的 origin：同源部署下使用 location.origin 在运行时动态获取
          __INNER_ORIGIN__: "location.origin",
          __OUTER_ORIGIN__: "location.origin"
        }
      };
    },

    configResolved(config) {
      resolvedConfig = config;
    },

    transformIndexHtml: {
      // 必须在其他 transformIndexHtml 钩子（如 vite-cesium-plugin）之前执行，
      // 以确保 __CESIUM_BASE_URL__ 占位符先被替换，再让其他插件处理 HTML
      order: "pre",
      handler(html) {
        // 替换 HTML 中所有 __CESIUM_BASE_URL__ 文本占位符
        // （包括 href 属性和内联脚本中的字符串字面量）
        return html.replaceAll("__CESIUM_BASE_URL__", cesiumBaseUrl);
      }
    },

    async closeBundle() {
      // 构建结束后，使用 esbuild 将 Sandcastle.ts 编译为独立 JS 文件并写入 dist
      // bucket.html 通过 <script> 标签加载 Sandcastle.ts，Vite 在构建时会处理该入口；
      // 此步骤同时编译一份独立的 ESM 文件供其他场景使用，并生成 .d.ts 类型声明
      if (!isBuild) return;

      const root = resolvedConfig.root;
      const outDir = resolvedConfig.build.outDir;
      const sandcastleSrc = resolve(root, "templates/Sandcastle.ts");
      const sandcastleOutDir = resolve(outDir, sandcastleOutDirName);
      const sandcastleOut = resolve(sandcastleOutDir, "Sandcastle.js");

      // 确保输出目录存在
      mkdirSync(sandcastleOutDir, { recursive: true });

      try {
        // 使用 esbuild JavaScript API 编译 Sandcastle.ts（ESM 格式，不打包依赖）
        // esbuild 由 Vite 安装，无需额外依赖；使用 JS API 替代 CLI 以避免 Windows 上 npx.cmd 的 EINVAL 错误
        const { build: esbuildBuild } = await import("esbuild");
        await esbuildBuild({
          entryPoints: [sandcastleSrc],
          outfile: sandcastleOut,
          format: "esm",
          bundle: false,
          target: "esnext",
          define: {
            __OUTER_ORIGIN__: '""'
          },
          logLevel: "warning"
        });
      } catch (err) {
        // esbuild 编译失败时，回退为简单复制源文件（开发阶段仍可正常工作）
        console.warn("Sandcastle.ts 编译失败，尝试复制源文件:", err instanceof Error ? err.message : err);
        const { readFileSync } = await import("node:fs");
        const src = readFileSync(sandcastleSrc, "utf-8");
        writeFileSync(sandcastleOut, src);
      }

      // 生成类型声明文件（供 Monaco 编辑器智能提示使用）
      const sandcastleDts = resolve(sandcastleOutDir, "Sandcastle.d.ts");
      writeFileSync(
        sandcastleDts,
        [
          "/**",
          " * Sandcastle 辅助工具的类型声明",
          " * 由 sandcastlePlugin 在构建时自动生成",
          " */",
          "declare const Sandcastle: {",
          "  _registered: Map<any, number>;",
          "  reset(): void;",
          "  declare(key: any): void;",
          "  highlight(key: any): void;",
          "  finishedLoading(): void;",
          "  addToggleButton(text: string, checked: boolean, onchange: (newValue: boolean) => void, toolbarId?: string): void;",
          "  addToolbarButton(text: string, onclick: () => void, toolbarId?: string): void;",
          "  addDefaultToolbarButton(text: string, onclick: () => void, toolbarId?: string): void;",
          "  addToolbarMenu(options: Array<{text: string; value: string; onselect: () => void}>, toolbarId?: string): void;",
          "  addDefaultToolbarMenu(options: Array<{text: string; value: string; onselect: () => void}>, toolbarId?: string): void;",
          "};",
          "export default Sandcastle;"
        ].join("\n")
      );
    }
  };
}
