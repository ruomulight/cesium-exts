import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import globals from "globals";

// 定义不需要 ESLint 检查的文件或目录模式
const ignores = [
  "**/dist/**", // 构建输出目录
  "**/node_modules/**", // 依赖包目录
  ".*", // 点开头的文件(如 .gitignore, .env 等)
  "scripts/**", // 脚本目录
  "**/*.d.ts", // TypeScript 类型声明文件
  "packages/engine",
  "packages/Sandcastle"
];

export default defineConfig([
  // 应用全局忽略
  globalIgnores(ignores),
  // ✅ TypeScript 文件
  {
    files: ["**/*.{ts,tsx}"],
    // 语言选项配置
    languageOptions: {
      ecmaVersion: "latest", // 使用最新的 ECMAScript 版本
      sourceType: "module", // 使用 ES Modules 模块系统
      parser: tseslint.parser, // 使用 TypeScript 解析器
      globals: globals.node // 默认启用 Node.js 全局变量
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
]);
