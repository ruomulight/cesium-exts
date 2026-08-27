import type { Plugin, ResolvedConfig } from "vite";

import fs from "fs-extra";
import path from "node:path";

/**
 * Vite/Rolldown `writeBundle` 钩子中 Bundle Chunk 的最小类型定义。
 *
 * 本插件只依赖 Entry Chunk 的少量字段，因此不直接引入
 * Rollup/Rolldown 的完整 Bundle 类型。
 *
 * 使用局部类型可以：
 *
 * - 避免依赖底层构建工具的内部类型；
 * - 减少插件的类型依赖范围；
 * - 降低 Vite/Rolldown 版本变化对插件类型的影响。
 *
 * 字段定义与 Rolldown `OutputChunk` 的相关字段保持一致。
 */
interface BundleChunk {
  /**
   * Bundle 项类型。
   */
  type: "chunk";

  /**
   * 当前 Chunk 是否为构建入口。
   */
  isEntry?: boolean;

  /**
   * Entry 名称。
   *
   * 当 `bucket-client` 被注册为独立 Entry 时，
   * 该值为 `bucket-client`。
   */
  name?: string;

  /**
   * Chunk 在构建产物中的相对文件路径。
   *
   * @example
   * ```text
   * js/bucket-client.DuVT7p4B.js
   * ```
   */
  fileName: string;
}

/**
 * Vite/Rolldown Bundle Asset 的最小类型定义。
 */
interface BundleAsset {
  /**
   * Bundle 项类型。
   */
  type: "asset";

  /**
   * Asset 在构建产物中的相对文件路径。
   */
  fileName: string;
}

/**
 * Vite/Rolldown Bundle 项。
 */
type BundleItem = BundleChunk | BundleAsset;

/**
 * Vite/Rolldown `writeBundle` 钩子中的 Bundle 参数类型。
 *
 * 使用局部类型，仅描述本插件实际访问的 Bundle 字段。
 */
type Bundle = Record<string, BundleItem>;

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
 * - 将构建后的 `bucket-client` Chunk 注入 `bucket.html`；
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
   * 如果未配置，则回退到 {@link cesiumBaseUrl}。
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
}

/**
 * Tweakpane Runtime 源文件路径。
 *
 * 该文件位于当前项目的 `node_modules` 中，
 * 生产构建时会复制到构建产物目录。
 *
 * @example
 * ```text
 * node_modules/tweakpane/dist/tweakpane.min.js
 * ```
 */
const TWEAKPANE_SOURCE = "tweakpane/dist/tweakpane.min.js";

/**
 * Tweakpane Runtime 在构建产物中的目标路径。
 *
 * @example
 * ```text
 * dist/public/tweakpane.min.js
 * ```
 */
const TWEAKPANE_TARGET = path.join("public", "tweakpane.min.js");

/**
 * `bucket-client` 在 Vite/Rolldown 中使用的 Entry 名称。
 *
 * 该名称需要与 `build.rolldownOptions.input`
 * 或 `build.rollupOptions.input` 中注册的 Entry 保持一致。
 *
 * 当配置了：
 *
 * ```ts
 * bucketClientEntry: "src/util/bucket-client.ts"
 * ```
 *
 * 时，构建器会生成类似：
 *
 * ```text
 * js/bucket-client.<hash>.js
 * ```
 */
const BUCKET_CLIENT_ENTRY_NAME = "bucket-client";

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

/**
 * Vite Cesium Sandcastle 插件。
 *
 * 该插件用于处理 Cesium Sandcastle 风格示例项目的
 * 开发环境与生产环境资源差异。
 *
 * 生产构建时，插件会将：
 *
 * ```text
 * bucket-client.ts
 *        ↓
 * Vite/Rolldown
 *        ↓
 * bucket-client.<hash>.js
 *        ↓
 * bucket.html
 * ```
 *
 * 连接起来，使 iframe 在生产环境中加载构建后的 Runtime，
 * 而不是继续请求项目源码中的 TypeScript 文件。
 *
 * @param options - Sandcastle 插件配置。
 * @returns Vite 插件实例。
 *
 * @example
 * ```ts
 * import { defineConfig } from "vite";
 * import viteCesiumSandcastle from "vite-cesium-sandcastle";
 *
 * export default defineConfig({
 *   plugins: [
 *     viteCesiumSandcastle({
 *       cesiumBaseUrl: "/cesium/",
 *       devCesiumBaseUrl: "http://localhost:8080/cesium/",
 *       bucketClientEntry: "src/util/bucket-client.ts",
 *       bucketHtmlPath: "templates/bucket.html",
 *     }),
 *   ],
 * });
 * ```
 */
export default function viteCesiumSandcastle(options: ViteCesiumSandcastleOptions = {}): Plugin {
  const {
    placeholder = "__CESIUM_BASE_URL__",
    cesiumBaseUrl = "/cesium/",
    devCesiumBaseUrl,
    bucketClientEntry,
    bucketHtmlPath = "templates/bucket.html"
  } = options;

  /**
   * Vite 完成配置解析后的最终配置。
   *
   * 使用 `configResolved` 保存最终配置，
   * 确保后续生命周期钩子能够访问 Vite 合并后的完整配置。
   */
  let config: ResolvedConfig | undefined;

  return {
    name: "vite-cesium-sandcastle",

    /**
     * 保存 Vite 最终解析后的配置，
     * 并在生产构建时注册 `bucket-client` Entry。
     *
     * `bucket-client` 在开发环境可以直接由 Vite
     * 通过 TypeScript 源文件提供。
     *
     * 但在生产环境中，iframe 不能继续引用：
     *
     * ```text
     * ../src/util/bucket-client.ts
     * ```
     *
     * 因此需要将其作为独立 Entry 交给 Vite/Rolldown 构建。
     *
     * 同时兼容 Vite 8 的 `rolldownOptions`
     * 和旧版本的 `rollupOptions`。
     */
    configResolved(resolvedConfig) {
      config = resolvedConfig;

      if (config.command !== "build" || !bucketClientEntry) {
        return;
      }

      /**
       * 将 bucket-client 源文件转换为绝对路径，
       * 确保构建器能够正确解析 Entry。
       */
      const entryPath = path.resolve(config.root, bucketClientEntry);

      const rolldownOptions = config.build.rolldownOptions;

      const rollupOptions = config.build.rollupOptions;

      /**
       * 优先使用 Vite 8 的 Rolldown 配置，
       * 同时兼容仍使用 Rollup 配置的 Vite 版本。
       */
      const targetOptions = rolldownOptions ?? rollupOptions;

      if (!targetOptions) {
        return;
      }

      let inputs = targetOptions.input;

      /**
       * 用户没有配置多入口时，
       * 将原有 `index.html` 与 `bucket-client`
       * 一起注册为构建入口。
       *
       * 显式保留 `index.html` 可以避免新增 Entry 时
       * 覆盖 Vite 原有的应用入口。
       */
      if (inputs === undefined) {
        const indexHtml = path.resolve(config.root, "index.html");

        inputs = {
          index: indexHtml,
          [BUCKET_CLIENT_ENTRY_NAME]: entryPath
        };

        targetOptions.input = inputs;

        return;
      }

      /**
       * 用户使用字符串或数组配置 Entry 时，
       * 不修改其结构，以避免改变用户原有的构建行为。
       */
      if (typeof inputs !== "object" || Array.isArray(inputs)) {
        return;
      }

      /**
       * 如果用户已经定义同名 Entry，
       * 则不重复注入。
       */
      if (BUCKET_CLIENT_ENTRY_NAME in inputs) {
        return;
      }

      inputs[BUCKET_CLIENT_ENTRY_NAME] = entryPath;
    },

    /**
     * 在 Vite 处理 `index.html` 之前替换
     * Cesium 基础资源 URL。
     *
     * 开发环境：
     *
     * ```text
     * devCesiumBaseUrl
     *        ↓
     * cesiumBaseUrl
     * ```
     *
     * 生产环境：
     *
     * ```text
     * cesiumBaseUrl
     * ```
     */
    transformIndexHtml: {
      order: "pre",

      /**
       * 替换 HTML 中的 Cesium 基础资源占位符。
       */
      handler(html) {
        const isDev = config?.command === "serve";

        const finalBaseUrl = isDev && devCesiumBaseUrl ? devCesiumBaseUrl : cesiumBaseUrl;

        return html.replaceAll(placeholder, finalBaseUrl);
      }
    },

    /**
     * 在构建产物写入磁盘后处理 Sandcastle 模板。
     *
     * 主要负责：
     *
     * 1. 将 `templates` 目录复制到构建产物；
     * 2. 找到构建后的 `bucket-client` Chunk；
     * 3. 修改生产环境中的 `bucket.html`；
     * 4. 替换 Cesium 基础资源 URL；
     * 5. 替换 `bucket-client` Runtime 引用。
     *
     * 使用 `writeBundle` 是因为该阶段可以访问最终 Bundle，
     * 从而获得带 hash 的 `bucket-client` 文件名。
     */
    async writeBundle(_options, bundle) {
      if (!config || config.command !== "build") {
        return;
      }

      /**
       * 模板源目录。
       *
       * `bucketHtmlPath` 默认位于 `templates` 目录，
       * 因此这里根据模板路径动态确定其所在目录。
       */
      const templatesSource = path.resolve(config.root, path.dirname(bucketHtmlPath));

      /**
       * 模板构建产物目录。
       */
      const templatesTarget = path.resolve(config.root, config.build.outDir, path.dirname(bucketHtmlPath));

      /**
       * bucket.html 在最终构建产物中的绝对路径。
       */
      const distBucketHtml = path.resolve(config.root, config.build.outDir, bucketHtmlPath);

      try {
        /**
         * 将 Sandcastle 模板复制到最终构建目录。
         *
         * 必须先复制模板，再修改构建产物中的 bucket.html。
         */
        await fs.copy(templatesSource, templatesTarget);

        /**
         * 修改复制后的 bucket.html，
         * 将源码引用转换为生产 Runtime 引用。
         */
        await rewriteBucketHtml({
          distBucketHtml,
          bundle,
          placeholder,
          cesiumBaseUrl
        });
      } catch (error) {
        console.error("[vite-cesium-sandcastle] Failed to process templates:", error);
      }
    },

    /**
     * 在生产构建完成后复制 Tweakpane Runtime 文件。
     *
     * Tweakpane 在开发环境中可以直接从 `node_modules`
     * 提供，因此仅在生产构建阶段复制。
     */
    async closeBundle() {
      if (!config || config.command !== "build") {
        return;
      }

      /**
       * Tweakpane 源文件的绝对路径。
       */
      const tweakpaneSource = path.resolve(config.root, "node_modules", TWEAKPANE_SOURCE);

      /**
       * Tweakpane 构建产物的绝对路径。
       */
      const tweakpaneTarget = path.resolve(config.root, config.build.outDir, TWEAKPANE_TARGET);

      try {
        /**
         * 确保目标目录存在后复制 Runtime 文件。
         */
        await fs.ensureDir(path.dirname(tweakpaneTarget));

        await fs.copyFile(tweakpaneSource, tweakpaneTarget);
      } catch (error) {
        console.error("[vite-cesium-sandcastle] Failed to copy tweakpane asset:", error);
      }
    }
  };
}

/**
 * 改写生产环境中的 `bucket.html`。
 *
 * 主要处理两个资源引用：
 *
 * 1. Cesium 基础资源 URL；
 * 2. `bucket-client` 构建产物 URL。
 *
 * `bucket-client` 如果没有成功生成对应 Chunk，
 * 则保持原始引用不变，避免插件生成一个错误的资源地址。
 *
 * @param params - bucket.html 改写参数。
 * @returns Promise，在 HTML 写入完成后 resolve。
 */
async function rewriteBucketHtml(params: {
  /**
   * 构建产物中的 bucket.html 绝对路径。
   */
  distBucketHtml: string;

  /**
   * Vite/Rolldown 最终 Bundle。
   */
  bundle: Bundle | undefined;

  /**
   * Cesium 基础资源 URL 占位符。
   */
  placeholder: string;

  /**
   * 生产环境 Cesium 基础资源 URL。
   */
  cesiumBaseUrl: string;
}): Promise<void> {
  const { distBucketHtml, bundle, placeholder, cesiumBaseUrl } = params;

  /**
   * 模板不存在时直接跳过。
   *
   * 这样可以允许插件在没有 Sandcastle 模板的项目中正常运行。
   */
  if (!(await fs.pathExists(distBucketHtml))) {
    return;
  }

  /**
   * 查找 bucket-client 的实际构建产物。
   */
  const bucketClientPath = findBucketClientPath(bundle);

  /**
   * 读取构建产物中的 bucket.html。
   */
  let content = await fs.readFile(distBucketHtml, "utf-8");

  /**
   * 替换 Cesium 基础资源 URL。
   */
  content = content.replaceAll(placeholder, cesiumBaseUrl);

  /**
   * 如果成功找到 bucket-client Chunk，
   * 则将源码引用替换为实际构建产物路径。
   */
  if (bucketClientPath) {
    content = content.replaceAll(BUCKET_CLIENT_SOURCE_REF, bucketClientPath);
  }

  /**
   * 将修改后的 HTML 写回构建产物。
   */
  await fs.writeFile(distBucketHtml, content, "utf-8");
}

/**
 * 从 Vite/Rolldown Bundle 中查找 `bucket-client` Entry Chunk。
 *
 * 通过 Entry 名称定位，而不是依赖 hash 后的文件名，
 * 因为 hash 文件名会随着每次构建内容变化。
 *
 * @param bundle - Vite/Rolldown 最终构建 Bundle。
 * @returns bucket-client Chunk 的 URL。
 *
 * @example
 * ```text
 * /js/bucket-client.DuVT7p4B.js
 * ```
 *
 * @returns
 * 当 Bundle 不存在或找不到对应 Entry 时返回 `undefined`。
 */
function findBucketClientPath(bundle: Bundle | undefined): string | undefined {
  if (!bundle) {
    return undefined;
  }

  /**
   * 查找由 `bucketClientEntry` 注入的 Entry Chunk。
   */
  const chunk = Object.values(bundle).find(
    (item): item is BundleChunk =>
      item.type === "chunk" && item.isEntry === true && item.name === BUCKET_CLIENT_ENTRY_NAME
  );

  if (!chunk) {
    return undefined;
  }

  /**
   * bucket.html 当前使用根路径加载 Chunk。
   *
   * 例如：
   *
   * ```text
   * js/bucket-client.ABC123.js
   *        ↓
   * /js/bucket-client.ABC123.js
   * ```
   */
  return `/${chunk.fileName}`;
}
