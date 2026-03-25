import { build, defineConfig } from "vite";
import baseConfig from "../vite.config.ts";
import { fileURLToPath } from "url";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { dirname, join } from "path";
import { cesiumPathReplace, insertImportMap } from "./vite-plugins.js";
import typescriptCompile from "./typescriptCompile.js";

/** @import { UserConfig, LogLevel } from 'vite' */
/** @import {Target} from 'vite-plugin-static-copy*/

/**
 * @typedef {Object} ImportObject
 * @property {string} path 导入映射中使用的路径。即应用程序可以找到此内容的路径。
 * @property {string} typesPath 在 monaco 中用于智能提示 (intellisense) 的类型路径。
 */

/**
 * @typedef {Object<string, ImportObject>} ImportList
 * 导入列表映射
 */

/**
 * 检查给定的键是否在导入列表中，如果不在则抛出错误
 * @param {ImportList} imports 导入列表
 * @param {string} name 要检查的键名
 */
function checkForImport(imports, name) {
  if (!imports[name]) {
    throw new Error(`Missing import for ${name}`);
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * 创建用于构建 Sandcastle 的 Vite 配置。
 * 设置构建输出目录、Vite 基础路径以及 CesiumJS 文件路径。
 *
 * 最重要的是指定应用程序可以找到库导入的路径。
 *
 * 如果要将文件复制到构建目录，请在尝试构建 Sandcastle 之前确保源文件已存在。
 *
 * @param {object} options 配置选项
 * @param {string} options.outDir 构建文件的输出目录路径
 * @param {string} options.basePath 文件/路由的基础路径
 * @param {string} options.cesiumBaseUrl CesiumJS 的基础路径。应包含 CesiumJS 资产 (assets) 和 web workers 等。
 * @param {string} options.cesiumVersion 在右上角显示的 CesiumJS 版本
 * @param {string} [options.commitSha] 可选的提交哈希，用于显示在应用程序右上角
 * @param {ImportList} options.imports 为 iframe 和独立 HTML 页面添加的导入映射集合。这些路径应匹配在当前环境中可以访问的 URL。
 * @param {string} options.outerOrigin 外部应用程序的域名来源 (Origin)
 * @param {string} options.innerOrigin 内部查看器存储桶 (viewer bucket) 的域名来源 (Origin)。如果未提供，则默认为 outerOrigin。
 * @param {Target[]} [options.copyExtraFiles] 传递给 viteStaticCopy 的额外路径。用于整合单个静态部署的文件（例如在生产模式期间）。源路径应为绝对路径，目标路径应相对于页面根目录。由您负责确保在构建 sandcastle 之前这些文件已存在。
 */
export function createSandcastleConfig({
  outDir,
  basePath,
  cesiumBaseUrl,
  cesiumVersion,
  commitSha,
  imports,
  outerOrigin,
  innerOrigin,
  copyExtraFiles = []
}) {
  if (!cesiumVersion || cesiumVersion === "") {
    throw new Error("Must provide a CesiumJS version");
  }

  /** @type {UserConfig} */
  const config = { ...baseConfig };

  config.base = basePath;

  config.build = {
    ...config.build,
    outDir: outDir
  };

  const copyPlugin = viteStaticCopy({
    targets: [{ src: "templates/Sandcastle.(d.ts|js)", dest: "templates" }, ...copyExtraFiles]
  });

  checkForImport(imports, "cesium");
  checkForImport(imports, "@cesium/engine");
  checkForImport(imports, "@cesium/widgets");
  if (imports["Sandcastle"]) {
    throw new Error("Don't specify the Sandcastle import this is taken care of internally");
  }

  /** @type {Object<string, string>} */
  const importMap = {
    Sandcastle: "../templates/Sandcastle.js"
  };
  /** @type {Object<string, string>} */
  const typePaths = {
    Sandcastle: "templates/Sandcastle.d.ts"
  };
  for (const [key, value] of Object.entries(imports)) {
    importMap[key] = value.path;
    typePaths[key] = value.typesPath;
  }

  if (!innerOrigin || innerOrigin === outerOrigin) {
    console.warn(
      "\nWARNING: If the inner and outer origin are the same there is no browser protection for secrets. Please check your config if this is not intended"
    );
  }

  config.define = {
    ...config.define,
    __VITE_TYPE_IMPORT_PATHS__: JSON.stringify(typePaths),
    __CESIUM_VERSION__: JSON.stringify(`Cesium ${cesiumVersion}`),
    __COMMIT_SHA__: JSON.stringify(commitSha ?? undefined),
    __OUTER_ORIGIN__: JSON.stringify(outerOrigin),
    __INNER_ORIGIN__: JSON.stringify(innerOrigin ?? outerOrigin)
  };

  const plugins = config.plugins ?? [];
  config.plugins = [
    ...plugins,
    copyPlugin,
    cesiumPathReplace(cesiumBaseUrl),
    insertImportMap(importMap, ["bucket.html", "standalone.html"])
  ];

  return defineConfig(config);
}

/**
 * 将 Sandcastle 作为静态文件构建到指定位置。
 * 配置应使用 `createSandcastleConfig` 函数生成。
 *
 * 此构建只会设置应用外部资源的路径。
 * 如果要将文件复制到构建目录，请在尝试构建 Sandcastle 之前确保源文件已存在。
 *
 * @param {UserConfig} config Vite 配置
 * @param {LogLevel} logLevel 日志级别
 * @returns {Promise<void>}
 */
export async function buildStatic(config, logLevel = "warn") {
  // We have to do the compile for the Sandcastle API outside of the vite build
  // because we need to reference the js file and types directly from the app
  // and we don't want them bundled with the rest of the code
  const exitCode = await typescriptCompile(join(__dirname, "../templates/tsconfig.lib.json"));

  if (exitCode === 0) {
    console.log(`Sandcastle typescript build complete`);
  } else {
    throw new Error("Sandcastle typescript build failed");
  }

  const { __OUTER_ORIGIN__, __INNER_ORIGIN__ } = config.define;

  console.log(`Building Sandcastle with Vite. App origin: ${__OUTER_ORIGIN__}, Viewer origin: ${__INNER_ORIGIN__}`);
  console.log("Outputting build to", config.build.outDir);
  await build({
    ...config,
    root: join(__dirname, "../"),
    logLevel
  });
}
