import type { Linter } from "eslint";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";
import perfectionist from "eslint-plugin-perfectionist";
import globals from "globals";

/**
 * 所有 TypeScript 包共享的基础 ESLint 扁平配置。
 *
 * 在调用方的 eslint.config.ts 中使用：
 * ```ts
 * import { baseConfig } from "@repo/config-eslint/base";
 * export default tseslint.config(...baseConfig);
 * ```
 */
export const baseConfig: Linter.Config[] = [
  // 全局忽略模式 - 调用方还应自行补充自身需要的忽略项
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.turbo/**", "**/coverage/**", "**/*.d.ts"]
  },
  // 推荐的 JS + TS + Prettier 规则集
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  // 语言选项：注入 Node 与浏览器环境全局变量
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser
      }
    }
  },
  // TypeScript 专属规则
  {
    rules: {
      // 禁止未使用的变量，以 _ 开头的参数 / 变量 / 捕获错误将被忽略
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      // 强制统一使用 import type 形式，采用内联 type 导入风格 (import { type Foo })
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      // 关闭禁止空对象类型 ({} ) 规则
      "@typescript-eslint/no-empty-object-type": "off",
      // 禁止未使用的表达式，允许短路 (&&/||) 与三元表达式
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }]
    }
  },
  // Import / Export 自动排序（eslint-plugin-perfectionist）
  // 排序属于"改结构"范畴，归 ESLint 管；与 Prettier（只管格式）互补，不冲突.
  // 排序类型用自然序 (natural)：item2 < item10，符合直觉.
  // 分组：type-import -> 外部 -> 内部(@/) -> 相对路径 -> 副作用 -> unknown
  // @/ 由默认 internalPattern (^@/.+) 自动识别为 internal，无需额外配置.
  // 组间 1 个空行，组内按自然序升序；项目用 inline-type-imports，无独立 import type 语句.
  {
    plugins: {
      perfectionist
    },
    rules: {
      "perfectionist/sort-imports": [
        "error",
        {
          type: "natural",
          order: "asc",
          groups: [
            "type-import",
            ["value-builtin", "value-external"],
            "type-internal",
            "value-internal",
            ["type-parent", "type-sibling", "type-index"],
            ["value-parent", "value-sibling", "value-index"],
            "ts-equals-import",
            "unknown"
          ],
          newlinesBetween: 1
        }
      ],
      "perfectionist/sort-named-imports": ["error", { type: "natural", order: "asc" }],
      "perfectionist/sort-exports": ["error", { type: "natural", order: "asc" }]
    }
  }
];
