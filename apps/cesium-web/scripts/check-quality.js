#!/usr/bin/env node

/**
 * 项目质量检查和优化工具
 *
 * 功能：
 * 1. 代码质量检查
 * 2. 类型检查
 * 3. 构建验证
 * 4. 文件结构分析
 */

import { execSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { join } from "path";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m"
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, description) {
  log(`\n📝 ${description}...`, colors.cyan);
  try {
    const output = execSync(command, { encoding: "utf-8", stdio: "pipe" });
    log(`✅ ${description} - 通过`, colors.green);
    return { success: true, output };
  } catch (error) {
    log(`❌ ${description} - 失败`, colors.red);
    if (error.stdout) console.log(error.stdout);
    if (error.stderr) console.log(error.stderr);
    return { success: false, error };
  }
}

function countFiles(dir, extensions) {
  let count = 0;
  try {
    const files = readdirSync(dir);
    files.forEach(file => {
      const filePath = join(dir, file);
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        count += countFiles(filePath, extensions);
      } else if (extensions.some(ext => file.endsWith(ext))) {
        count++;
      }
    });
  } catch (error) {
    // 忽略权限错误
  }
  return count;
}

function analyzeProject() {
  log("\n" + "=".repeat(60), colors.blue);
  log("🔍 Cesium Web 项目质量检查工具", colors.blue);
  log("=".repeat(60) + "\n", colors.blue);

  const results = [];

  // 1. 文件统计
  log("📊 项目文件统计", colors.yellow);
  const srcDir = "./src";
  const tsFiles = countFiles(srcDir, [".ts", ".tsx"]);
  const componentFiles = countFiles("./src/components", [".tsx"]);
  const utilFiles = countFiles("./src/util", [".ts"]);

  log(`  TypeScript 文件: ${tsFiles}`, colors.cyan);
  log(`  组件文件: ${componentFiles}`, colors.cyan);
  log(`  工具函数文件: ${utilFiles}`, colors.cyan);

  // 2. 类型检查
  const typeCheck = runCommand("tsc --noEmit", "TypeScript 类型检查");
  results.push({ name: "类型检查", ...typeCheck });

  // 3. ESLint 检查
  const lintCheck = runCommand("eslint . --max-warnings 0", "ESLint 代码检查");
  results.push({ name: "ESLint", ...lintCheck });

  // 4. 构建测试
  const buildCheck = runCommand("vite build --mode production", "生产构建测试");
  results.push({ name: "构建", ...buildCheck });

  // 5. 总结
  log("\n" + "=".repeat(60), colors.blue);
  log("📋 检查总结", colors.blue);
  log("=".repeat(60), colors.blue);

  const passed = results.filter(r => r.success).length;
  const total = results.length;

  results.forEach(result => {
    const icon = result.success ? "✅" : "❌";
    const color = result.success ? colors.green : colors.red;
    log(`${icon} ${result.name}`, color);
  });

  log(
    `\n通过率: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`,
    passed === total ? colors.green : colors.yellow
  );

  if (passed === total) {
    log("\n🎉 恭喜！所有检查都通过了！", colors.green);
  } else {
    log("\n⚠️  部分检查未通过，请查看上方详细信息", colors.yellow);
  }

  log("\n" + "=".repeat(60) + "\n", colors.blue);
}

// 执行分析
analyzeProject();
