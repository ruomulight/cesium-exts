// 1. 导入 gulp 的 API
import { series } from "gulp";

import { buildCesiumExts, rollupBuild } from "./scripts/build.js";

// --- 你的构建任务 ---
async function buildJs() {
  // 1. 先生成入口文件
  await buildCesiumExts();
  // 2. 然后使用 Rollup 打包
  await rollupBuild();
}

// --- 导出具名任务 ---
export const build = series(buildJs);
