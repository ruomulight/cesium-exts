import { baseConfig } from "@repo/config-eslint/base";
import { defineConfig, globalIgnores } from "eslint/config";

const ignores = ["scripts/**", "packages/engine/**", "packages/Sandcastle/**"];

export default defineConfig([globalIgnores(ignores), ...baseConfig]);
