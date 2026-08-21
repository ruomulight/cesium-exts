/**
 * lint-staged ESLint 辅助脚本
 *
 * 本仓库为 pnpm/turbo monorepo，各工作区（apps/packages）各自拥有独立的
 * eslint.config.js，且仓库根目录无 ESLint 配置。因此无法在根目录一次性
 * 对所有暂存文件执行 ESLint--必须找到每个文件所属工作区的配置目录，
 * 并以该目录为 cwd 运行 eslint，才能正确加载对应的 eslint.config.js。
 *
 * 脚本流程：
 * 1. 从命令行参数接收 lint-staged 传入的暂存文件列表
 * 2. 逐个文件向上查找最近的 eslint.config.js，确定其归属的工作区目录
 * 3. 按配置目录对文件分组（同工作区的文件合并为一次调用以提升效率）
 * 4. 分组分别执行 `pnpm exec eslint --fix`，cwd 设为各配置目录
 * 5. 任意一组失败则以非零状态码退出，lint-staged 据此阻断提交
 */

// 引入同步执行子进程的能力，用于调用 eslint
import { spawnSync } from "node:child_process";
// 引入文件存在性检查
import { existsSync } from "node:fs";
// 引入路径处理工具：resolve 解析绝对路径、dirname 取目录、relative 求相对路径
import { resolve, dirname, relative } from "node:path";

// 从命令行参数读取 lint-staged 传入的暂存文件列表（argv[0] 为 node，argv[1] 为脚本路径，故从 2 开始）
const files = process.argv.slice(2);

// 无暂存文件时直接正常退出，无需执行 lint
if (files.length === 0) {
  process.exit(0);
}

// 按最近的 eslint.config.js 所在目录对文件分组
// key：配置目录绝对路径；value：相对该目录的文件路径数组
const groups = new Map();

// 遍历每个暂存文件，确定其归属的 eslint 配置目录
for (const file of files) {
  // 解析文件绝对路径，后续基于它逐级向上查找配置
  const absPath = resolve(file);
  // 从文件所在目录开始向上查找
  let dir = dirname(absPath);
  // 记录找到的配置目录，null 表示尚未找到
  let configDir = null;

  // 逐级向上遍历目录树，直到找到 eslint.config.js 或到达文件系统根目录
  while (true) {
    // 检查当前目录是否存在 eslint.config.js
    if (existsSync(resolve(dir, "eslint.config.js"))) {
      // 命中配置，记录目录并结束查找
      configDir = dir;
      break;
    }
    // 取上一级目录
    const parent = dirname(dir);
    // parent === dir 表示已到达文件系统根目录，无法继续上溯
    if (parent === dir) break;
    // 继续向上查找
    dir = parent;
  }

  // 未找到任何 eslint.config.js 的文件跳过，不纳入 lint（如根目录配置文件等）
  if (!configDir) continue;

  // 计算文件相对配置目录的路径，eslint 需以相对路径在 cwd 下执行
  const relFile = relative(configDir, absPath);
  // 若该配置目录分组尚未创建，则初始化空数组
  if (!groups.has(configDir)) groups.set(configDir, []);
  // 将文件归入对应分组
  groups.get(configDir).push(relFile);
}

// 标记是否有任意一组 eslint 执行失败，用于最终退出码
let failed = false;

// 按分组分别执行 eslint --fix
for (const [configDir, groupFiles] of groups) {
  // 以配置目录为 cwd 调用 pnpm exec eslint --fix，确保加载该工作区的 eslint.config.js
  // stdio: inherit 将 eslint 的输出直接透传到当前进程，便于查看报错
  const result = spawnSync("pnpm", ["exec", "eslint", "--fix", ...groupFiles], {
    cwd: configDir,
    stdio: "inherit",
    shell: true
  });

  // status !== 0 表示 eslint 报错或存在未修复的问题，标记整体失败
  if (result.status !== 0) {
    failed = true;
  }
}

// 存在失败则以非零状态码退出，lint-staged 会据此阻断 git 提交
process.exit(failed ? 1 : 0);
