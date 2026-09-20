import fs from "fs-extra";
import path from "node:path";
import { type Plugin, type ResolvedConfig } from "vite";

import {
  BUCKET_CLIENT_ENTRY_NAME,
  type Bundle,
  CESIUM_EXTS_ENTRY_NAME,
  CESIUM_EXTS_PLACEHOLDER,
  findEntryFileName,
  registerBuildEntry,
  toPublicUrl
} from "./shared.ts";

/**
 * `vite-cesium-sandcastle` 插件配置项。
 *
 * 该插件用于 Cesium Sandcastle 风格的示例项目，
 * 为示例代码的 iframe Runtime 提供构建阶段的资源处理能力。
 *
 * 主要功能：
 *
 * - 替换 HTML 中的 Cesium 基础资源路径占位符；
 * - 为开发环境和生产环境提供不同的 Cesium 资源地址；
 * - 将 `bucket-client` 注册为独立的构建入口；
 * - 将构建后的 `bucket-client` / `cesium-exts` Chunk 注入 `bucket.html`；
 * - 将 Sandcastle 模板复制到最终构建目录；
 * - 将 Tweakpane Runtime 文件复制到最终构建目录。
 */
export interface ViteCesiumSandcastleOptions {
  /**
   * Cesium 基础资源 URL 的 HTML 占位符。
   *
   * 插件会在经过 Vite 处理的 HTML 中查找该字符串，
   * 并将其替换为当前环境对应的 Cesium 基础资源 URL。
   *
   * @default "__CESIUM_BASE_URL__"
   *
   * @example
   * ```html
   * <script>
   *   window.CESIUM_BASE_URL = "__CESIUM_BASE_URL__";
   * </script>
   * ```
   */
  placeholder?: string;

  /**
   * 生产环境使用的 Cesium 基础资源 URL。
   *
   * 该地址同时用于生产环境的 `index.html` 和 `bucket.html`。
   *
   * @default "/cesium/"
   *
   * @example
   * ```ts
   * cesiumBaseUrl: "/assets/cesium/"
   * ```
   */
  cesiumBaseUrl?: string;

  /**
   * 开发环境使用的 Cesium 基础资源 URL。
   *
   * 开发环境优先使用该配置。
   * 如果未配置，则回退到 {@link ViteCesiumSandcastleOptions.cesiumBaseUrl}。
   *
   * @example
   * ```ts
   * devCesiumBaseUrl: "http://localhost:8080/cesium/"
   * ```
   */
  devCesiumBaseUrl?: string;

  /**
   * `bucket-client` 源文件路径。
   *
   * 路径相对于 Vite 的 {@link ResolvedConfig.root}。
   *
   * 开发环境下，Vite 可以直接处理该 TypeScript 文件。
   *
   * 生产环境下，该文件会被注册为独立的构建入口，
   * 最终生成带 hash 的 JavaScript Chunk。
   *
   * @example
   * ```ts
   * bucketClientEntry: "src/util/bucket-client.ts"
   * ```
   */
  bucketClientEntry?: string;

  /**
   * Sandcastle `bucket.html` 模板路径。
   *
   * 路径相对于 Vite 的 {@link ResolvedConfig.root}。
   *
   * 生产构建时，插件会将该模板复制到 `build.outDir`
   * 对应的构建产物目录，并处理其中的 Runtime 资源引用。
   *
   * @default "templates/bucket.html"
   *
   * @example
   * ```ts
   * bucketHtmlPath: "templates/bucket.html"
   * ```
   */
  bucketHtmlPath?: string;

  /**
   * Tweakpane Runtime URL 在 import map 中的占位符。
   *
   * 插件会在经过 Vite 处理的 `bucket.html` 中查找该字符串，
   * 并根据当前环境（dev / prod）替换为对应的 Tweakpane URL，
   * 以便 iframe 内由父窗口注入的用户代码可以使用
   * `import { Pane } from "tweakpane"` 这样的裸说明符。
   *
   * 占位符必须出现在 `<script type="importmap">` 中。
   *
   * @default "__TWEAKPANE_URL__"
   *
   * @example
   * ```html
   * <script type="importmap">
   *   { "imports": { "tweakpane": "__TWEAKPANE_URL__" } }
   * </script>
   * ```
   */
  tweakpanePlaceholder?: string;

  /**
   * 生产环境使用的 Tweakpane Runtime URL。
   *
   * 该地址指向 `closeBundle` 钩子复制到
   * `${build.outDir}/public/tweakpane.min.js` 的构建产物。
   *
   * 当应用部署在子路径下时（如 GitHub Pages），
   * 应配置为带前缀的绝对路径，例如 `/cesium-examples/public/tweakpane.min.js`。
   *
   * @default "/public/tweakpane.min.js"
   *
   * @example
   * ```ts
   * tweakpaneUrl: "/assets/tweakpane.min.js"
   * ```
   */
  tweakpaneUrl?: string;

  /**
   * 开发环境使用的 Tweakpane Runtime URL。
   *
   * 开发环境优先使用该配置。
   * 如果未配置，则回退到 {@link ViteCesiumSandcastleOptions.tweakpaneUrl}。
   *
   * Vite 的开发服务器会直接服务项目根目录下的 `node_modules` 文件，
   * 因此默认使用相对于 `templates/bucket.html` 的相对路径即可。
   *
   * @default "../node_modules/tweakpane/dist/tweakpane.min.js"
   *
   * @example
   * ```ts
   * devTweakpaneUrl: "http://localhost:8080/tweakpane.min.js"
   * ```
   */
  devTweakpaneUrl?: string;
}

/**
 * Tweakpane Runtime 源文件路径。
 *
 * 该文件位于当前项目的 `node_modules` 中，
 * 生产构建时会复制到构建产物目录。
 */
const TWEAKPANE_SOURCE = "tweakpane/dist/tweakpane.min.js";

/**
 * Tweakpane Runtime 在构建产物中的目标路径。
 */
const TWEAKPANE_TARGET = path.join("public", "tweakpane.min.js");

/**
 * `bucket-client` 源文件在 `bucket.html` 中的引用路径。
 *
 * 生产构建时，该路径会被替换为 Vite/Rolldown
 * 实际生成的 `bucket-client` Chunk URL。
 *
 * @deprecated
 * 推荐使用独立的 `bucket-client` 占位符，
 * 避免将源码目录结构与生产模板绑定。
 */
const BUCKET_CLIENT_SOURCE_REF = "../src/util/bucket-client.ts";

const DEFAULT_TWEAKPANE_PLACEHOLDER = "__TWEAKPANE_URL__";
const DEFAULT_TWEAKPANE_URL = "/public/tweakpane.min.js";
const DEFAULT_DEV_TWEAKPANE_URL = "../node_modules/tweakpane/dist/tweakpane.min.js";

/**
 * Vite Cesium Sandcastle 插件。
 *
 * 该插件用于处理 Cesium Sandcastle 风格示例项目的
 * 开发环境与生产环境资源差异。
 *
 * 生产构建时，插件会将 `bucket-client` 与（若已注册）`cesium-exts`
 * 的 hashed chunk 写回 `bucket.html`，使 iframe 加载构建后的 Runtime。
 *
 * @param options - Sandcastle 插件配置。
 * @returns Vite 插件实例。
 *
 * @example
 * ```ts
 * import { defineConfig } from "vite";
 * import { cesiumExtsDev, cesiumSandcastle } from "vite-cesium-sandcastle";
 *
 * export default defineConfig({
 *   plugins: [
 *     cesiumExtsDev(),
 *     cesiumSandcastle({
 *       cesiumBaseUrl: "/cesium/",
 *       bucketClientEntry: "src/util/bucket-client.ts",
 *     }),
 *   ],
 * });
 * ```
 */
export function cesiumSandcastle(options: ViteCesiumSandcastleOptions = {}): Plugin {
  const {
    placeholder = "__CESIUM_BASE_URL__",
    cesiumBaseUrl = "/cesium/",
    devCesiumBaseUrl,
    bucketClientEntry,
    bucketHtmlPath = "templates/bucket.html",
    tweakpanePlaceholder = DEFAULT_TWEAKPANE_PLACEHOLDER,
    tweakpaneUrl = DEFAULT_TWEAKPANE_URL,
    devTweakpaneUrl = DEFAULT_DEV_TWEAKPANE_URL
  } = options;

  let config: ResolvedConfig | undefined;

  return {
    name: "vite-cesium-sandcastle",

    configResolved(resolvedConfig) {
      config = resolvedConfig;

      if (config.command !== "build" || !bucketClientEntry) {
        return;
      }

      registerBuildEntry(config, BUCKET_CLIENT_ENTRY_NAME, path.resolve(config.root, bucketClientEntry));
    },

    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const isDev = config?.command === "serve";
        const finalBaseUrl = isDev && devCesiumBaseUrl ? devCesiumBaseUrl : cesiumBaseUrl;
        const finalTweakpaneUrl = isDev && devTweakpaneUrl ? devTweakpaneUrl : tweakpaneUrl;

        return html.replaceAll(placeholder, finalBaseUrl).replaceAll(tweakpanePlaceholder, finalTweakpaneUrl);
      }
    },

    async writeBundle(_options, bundle) {
      if (!config || config.command !== "build") {
        return;
      }

      const templatesSource = path.resolve(config.root, path.dirname(bucketHtmlPath));
      const templatesTarget = path.resolve(config.root, config.build.outDir, path.dirname(bucketHtmlPath));
      const distBucketHtml = path.resolve(config.root, config.build.outDir, bucketHtmlPath);

      try {
        await fs.copy(templatesSource, templatesTarget);
        await rewriteBucketHtml({
          distBucketHtml,
          bundle: bundle as Bundle,
          base: config.base,
          placeholder,
          cesiumBaseUrl,
          tweakpanePlaceholder,
          tweakpaneUrl
        });
      } catch (error) {
        console.error("[vite-cesium-sandcastle] Failed to process templates:", error);
      }
    },

    async closeBundle() {
      if (!config || config.command !== "build") {
        return;
      }

      const tweakpaneSource = path.resolve(config.root, "node_modules", TWEAKPANE_SOURCE);
      const tweakpaneTarget = path.resolve(config.root, config.build.outDir, TWEAKPANE_TARGET);

      try {
        await fs.ensureDir(path.dirname(tweakpaneTarget));
        await fs.copyFile(tweakpaneSource, tweakpaneTarget);
      } catch (error) {
        console.error("[vite-cesium-sandcastle] Failed to copy tweakpane asset:", error);
      }
    }
  };
}

export default cesiumSandcastle;

/**
 * 改写生产环境中的 `bucket.html`。
 *
 * 处理：
 *
 * 1. Cesium 基础资源 URL；
 * 2. Tweakpane Runtime URL；
 * 3. `bucket-client` 构建产物 URL；
 * 4. `cesium-exts` 构建产物 URL（由 `cesiumExtsDev` 注册入口时才会出现）。
 */
async function rewriteBucketHtml(params: {
  distBucketHtml: string;
  bundle: Bundle | undefined;
  base: string;
  placeholder: string;
  cesiumBaseUrl: string;
  tweakpanePlaceholder: string;
  tweakpaneUrl: string;
}): Promise<void> {
  const { distBucketHtml, bundle, base, placeholder, cesiumBaseUrl, tweakpanePlaceholder, tweakpaneUrl } = params;

  if (!(await fs.pathExists(distBucketHtml))) {
    return;
  }

  let content = await fs.readFile(distBucketHtml, "utf-8");
  content = content.replaceAll(placeholder, cesiumBaseUrl);
  content = content.replaceAll(tweakpanePlaceholder, tweakpaneUrl);

  const bucketClientFile = findEntryFileName(bundle, BUCKET_CLIENT_ENTRY_NAME);
  if (bucketClientFile) {
    content = content.replaceAll(BUCKET_CLIENT_SOURCE_REF, toPublicUrl(bucketClientFile, base));
  }

  const cesiumExtsFile = findEntryFileName(bundle, CESIUM_EXTS_ENTRY_NAME);
  if (cesiumExtsFile) {
    content = content.replaceAll(CESIUM_EXTS_PLACEHOLDER, toPublicUrl(cesiumExtsFile, base));
  }

  await fs.writeFile(distBucketHtml, content, "utf-8");
}
