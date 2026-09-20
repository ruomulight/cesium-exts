import { resolve } from "node:path";
import { normalizePath, type ResolvedConfig } from "vite";

/** iframe importmap 中 cesium-exts 地址的占位符。 */
export const CESIUM_EXTS_PLACEHOLDER = "__CESIUM_EXTS_URL__";

/** 库源码变更后通知示例应用重跑 iframe 的 HMR 事件名。 */
export const CESIUM_EXTS_HMR_EVENT = "cesium-exts:update";

/** 生产构建时注册的独立入口名，对应 `js/cesium-exts.[hash].js`。 */
export const CESIUM_EXTS_ENTRY_NAME = "cesium-exts";

/**
 * `bucket-client` 在 Vite/Rolldown 中使用的 Entry 名称。
 *
 * 该名称需要与 `build.rolldownOptions.input`
 * 或 `build.rollupOptions.input` 中注册的 Entry 保持一致。
 */
export const BUCKET_CLIENT_ENTRY_NAME = "bucket-client";

/**
 * Vite/Rolldown `writeBundle` 钩子中 Bundle Chunk 的最小类型定义。
 *
 * 本插件只依赖 Entry Chunk 的少量字段，因此不直接引入
 * Rollup/Rolldown 的完整 Bundle 类型。
 */
export interface BundleChunk {
  type: "chunk";
  isEntry?: boolean;
  name?: string;
  fileName: string;
}

/**
 * Vite/Rolldown Bundle Asset 的最小类型定义。
 */
export interface BundleAsset {
  type: "asset";
  fileName: string;
}

export type BundleItem = BundleChunk | BundleAsset;

/**
 * Vite/Rolldown `writeBundle` 钩子中的 Bundle 参数类型。
 */
export type Bundle = Record<string, BundleItem>;

export function toFsUrl(filePath: string): string {
  return `/@fs/${normalizePath(filePath)}`;
}

export function toPublicUrl(fileName: string, base: string): string {
  if (base === "" || base === "./") {
    return `/${fileName}`;
  }
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${fileName}`.replace(/\/{2,}/g, "/");
}

export function findEntryFileName(bundle: Bundle | undefined, entryName: string): string | undefined {
  if (!bundle) {
    return undefined;
  }

  const chunk = Object.values(bundle).find(
    (item): item is BundleChunk => item.type === "chunk" && item.isEntry === true && item.name === entryName
  );
  return chunk?.fileName;
}

/**
 * 将源文件注册为独立构建入口，同时兼容 Vite 8 的 `rolldownOptions`
 * 和旧版本的 `rollupOptions`。
 *
 * 用户没有配置多入口时，显式保留 `index.html`，避免新增 Entry 覆盖
 * Vite 原有的应用入口。字符串或数组形式的 input 不会被改写。
 */
export function registerBuildEntry(config: ResolvedConfig, entryName: string, entryPath: string): void {
  const targetOptions = config.build.rolldownOptions ?? config.build.rollupOptions;
  if (!targetOptions) {
    return;
  }

  const inputs = targetOptions.input;

  if (inputs === undefined) {
    targetOptions.input = {
      index: resolve(config.root, "index.html"),
      [entryName]: entryPath
    };
    return;
  }

  if (typeof inputs !== "object" || Array.isArray(inputs)) {
    return;
  }

  if (!(entryName in inputs)) {
    inputs[entryName] = entryPath;
  }
}
