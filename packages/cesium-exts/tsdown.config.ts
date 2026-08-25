import { defineConfig } from "tsdown";

export default defineConfig({
  // 入口文件：库根目录的 index.ts（对外导出 RadarScanPrimitive / cesiumUtils / HeatLayer / WindLayer）
  entry: ["index.ts"],

  // 双格式输出：ESM + CJS
  format: ["esm", "cjs"],

  // 浏览器平台：Cesium 为浏览器三维引擎，库本身不依赖 Node 内置模块
  platform: "browser",

  // 固定扩展名（.mjs/.cjs/.d.mts/.d.cts），保证 ESM/CJS 双格式产物扩展名互不冲突，
  // 且 .d.cts 桩文件能正确指向对应的 .d.mts（cjsReexport 依赖该命名约定）
  fixedExtension: true,

  // 编译目标：兼容主流现代浏览器（与 Cesium 1.142 的基线一致）
  target: "es2020",

  // cesium 为 peerDependency，保持 external 不打包进产物，由使用方提供
  deps: {
    neverBundle: [/^cesium/]
  },

  // 生成类型声明；cjsReexport 让 .d.cts 复用 .d.mts（双格式同一 outDir），避免双模块类型冲突（TS2352）
  dts: {
    cjsReexport: true
  },

  // 输出 sourcemap，便于在示例应用中调试
  sourcemap: true,

  // 压缩产物代码（Oxc 完整压缩：代码压缩 + 死代码消除 + 变量混淆）
  minify: true,

  // 构建前清空 dist 目录
  clean: true,

  // 开启 tree-shaking，剔除未使用的模块代码
  treeshake: true,

  // 复制自定义的 Cesium 内部类型声明到 dist，供深层渲染场景（自定义 Shader / Primitive）的消费者引用
  copy: [{ from: "types/cesium-extensions.d.ts", to: "dist/types" }],

  // CLI 输出中显示的名称
  name: "cesium-exts"
});
