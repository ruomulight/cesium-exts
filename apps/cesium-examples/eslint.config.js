import { reactConfig } from "@repo/config-eslint/react";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  ...reactConfig,
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // react-refresh 规则，允许导出常量
      "react-refresh/only-export-components": "off",
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_", // ✅ 忽略以 _ 开头的参数
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_"
        }
      ]
    }
  }
]);
