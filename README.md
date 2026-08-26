A **pnpm workspace + Turborepo + TypeScript** monorepo for Cesium extension libraries —沉淀可复用的 Cesium 能力扩展库、配套 Vite 集成插件，以及一个 Sandcastle 风格的在线示例/调试应用。

> A reusable Cesium extension library, Vite integration plugins, and a Sandcastle-style online example/debugging app built with pnpm workspace + Turborepo + TypeScript.

## Project Positioning

- **Target Users**: Frontend and GIS developers who need to integrate CesiumJS with Vite / modern frontend toolchains.
- **Problem Solved**: Cesium's static assets (Assets / Workers / Widgets / ThirdParty) and `CESIUM_BASE_URL` are cumbersome to configure under Vite. This project also provides ready-to-use implementations of common visualizations like radar scanning and heatmaps.

## Repository Structure

```text
.
├── apps/
│   └── cesium-examples/          # React + Vite demo app (Sandcastle-style: Monaco editor + iframe preview + gallery)
│       ├── gallery/cesium/       # Example entries (sandcastle.yaml + index.html + main.js + thumbnail.jpg)
│       ├── templates/bucket.html # Host template for preview iframe
│       └── env/                  # .env / .env.development / .env.production
├── packages/
│   ├── cesium-exts/              # Core extension library (RadarScanPrimitive / HeatLayer / WindLayer / cesiumUtils)
│   ├── vite-cesium-plugin/       # Vite plugin: Cesium asset serving, CESIUM_BASE_URL injection, artifact copying
│   ├── vite-cesium-sandcastle/   # Vite plugin: Replace __CESIUM_BASE_URL__ placeholders in HTML
│   └── vite-cesium-exts-dev/     # Vite plugin: Compile .glsl shaders to in-memory ES modules during dev (with HMR)
├── tooling/
│   ├── config-typescript/        # @repo/config-typescript: base / node / react presets
│   ├── config-eslint/            # @repo/config-eslint: base / react flat config
│   └── config-prettier/          # @repo/config-prettier
├── scripts/                      # verify-commit.sh, lint-staged-eslint.mjs
├── pnpm-workspace.yaml           # Workspace scope + tiered catalog version management
└── turbo.json                    # build / check-types / lint / test / dev / clean task orchestration
```

## Tech Stack

| Area | Choice |
| --- | --- |
| Language | TypeScript (strict, `moduleResolution: bundler`) |
| Package Manager | pnpm 10 workspace + tiered catalogs (`catalog:tooling` / `catalog:cesium`, etc.) |
| Task Orchestration | Turborepo (`envMode: strict`) |
| Build | Vite (demo app), tsdown (library bundling, ESM + CJS + d.ts) |
| Demo App UI | React 19 + React Compiler, Tailwind CSS 4, Base UI, Monaco Editor |
| 3D Engine | CesiumJS (listed as `peerDependency` to avoid multiple Cesium instances) |
| Quality | ESLint flat config (with perfectionist import sorting), Prettier, husky + lint-staged |
| Release | Changesets |

## Environment Requirements

- Node.js **>= 22.22.1** (`.npmrc` has `engine-strict` enabled; installation will fail if version mismatch)
- pnpm **>= 10.12.1** (workspace locks to `packageManager: pnpm@10.12.1`)

## Quick Start

```bash
git clone https://github.com/ruomulight/cesium-exts.git
cd cesium-exts
pnpm install

# Start all dev tasks (currently only the demo app has a dev server)
pnpm dev

# Or start only the demo app
pnpm --filter cesium-examples dev
```

## Common Commands

```bash
pnpm build          # turbo build: build libraries and demo app
pnpm check-types    # turbo check-types: tsc --noEmit type checking
pnpm lint           # turbo lint: ESLint check
pnpm lint:fix       # ESLint auto-fix
pnpm format         # Prettier format entire workspace
pnpm format:check   # Prettier check (suitable for CI)
pnpm test           # turbo test (test infrastructure not yet integrated)
pnpm clean          # Clean build artifacts and caches
pnpm changeset      # Record a changeset
pnpm release        # Build and publish (requires .changeset init first)
```

Run per package:

```bash
pnpm --filter cesium-exts build
pnpm --filter vite-cesium-plugin lint
```

## Integration in Your Project

### 1. Add Cesium in Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import cesium from "vite-cesium-plugin";

export default defineConfig({
  plugins: [
    cesium({
      // false: treat Cesium as external, import via <script> tag and copy Cesium.js (default, faster builds)
      // true : re-compile Cesium through the bundler
      rebuildCesium: false,
      // Whether to use minified Cesium during dev (false uses CesiumUnminified for debugging)
      devMinifyCesium: false,
      // Static asset base path, injected as CESIUM_BASE_URL
      cesiumBaseUrl: "cesium/"
    })
  ]
});
```

Plugin responsibilities: serve `node_modules/cesium/Build/...` via `serve-static` during dev; inject `CESIUM_BASE_URL`; copy `Assets`, `ThirdParty`, `Workers`, `Widgets` (and `Cesium.js` in non-rebuild mode) to the output directory; automatically inject `widgets.css` and `Cesium.js` tags into `index.html`.

### 2. Sandcastle Template Placeholder Replacement

```ts
import cesiumSandcastle from "vite-cesium-sandcastle";

export default defineConfig({
  plugins: [cesiumSandcastle({ placeholder: "__CESIUM_BASE_URL__", cesiumBaseUrl: "/cesium/" })]
});
```

### 3. Use the Extension Library

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

> `HeatLayer` and `WindLayer` are currently placeholder implementations with unstable APIs. Please do not rely on them in production.

## Key Entry Points

| File | Purpose |
| --- | --- |
| `packages/cesium-exts/index.ts` | Library public export entry |
| `packages/cesium-exts/tsdown.config.ts` | Library build config (ESM/CJS, external cesium, d.ts) |
| `packages/cesium-exts/types/cesium-extensions.d.ts` | Supplemental type declarations for Cesium internal rendering APIs |
| `packages/vite-cesium-plugin/src/index.ts` | Cesium integration plugin main entry |
| `apps/cesium-examples/vite.config.ts` | Demo app build and plugin assembly |
| `apps/cesium-examples/src/util/IframeBridge.ts` | Communication bridge between editor and preview iframe |
| `pnpm-workspace.yaml` / `turbo.json` | Workspace and task orchestration config |

## Adding Examples

Create a directory under `apps/cesium-examples/gallery/cesium/<example-name>/`:

- `sandcastle.yaml`: Title, tags, and other metadata
- `index.html`: DOM structure (can use `__CESIUM_BASE_URL__` placeholder)
- `main.js`: Example logic
- `thumbnail.jpg`: Thumbnail (can reuse `placeholder-thumbnail.jpg` if missing)

## Adding a Package

1. Create a package under `packages/<name>/` with `type: "module"`.
2. `tsconfig.json` extends `@repo/config-typescript/base.json` (or `node.json` / `react.json`).
3. `eslint.config.js` reuses `@repo/config-eslint/base`.
4. External dependencies use `catalog:<group>`, internal dependencies use `workspace:*`.
5. Script names align with Turborepo tasks: `build`, `check-types`, `lint`, `test`, `clean`.

## Conventions

- The root directory holds only project orchestration and shared configs; `packages/*` produce reusable capabilities and must not depend on `apps/*`.
- Cesium is always declared as `peerDependency` in libraries and plugins to prevent multiple Cesium instances in the application.
- Commit messages are validated by husky + `scripts/verify-commit.sh`; Prettier and ESLint run automatically before each commit.
