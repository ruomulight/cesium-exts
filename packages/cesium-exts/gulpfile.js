/**
 * @file cesium-exts 库的构建脚本（gulp + esbuild + tsc）。
 *
 * 负责以下工作：
 * - 使用 esbuild 将 `index.ts` 打包为 ESM 与 CJS 两种产物；
 * - 通过 TypeScript 编译器（`tsc --emitDeclarationOnly`）生成 `.d.ts` 类型声明；
 * - 提供 `clean`、`build`、`dev` 等具名任务供命令行调用。
 *
 * @example 命令行调用
 * ```bash
 * npx gulp build   # 清理并打包产物
 * npx gulp dev     # 启动监听模式
 * ```
 */

import { exec } from "child_process";
import * as esbuild from "esbuild";
import { rm } from "fs/promises";
import { series, watch } from "gulp";
import { createRequire } from "module";
import { promisify } from "util";

const require = createRequire(import.meta.url);
const execAsync = promisify(exec);

/**
 * TypeScript 编译器（`tsc`）入口脚本的绝对路径，用于在 Node 子进程中执行类型声明生成。
 *
 * @type {string}
 */
const tscPath = require.resolve("typescript/bin/tsc");

/**
 * esbuild 的 ESM 打包配置。
 *
 * 将 `index.ts` 打包为单文件、压缩后的 ES Module 产物（`dist/index.js`）。
 *
 * @remarks
 * - `external: ["cesium"]`：将 `cesium` 视为外部依赖，不打入产物；
 * - `platform: "neutral"`：不绑定 Node / 浏览器特定行为；
 * - `target: "esnext"`：使用最新 ES 语法；
 * - `minify: true`：压缩输出。
 *
 * @type {import("esbuild").BuildOptions}
 */
const esmConfig = {
  entryPoints: ["index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "esnext",
  external: ["cesium"],
  loader: { ".json": "json" },
  minify: true
};

/**
 * esbuild 的 CJS（CommonJS）打包配置。
 *
 * 继承自 {@link esmConfig}，仅覆盖输出路径与模块格式，产物为 `dist/index.cjs`。
 *
 * @type {import("esbuild").BuildOptions}
 */
const cjsConfig = {
  ...esmConfig,
  outfile: "dist/index.cjs",
  format: "cjs"
};

/**
 * 清理构建输出目录 `dist`。
 *
 * 使用 `fs/promises` 的 `rm` 以递归、强制方式删除，目录不存在时也不会报错。
 *
 * @returns {Promise<void>} 删除完成时 resolve。
 *
 * @example
 * ```ts
 * await clean();
 * ```
 */
async function clean() {
  await rm("dist", { recursive: true, force: true });
}

/**
 * 使用 esbuild 构建 ESM 产物（`dist/index.js`）。
 *
 * @returns {Promise<void>} 构建完成时 resolve；esbuild 内部错误会以异常形式抛出。
 *
 * @example
 * ```ts
 * await buildJsEsm();
 * ```
 */
async function buildJsEsm() {
  await esbuild.build(esmConfig);
}

/**
 * 使用 esbuild 构建 CJS 产物（`dist/index.cjs`）。
 *
 * @returns {Promise<void>} 构建完成时 resolve；esbuild 内部错误会以异常形式抛出。
 *
 * @example
 * ```ts
 * await buildJsCjs();
 * ```
 */
async function buildJsCjs() {
  await esbuild.build(cjsConfig);
}

/**
 * 调用 TypeScript 编译器，仅生成 `.d.ts` 类型声明文件到 `dist` 目录。
 *
 * 实际执行命令为：
 * `node <tscPath> --emitDeclarationOnly --outDir dist`
 *
 * @returns {Promise<void>} 声明文件生成完成时 resolve。
 *
 * @throws 当 `tsc` 进程返回非零退出码或输出到 stderr 时，会将错误信息透传并拒绝。
 *
 * @example
 * ```ts
 * await buildTypes();
 * ```
 */
async function buildTypes() {
  const { stdout, stderr } = await execAsync(`"${process.execPath}" "${tscPath}" --emitDeclarationOnly --outDir dist`);
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
}

/**
 * 启动开发监听模式。
 *
 * 为 ESM 与 CJS 分别创建 esbuild context 并开启 watch，同时使用 gulp 监听
 * `src/**\/*.ts` 源文件变化以重新生成类型声明。
 *
 * @returns {Promise<import("gulp").WatchFunc>} 返回 gulp 的文件监听器，可用于后续 `close()`。
 *
 * @remarks
 * - 需通过 `npx gulp dev` 调用，任务需在 gulpfile 中注册后才能以具名任务方式运行；
 * - 两个 esbuild context 会持续占用进程，直到手动终止。
 *
 * @example
 * ```bash
 * npx gulp dev
 * ```
 */
async function dev() {
  const esmCtx = await esbuild.context(esmConfig);
  const cjsCtx = await esbuild.context(cjsConfig);
  await Promise.all([esmCtx.watch(), cjsCtx.watch()]);

  const watcher = watch("src/**/*.ts", buildTypes);
  return watcher;
}

// --- 导出具名任务 ---

/**
 * 生产构建任务：依次执行清理、ESM 打包、CJS 打包。
 *
 * 执行顺序：`clean` -> `buildJsEsm` -> `buildJsCjs`。
 *
 * @example
 * ```bash
 * npx gulp build
 * ```
 */
export const build = series(clean, buildJsEsm, buildJsCjs);
