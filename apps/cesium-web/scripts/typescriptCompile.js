import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 使用 tsc CLI 根据配置文件编译 TypeScript 项目
 *
 * @param {string} configPath 要构建的配置文件的绝对路径
 * @returns {Promise<number>} tsc 命令的退出代码
 */
export default async function typescriptCompile(configPath) {
  const tsPath = fileURLToPath(import.meta.resolve("typescript"));
  const binPath = join(tsPath, "../../bin/tsc");
  return new Promise((resolve, reject) => {
    const ls = spawn(process.execPath, [binPath, "-p", configPath]);

    ls.stdout.on("data", data => {
      console.log(`stdout: ${data}`);
    });

    ls.stderr.on("data", data => {
      console.error(`stderr: ${data}`);
    });

    ls.on("close", code => {
      if (code === 0) {
        resolve(code);
      } else {
        reject(code);
      }
    });
  });
}
