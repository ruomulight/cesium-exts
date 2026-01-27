export default {
  // 1. 前端核心代码:先 ESLint,再 Prettier
  "**/*.{js,ts,jsx,tsx,vue,mjs,cjs}": [
    "turbo run lint",
  ]
};
