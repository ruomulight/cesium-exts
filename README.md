
# cesium-exts

Based on **pnpm workspace + Turborepo + TypeScript**, this is a Cesium extension monorepo: it consolidates reusable Cesium capability extension libraries, accompanying Vite integration plugins, and a Sandcastle-style online example/debugging application.

## Project Positioning

- **Target Users**: Frontend and GIS developers who need to integrate CesiumJS into Vite / modern frontend toolchains.
- **Problem Solved**: Cesium's static assets (Assets / Workers / Widgets / ThirdParty) and `CESIUM_BASE_URL` are cumbersome to configure under Vite; at the same time, it provides ready-made implementations for commonly used visualization extensions such as radar scanning and heatmaps.

## Repository Structure

```text
.
├── apps/
│   └── cesium-examples/          # React + Vite example application (Sandcastle style: Monaco Editor + iframe preview + gallery)
│       ├── gallery/cesium/       # Example entries (sandcastle.yaml + index.html + main.js + thumbnail.jpg)
│       ├── templates/bucket.html # Host template for the preview iframe
│       └── env/                  # .env / .env.development / .env.production
├── packages/
│   ├── cesium-exts/              # Core extension library (RadarScanPrimitive / HeatLayer / WindLayer / cesiumUtils)
│   ├── vite-cesium-plugin/       # Vite plugin: Cesium static asset hosting, CESIUM_BASE_URL injection, artifact copying
│   ├── vite-cesium-sandcastle/   # Vite plugin: Replaces __CESIUM_BASE_URL__ placeholder in HTML
│   └── vite-cesium-exts-dev/     # Vite plugin: Compiles .glsl shaders into in-memory ES modules during development (with HMR)
├── tooling/
│   ├── config-typescript/        # @repo/config-typescript: base / node / react presets
│   ├── config-eslint/            # @repo/config-eslint: base / react flat configs
│   └── config-prettier/          # @repo/config-prettier
├── scripts/                      # verify-commit.sh, lint-staged-eslint.mjs
├── pnpm-workspace.yaml           # Workspace scope + layered catalog version management
└── turbo.json                    # Task orchestration for build / check-types / lint / test / dev / clean
```

## Tech Stack

| Domain | Selection |
| :--- | :--- |
| Language | TypeScript (strict, `moduleResolution: bundler`) |
| Package Manager | pnpm 10 workspace + layered catalogs (`catalog:tooling` / `catalog:cesium`, etc.) |
| Task Orchestration | Turborepo (`envMode: strict`) |
| Build | Vite (example app), tsdown (library bundling, ESM + CJS + d.ts) |
| Example App UI | React 19 + React Compiler, Tailwind CSS 4, Base UI, Monaco Editor |
| 3D Engine | CesiumJS (declared as `peerDependency` in the library to avoid multiple Cesium instances) |
| Quality | ESLint flat config (includes perfectionist import sorting), Prettier, husky + lint-staged |
| Release | Changesets |

## Environment Requirements

- Node.js **>= 22.22.1** (`.npmrc` enables `engine-strict`; installation will be rejected if the version does not match)
- pnpm **>= 10.12.1** (Repository fixes `packageManager: pnpm@10.12.1`)

## Quick Start

```bash
git clone https://github.com/ruomulight/cesium-exts.git
cd cesium-exts
pnpm install

# Start all dev tasks (currently only the example app has a dev task)
pnpm dev

# Or start only the example application
pnpm --filter cesium-examples dev
```

## Common Commands

```bash
pnpm build          # turbo build: builds libraries and example applications
pnpm check-types    # turbo check-types: tsc --noEmit type checking
pnpm lint           # turbo lint: ESLint checking
pnpm lint:fix       # ESLint auto-fix
pnpm format         # Prettier formats the entire repository
pnpm format:check   # Prettier check (suitable for CI)
pnpm test           # turbo test (test infrastructure not yet connected)
pnpm clean          # Cleans build artifacts and cache
pnpm changeset      # Records change sets
pnpm release        # Builds and publishes (requires .changeset initialization first)
```

Execute by package:

```bash
pnpm --filter cesium-exts build
pnpm --filter vite-cesium-plugin lint
```

## Integration in Your Own Project

### 1. Integrating Cesium in Vite

```ts
// vite.config.ts
import { defineConfig } from "vite";
import cesium from "vite-cesium-plugin";

export default defineConfig({
  plugins: [
    cesium({
      // false: Treats Cesium as an external dependency, loads via <script> and copies Cesium.js (default, faster build)
      // true : Recompiles Cesium into the artifact via the bundler
      rebuildCesium: false,
      // Whether to use minified Cesium in development (false uses CesiumUnminified for easier debugging)
      devMinifyCesium: false,
      // Static asset base path, will be injected as CESIUM_BASE_URL
      cesiumBaseUrl: "cesium/"
    })
  ]
});
```

**Plugin Responsibilities:** Serves `node_modules/cesium/Build/...` via `serve-static` during development; injects `CESIUM_BASE_URL`; copies `Assets`, `ThirdParty`, `Workers`, `Widgets` (and `Cesium.js` in non-rebuild mode) to the output directory after build; automatically injects `widgets.css` and `Cesium.js` tags into `index.html`.

### 2. Sandcastle Template Placeholder Replacement

```ts
import cesiumSandcastle from "vite-cesium-sandcastle";

export default defineConfig({
  plugins: [cesiumSandcastle({ placeholder: "__CESIUM_BASE_URL__", cesiumBaseUrl: "/cesium/" })]
});
```

### 3. Using the Extension Library

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

> `HeatLayer` and `WindLayer` are currently placeholder implementations; APIs are unstable, please do not rely on them in production.

## Key Entry Points (for Issue Location)

| File | Purpose |
| :--- | :--- |
| `packages/cesium-exts/index.ts` | Library external export entry |
| `packages/cesium-exts/tsdown.config.ts` | Library bundling config (ESM/CJS, external cesium, d.ts) |
| `packages/cesium-exts/types/cesium-extensions.d.ts` | Supplementary type declarations for Cesium internal rendering APIs |
| `packages/vite-cesium-plugin/src/index.ts` | Cesium integration plugin main body |
| `apps/cesium-examples/vite.config.ts` | Example app build and plugin assembly |
| `apps/cesium-examples/src/util/IframeBridge.ts` | Communication bridge between editor and preview iframe |
| `pnpm-workspace.yaml` / `turbo.json` | Workspace and task orchestration configuration |

## Adding Examples

Create under `apps/cesium-examples/gallery/cesium/<example-name>/`:

- `sandcastle.yaml`: Metadata such as title, tags, etc.
- `index.html`: DOM structure (can use `__CESIUM_BASE_URL__` placeholder)
- `main.js`: Example logic
- `thumbnail.jpg`: Thumbnail (can reuse `placeholder-thumbnail.jpg` if missing)

## Adding a Package

1. Create a package in `packages/<name>/`, set `type: "module"`.
2. `tsconfig.json` extends `@repo/config-typescript/base.json` (or `node.json` / `react.json`).
3. `eslint.config.js` reuses `@repo/config-eslint/base`.
4. Write external dependencies uniformly as `catalog:<group>`, internal dependencies as `workspace:*`.
5. Align script names with turbo tasks: `build`, `check-types`, `lint`, `test`, `clean`.

## Conventions

- The root directory only contains engineering orchestration and public configurations; `packages/*` produce reusable capabilities and do not reverse-depend on `apps/*`.
- Cesium is declared as a `peerDependency` in both libraries and plugins to prevent multiple Cesium instances in the application.
- Commit messages are verified by husky + `scripts/verify-commit.sh`, automatically executing Prettier and ESLint before committing.