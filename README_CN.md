基于 **pnpm workspace + Turborepo + TypeScript** 的 Cesium 扩展 monorepo：沉淀可复用的 Cesium 能力扩展库、配套 Vite 集成插件，以及一个 Sandcastle 风格的在线示例/调试应用。

## 项目定位

- **目标用户**：需要把 CesiumJS 接入 Vite / 现代前端工具链的前端与 GIS 开发者。
- **解决什么**：Cesium 的静态资源（Assets / Workers / Widgets / ThirdParty）与 `CESIUM_BASE_URL` 在 Vite 下配置繁琐；同时提供雷达扫描、热力图等常用可视化扩展的现成实现。

## 仓库结构

```text
.
├── apps/
│   └── cesium-examples/          # React + Vite 示例应用（Sandcastle 风格：Monaco 编辑器 + iframe 预览 + 画廊）
│       ├── gallery/cesium/       # 示例条目（sandcastle.yaml + index.html + main.js + thumbnail.jpg）
│       ├── templates/bucket.html # 预览 iframe 的宿主模板
│       └── env/                  # .env / .env.development / .env.production
├── packages/
│   ├── cesium-exts/              # 扩展库核心（RadarScanPrimitive / HeatLayer / WindLayer / cesiumUtils）
│   ├── vite-cesium-plugin/       # Vite 插件：Cesium 静态资源托管、CESIUM_BASE_URL 注入、产物拷贝
│   ├── vite-cesium-sandcastle/   # Vite 插件：替换 HTML 中的 __CESIUM_BASE_URL__ 占位符
│   └── vite-cesium-exts-dev/     # Vite 插件：开发期把 .glsl 着色器编译为内存 ES module（含 HMR）
├── tooling/
│   ├── config-typescript/        # @repo/config-typescript：base / node / react 预设
│   ├── config-eslint/            # @repo/config-eslint：base / react 扁平配置
│   └── config-prettier/          # @repo/config-prettier
├── scripts/                      # verify-commit.sh、lint-staged-eslint.mjs
├── pnpm-workspace.yaml           # workspace 范围 + 分层 catalog 版本管理
└── turbo.json                    # build / check-types / lint / test / dev / clean 任务编排
```

## 技术栈

| 领域 | 选型 |
| --- | --- |
| 语言 | TypeScript（strict，`moduleResolution: bundler`） |
| 包管理 | pnpm 10 workspace + 分层 catalog（`catalog:tooling` / `catalog:cesium` 等） |
| 任务编排 | Turborepo（`envMode: strict`） |
| 构建 | Vite（示例应用）、tsdown（库打包，ESM + CJS + d.ts） |
| 示例应用 UI | React 19 + React Compiler、Tailwind CSS 4、Base UI、Monaco Editor |
| 三维引擎 | CesiumJS（库中为 `peerDependency`，避免多份 Cesium 实例） |
| 质量 | ESLint 扁平配置（含 perfectionist 导入排序）、Prettier、husky + lint-staged |
| 版本发布 | Changesets |

## 环境要求

- Node.js **>= 22.22.1**（`.npmrc` 开启 `engine-strict`，版本不符会直接拒绝安装）
- pnpm **>= 10.12.1**（仓库固定 `packageManager: pnpm@10.12.1`）

## 快速开始

```bash
git clone https://github.com/ruomulight/cesium-exts.git
cd cesium-exts
pnpm install

# 启动全部 dev 任务（当前实际只有示例应用有 dev）
pnpm dev

# 或只启动示例应用
pnpm --filter cesium-examples dev
```

## 常用命令

```bash
pnpm build          # turbo build：构建库与示例应用
pnpm check-types    # turbo check-types：tsc --noEmit 类型检查
pnpm lint           # turbo lint：ESLint 检查
pnpm lint:fix       # ESLint 自动修复
pnpm format         # Prettier 格式化全仓
pnpm format:check   # Prettier 校验（适合 CI）
pnpm test           # turbo test（测试基建尚未接入）
pnpm clean          # 清理构建产物与缓存
pnpm changeset      # 记录变更集
pnpm release        # 构建并发布（需先初始化 .changeset）
```

按包执行：

```bash
pnpm --filter cesium-exts build
pnpm --filter vite-cesium-plugin lint
```

## 在自己的项目中集成

### 1. Vite 中接入 Cesium

```ts
// vite.config.ts
import { defineConfig } from "vite";
import cesium from "vite-cesium-plugin";

export default defineConfig({
  plugins: [
    cesium({
      // false：把 Cesium 作为外部依赖，通过 <script> 引入并拷贝 Cesium.js（默认，构建更快）
      // true ：由打包器重新编译 Cesium 进产物
      rebuildCesium: false,
      // 开发期是否使用压缩版 Cesium（false 时使用 CesiumUnminified，便于调试）
      devMinifyCesium: false,
      // 静态资源基础路径，会注入为 CESIUM_BASE_URL
      cesiumBaseUrl: "cesium/"
    })
  ]
});
```

插件职责：开发期用 `serve-static` 托管 `node_modules/cesium/Build/...`；注入 `CESIUM_BASE_URL`；构建后把 `Assets`、`ThirdParty`、`Workers`、`Widgets`（以及非 rebuild 模式下的 `Cesium.js`）拷贝到产物目录；自动向 `index.html` 注入 `widgets.css` 与 `Cesium.js` 标签。

### 2. Sandcastle 模板占位符替换

```ts
import cesiumSandcastle from "vite-cesium-sandcastle";

export default defineConfig({
  plugins: [cesiumSandcastle({ placeholder: "__CESIUM_BASE_URL__", cesiumBaseUrl: "/cesium/" })]
});
```

### 3. 使用扩展库

```ts
import * as Cesium from "cesium";
import { cesiumUtils, RadarScanPrimitive } from "cesium-exts";

const viewer = new Cesium.Viewer("cesiumContainer");

const radar = new RadarScanPrimitive(viewer.scene, {
  positions: [{ lon: 116.39, lat: 39.91 }],
  radius: 1500,
  color: "#99ff00",
  speed: 1.0,
  scanAlpha: 0.8
});

cesiumUtils.flyToTarget(viewer, { targetPosition: Cesium.Cartesian3.fromDegrees(116.39, 39.91) });
```

> `HeatLayer` 与 `WindLayer` 目前仍是占位实现，API 未稳定，请勿在生产中依赖。

## 关键入口（便于定位问题）

| 文件 | 作用 |
| --- | --- |
| `packages/cesium-exts/index.ts` | 库对外导出入口 |
| `packages/cesium-exts/tsdown.config.ts` | 库打包配置（ESM/CJS、external cesium、d.ts） |
| `packages/cesium-exts/types/cesium-extensions.d.ts` | Cesium 内部渲染 API 的补充类型声明 |
| `packages/vite-cesium-plugin/src/index.ts` | Cesium 集成插件主体 |
| `apps/cesium-examples/vite.config.ts` | 示例应用构建与插件装配 |
| `apps/cesium-examples/src/util/IframeBridge.ts` | 编辑器与预览 iframe 的通信桥 |
| `pnpm-workspace.yaml` / `turbo.json` | workspace 与任务编排配置 |

## 新增示例

在 `apps/cesium-examples/gallery/cesium/<example-name>/` 下创建：

- `sandcastle.yaml`：标题、标签等元信息
- `index.html`：DOM 结构（可使用 `__CESIUM_BASE_URL__` 占位符）
- `main.js`：示例逻辑
- `thumbnail.jpg`：缩略图（缺省时可复用 `placeholder-thumbnail.jpg`）

## 新增 package

1. 在 `packages/<name>/` 创建包，`type: "module"`。
2. `tsconfig.json` 继承 `@repo/config-typescript/base.json`（或 `node.json` / `react.json`）。
3. `eslint.config.js` 复用 `@repo/config-eslint/base`。
4. 外部依赖统一写成 `catalog:<group>`，内部依赖写成 `workspace:*`。
5. 脚本名对齐 turbo 任务：`build`、`check-types`、`lint`、`test`、`clean`。

## 约定

- 根目录只放工程编排与公共配置；`packages/*` 产出可复用能力，不反向依赖 `apps/*`。
- Cesium 在库与插件中一律声明为 `peerDependency`，防止应用中出现多份 Cesium 实例。
- 提交信息由 husky + `scripts/verify-commit.sh` 校验，提交前自动执行 Prettier 与 ESLint。
