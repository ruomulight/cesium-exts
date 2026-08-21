import type { ESLint, Linter } from "eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import { baseConfig } from "@repo/config-eslint/base";

/**
 * React 包共享的 ESLint 扁平配置。
 *
 * 在调用方的 eslint.config.ts 中使用：
 * ```ts
 * import { reactConfig } from "@repo/config-eslint/react";
 * export default tseslint.config(...reactConfig);
 * ```
 */
export const reactConfig: Linter.Config[] = [
  ...baseConfig,
  // React Hooks：启用 eslint-plugin-react-hooks 推荐规则集
  {
    plugins: {
      "react-hooks": reactHooks as ESLint.Plugin
    },
    rules: {
      ...reactHooks.configs.recommended.rules
    }
  },
  // React Refresh（Vite HMR 场景）：限制模块导出内容以保障热更新正常
  {
    plugins: {
      "react-refresh": reactRefresh as ESLint.Plugin
    },
    rules: {
      // 仅允许导出组件，允许导出常量（如 export const foo = 1）
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }]
    }
  }
];
