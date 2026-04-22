import fs from "fs-extra";
import path from "path";
import externalGlobals from "rollup-plugin-external-globals";
import serveStatic from "serve-static";
import { type HtmlTagDescriptor, normalizePath, type Plugin, type UserConfig } from "vite";

/**
 * 传递给 vite-plugin-cesium 插件的配置选项。
 * @interface VitePluginCesiumOptions
 */
interface VitePluginCesiumOptions {
  /**
   * 是否使用 Vite（Rollup）重新构建 Cesium 库。
   * - `true`: 将 Cesium 源码打包进你的应用产物中。
   * - `false`: 将 Cesium 视为外部依赖（External），通过 `<script>` 标签引入，并在构建时直接复制 `Cesium.js` 文件。
   * @default false
   */
  rebuildCesium?: boolean;

  /**
   * 在开发环境 (`vite dev`) 下，是否使用压缩版的 Cesium 代码。
   * - `true`: 提供 `Build/Cesium` 目录下的压缩代码。
   * - `false`: 提供 `Build/CesiumUnminified` 目录下的未压缩代码（更利于开发时调试）。
   * @default false
   */
  devMinifyCesium?: boolean;

  /**
   * Cesium `Build` 目录在 `node_modules` 中的根路径。
   * 如果你使用了 Cesium 的魔改分支或特定的包管理器结构，可以修改此项。
   * @default "node_modules/cesium/Build"
   */
  cesiumBuildRootPath?: string;

  /**
   * 压缩版 Cesium 目录的路径。
   * 主要用于在生产环境构建阶段 (`vite build`) 复制静态资源（Assets, Workers, Widgets 等）。
   * @default "node_modules/cesium/Build/Cesium/"
   */
  cesiumBuildPath?: string;

  /**
   * Cesium 静态资源在开发服务器和生产环境中的基础访问路径。
   * 插件会自动将此值挂载为全局变量 `window.CESIUM_BASE_URL`。
   * @default "cesium/"
   */
  cesiumBaseUrl?: string;
}

/**
 * Vite Plugin 核心函数，用于在 Vite 项目中无缝集成 CesiumJS。
 *
 * 主要功能包含：
 * 1. 开发环境下提供静态资源代理，解决请求 404 和跨域问题。
 * 2. 自动注入 `window.CESIUM_BASE_URL` 环境变量。
 * 3. 生产环境下自动将 Cesium 所需的 Assets、Workers、Widgets 等目录复制到打包产物中。
 * 4. 自动向 `index.html` 中注入 Cesium 必需的 CSS 和 JS 标签。
 *
 * @param options - 插件配置项 (可选)
 * @returns 返回一个 Vite Plugin 对象
 *
 * @example
 * ```ts
 * // vite.config.ts
 * import { defineConfig } from 'vite';
 * import cesium from 'vite-plugin-cesium';
 *
 * export default defineConfig({
 *   plugins: [
 *     cesium({ rebuildCesium: false })
 *   ]
 * });
 * ```
 */
export default function vitePluginCesium(options: VitePluginCesiumOptions = {}): Plugin {
  const {
    rebuildCesium = false,
    devMinifyCesium = false,
    cesiumBuildRootPath = "node_modules/cesium/Build",
    cesiumBuildPath = "node_modules/cesium/Build/Cesium/",
    cesiumBaseUrl = "cesium/"
  } = options;

  let CESIUM_BASE_URL = cesiumBaseUrl;
  if (!CESIUM_BASE_URL.endsWith("/")) {
    CESIUM_BASE_URL += "/";
  }
  let outDir = "dist";
  let base: string = "/";
  let isBuild: boolean = false;

  return {
    name: "vite-plugin-cesium",

    config(c, { command }) {
      isBuild = command === "build";
      if (c.base !== undefined) {
        base = c.base;
        if (base === "") base = "./";
      }
      if (c.build?.outDir) {
        if (c.root !== undefined) {
          outDir = path.join(c.root, c.build.outDir);
        } else {
          outDir = c.build.outDir;
        }
      }
      CESIUM_BASE_URL = path.posix.join(base, CESIUM_BASE_URL);
      const userConfig: UserConfig = {};
      if (!isBuild) {
        // ----------- 开发环境配置 -----------
        userConfig.define = {
          CESIUM_BASE_URL: JSON.stringify(CESIUM_BASE_URL)
        };
      } else {
        // ----------- 生产构建配置 ------------
        if (rebuildCesium) {
          // 模式 1：通过打包器重新编译 Cesium
          userConfig.build = {
            assetsInlineLimit: 0,
            chunkSizeWarningLimit: 5000,
            rollupOptions: {
              output: {
                intro: `window.CESIUM_BASE_URL = ${JSON.stringify(CESIUM_BASE_URL)};`
              }
            }
          };
        } else {
          // 模式 2：将 Cesium 外部化处理，随后复制 Cesium.js
          userConfig.build = {
            rollupOptions: {
              external: ["cesium"],
              plugins: [externalGlobals({ cesium: "Cesium" })]
            }
          };
        }
      }
      return userConfig;
    },

    configureServer({ middlewares }) {
      // 在开发服务器中拦截对 Cesium 目录的请求并提供静态文件服务
      const cesiumPath = path.join(cesiumBuildRootPath, devMinifyCesium ? "Cesium" : "CesiumUnminified");
      middlewares.use(
        path.posix.join("/", CESIUM_BASE_URL),
        serveStatic(cesiumPath, {
          setHeaders: (res, path, stat) => {
            res.setHeader("Access-Control-Allow-Origin", "*");
          }
        })
      );
    },

    async closeBundle() {
      if (isBuild) {
        try {
          // 构建结束后，复制静态资源到 dist 目录
          await fs.copy(path.join(cesiumBuildPath, "Assets"), path.join(outDir, CESIUM_BASE_URL, "Assets"));
          await fs.copy(path.join(cesiumBuildPath, "ThirdParty"), path.join(outDir, CESIUM_BASE_URL, "ThirdParty"));
          await fs.copy(path.join(cesiumBuildPath, "Workers"), path.join(outDir, CESIUM_BASE_URL, "Workers"));
          await fs.copy(path.join(cesiumBuildPath, "Widgets"), path.join(outDir, CESIUM_BASE_URL, "Widgets"));
          if (!rebuildCesium) {
            await fs.copy(path.join(cesiumBuildPath, "Cesium.js"), path.join(outDir, CESIUM_BASE_URL, "Cesium.js"));
          }
        } catch (err) {
          console.error("VitePluginCesium: 文件复制失败", err);
        }
      }
    },

    transformIndexHtml() {
      // 自动向 index.html 的 head/body 注入引用标签
      const tags: HtmlTagDescriptor[] = [
        {
          tag: "link",
          attrs: {
            rel: "stylesheet",
            href: normalizePath(path.join(CESIUM_BASE_URL, "Widgets/widgets.css"))
          }
        }
      ];
      if (isBuild && !rebuildCesium) {
        tags.push({
          tag: "script",
          attrs: {
            src: normalizePath(path.join(CESIUM_BASE_URL, "Cesium.js"))
          }
        });
      }
      return tags;
    }
  };
}
