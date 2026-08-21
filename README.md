# cesium-exts-dev

一个基于 **Turborepo + pnpm + TypeScript** 的可扩展 monorepo 工程模板，适合沉淀 Cesium 扩展、通用工具库、SDK 与演示应用。

## 技术栈

- [Turborepo](https://turbo.build/repo)：任务编排与缓存
- [pnpm workspaces](https://pnpm.io/workspaces)：workspace 包管理
- [TypeScript](https://www.typescriptlang.org/)：严格类型系统
- [Vite](https://vite.dev/) + [React](https://react.dev/)：playground 示例应用
- [Vitest](https://vitest.dev/)：单元测试
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files-new)：代码质量检查
- [Prettier](https://prettier.io/)：代码格式化
- [tsup](https://tsup.egoist.dev/)：库包构建

## 目录结构

```text
.
├── apps/
│   └── playground/          # React + Vite 示例/调试应用
├── packages/
│   ├── shared/              # 内部共享工具、类型、常量
│   ├── tsconfig/            # 统一 TypeScript 配置预设
│   └── eslint-config/       # 统一 ESLint 配置预设
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

## 常用命令

```bash
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm format
```

按包运行：

```bash
pnpm --filter vite-cesium-plugin build
pnpm --filter cesium-examples dev
```

## 新增 package

1. 在 `packages/<name>` 下创建包。
2. `package.json` 使用 `@cesium-exts/<name>` 命名。
3. `tsconfig.json` 继承 `@cesium-exts/tsconfig/library.json`。
4. 复用根脚本约定：`build`、`typecheck`、`lint`、`test`、`clean`。

## 新增 app

1. 在 `apps/<name>` 下创建应用。
2. 依赖内部包时使用 `workspace:*`。
3. 让应用脚本对齐 Turborepo 任务名称。

## 设计原则

- 根目录只放工程编排和公共配置。
- `packages/*` 产出可复用能力，避免依赖具体应用。
- `apps/*` 只组合与验证能力，不沉淀通用逻辑。
- 共享配置包版本化，便于后续独立发布或跨仓库复用。
