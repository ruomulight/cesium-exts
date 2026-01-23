# cesium-exts

> 🌍 基于 Cesium 的高性能扩展库，提供热力图、风场等可视化组件

一个采用 **Monorepo** 架构开发的 Cesium 扩展库集合，基于 Cesium v1.136.0 构建，旨在提供高质量、可复用的 3D 地理可视化功能扩展。

## ✨ 特性

- 🏗️ **Monorepo 架构** - 使用 [Turborepo](https://turbo.build/) + [pnpm workspace](https://pnpm.io/) 管理多包依赖
- 📘 **TypeScript 优先** - 全面使用 TypeScript 开发，提供完整的类型定义
- ⚡ **现代化构建** - 基于 [Rollup](https://rollupjs.org/) + [Gulp](https://gulpjs.com/) 的高效构建流程
- 🎨 **开发友好** - 内置基于 Vite + React 的开发环境，支持热更新
- 🔧 **代码质量** - 集成 ESLint + Prettier，确保代码风格统一

## 📦 包含的包

### 核心库

| 包名                                       | 版本  | 描述                                      |
| ------------------------------------------ | ----- | ----------------------------------------- |
| [cesium-exts](./packages/engine)           | 1.0.0 | 核心扩展库，包含热力图、风场等可视化组件  |

### 功能模块

当前已实现的模块：

- **HeatLayer** - 高性能热力图渲染，支持 Canvas2D 和 WebGL 双渲染模式
- **WindLayer** - 风场可视化组件
- **Utils** - Cesium 工具函数集合

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) >= 22.18.0
- [pnpm](https://pnpm.io/) >= 8.15.6
- [Cesium](https://github.com/CesiumGS/cesium) >= 1.136.0

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd with-vite-react

# 安装依赖
pnpm install
```

### 开发

```bash
# 启动开发服务器
pnpm dev

# 构建所有包
pnpm build

# 代码检查
pnpm lint

# 代码格式化
pnpm format
```

## 📖 使用示例

```typescript
import { HeatLayer, WindLayer, cesiumUtils } from 'cesium-exts';

// 创建热力图图层
const heatLayer = new HeatLayer(viewer, {
  gradient: {
    0.0: 'blue',
    0.5: 'yellow',
    1.0: 'red'
  },
  radius: 20,
  blur: 0.85
});

// 添加数据点
heatLayer.addData({
  x: 116.4074,
  y: 39.9042,
  value: 100
});
```

## 🏗️ 项目结构

```
with-vite-react/
├── packages/
│   └── engine/              # 核心扩展库
│       ├── src/
│       │   ├── modules/     # 功能模块
│       │   │   ├── HeatLayer/
│       │   │   └── WindLayer/
│       │   └── Utils/       # 工具函数
│       ├── scripts/         # 构建脚本
│       ├── dist/            # 构建输出
│       └── index.ts         # 入口文件
├── turbo.json              # Turborepo 配置
└── pnpm-workspace.yaml     # pnpm workspace 配置
```

## 🛠️ 可用命令

| 命令           | 说明                           |
| -------------- | ------------------------------ |
| `pnpm dev`     | 启动开发服务器                 |
| `pnpm build`   | 构建所有包                     |
| `pnpm lint`    | 运行 ESLint 检查代码           |
| `pnpm format`  | 使用 Prettier 格式化所有文件   |

## 🔨 构建产物

构建后会在 `packages/engine/dist/` 目录生成以下文件：

- `cesium-exts.esm.js` - ES Module 格式
- `cesium-exts.cjs.js` - CommonJS 格式
- `cesium-exts.umd.js` - UMD 格式（浏览器全局变量）
- `types/` - TypeScript 类型定义文件

## 📝 开发指南

### 添加新模块

1. 在 `packages/engine/src/modules/` 下创建新模块目录
2. 实现模块功能并导出
3. 模块会自动被 `index.ts` 收集并导出

### 构建流程

项目使用 Gulp + Rollup 构建：

1. **生成入口文件** - 自动扫描 `src/` 目录生成 `index.ts`
2. **Rollup 打包** - 生成 ESM、CJS、UMD 三种格式
3. **类型定义** - 生成 `.d.ts` 类型声明文件

## 📄 许可证

[ISC](./LICENSE)

## 👥 贡献者

- yuanan - 项目作者

---

**注意**: 本项目基于 Cesium v1.136.0 开发，请确保使用兼容版本的 Cesium。
