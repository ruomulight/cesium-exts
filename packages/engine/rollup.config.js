import { defineConfig } from "rollup";
import typescript from "@rollup/plugin-typescript";
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import terser from "@rollup/plugin-terser";
import dts from "rollup-plugin-dts";
import json from "@rollup/plugin-json";
import pkg from "./package.json" with { type: "json" };

/**
 * 定义外部依赖列表，这些依赖不会被打包到最终输出中
 * 包括：
 * - Cesium 核心库
 * - package.json 中声明的 peerDependencies
 * - package.json 中声明的 devDependencies
 */
const external = Array.from(
  new Set(["cesium", ...Object.keys(pkg.peerDependencies || {}), ...Object.keys(pkg.devDependencies || {})])
);

/**
 * 获取基础插件配置
 * @returns {Array} Rollup 插件数组
 */
const getBasePlugins = () =>
  [
    // TypeScript 编译插件
    typescript({
      tsconfig: "./tsconfig.json"
    }),

    // 启用代码压缩和混淆
    terser({
      compress: {
        drop_console: true, // 移除 console.log 调用
        drop_debugger: true, // 移除 debugger 语句
        passes: 2 // 执行两次压缩以获得更小的体积
      },
      mangle: true, // 混淆变量名以减小文件体积
      format: {
        comments: false // 移除所有注释
      }
    }),

    // 解析 node_modules 中的第三方模块
    resolve(),

    // 将 JSON 文件转换为 ES6 模块
    json(),

    // 将 CommonJS 模块转换为 ES6，以便 Rollup 能够处理
    commonjs()
  ].filter(Boolean); // 过滤掉 false/null 值（非生产环境的 terser）

/**
 * 主构建配置 - 生成 ESM、CJS 和 UMD 三种格式的输出文件
 */
const mainBuilds = {
  // 入口文件
  input: "./index.ts",

  // 输出配置 - 支持多种模块格式
  output: [
    {
      // ESM (ES Module) 格式 - 现代 JavaScript 模块标准
      file: "./dist/cesium-exts.esm.js",
      format: "esm",
      sourcemap: false
    },
    {
      // CJS (CommonJS) 格式 - Node.js 默认模块系统
      file: "./dist/cesium-exts.cjs.js",
      format: "cjs",
      sourcemap: false,
      exports: "auto" // 自动检测导出模式
    },
    {
      // UMD (Universal Module Definition) 格式 - 兼容浏览器和 Node.js
      file: "./dist/cesium-exts.umd.js",
      format: "umd",
      name: "CesiumExts", // 浏览器环境中的全局变量名
      sourcemap: false,
      globals: {
        cesium: "Cesium" // 将 cesium 模块映射到全局 Cesium 变量
      }
    }
  ],

  // 外部依赖 - 不会被打包
  external,

  // 构建插件
  plugins: getBasePlugins()
};

/**
 * TypeScript 类型定义文件生成配置
 * 生成 .d.ts 文件，为库提供类型支持
 */
const dtsMainConfig = {
  // 入口文件
  input: "./index.ts",

  // 输出配置
  output: {
    file: "./dist/types/index.d.ts",
    format: "esm"
  },

  // 使用 rollup-plugin-dts 插件生成类型定义
  plugins: [dts()],

  // 排除外部依赖和资源文件
  external: [...external]
};

/**
 * 导出配置数组：
 * 1. mainBuilds - 生成 ESM/CJS/UMD 格式的 JavaScript 文件
 * 2. dtsMainConfig - 生成 TypeScript 类型声明文件
 */
export default defineConfig([mainBuilds, dtsMainConfig]);
