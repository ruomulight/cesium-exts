# AGENTS.md

Turborepo + pnpm + TypeScript monorepo for **CesiumJS extensions**: a core extension library, a set of Vite plugins, and a Sandcastle-style demo app. Most code comments and commit messages are written in Chinese.

> **README.md is stale.** It lists an old directory layout, a `typecheck` script, `tsup` builds, and Vitest — none of which match the current repo. Trust `package.json`, `pnpm-workspace.yaml`, `turbo.json`, and the tooling configs over the README.

## Toolchain

- **pnpm only** (v10.10.0, pinned via `packageManager`). Node `>=22.22.1`. `.npmrc` sets `engine-strict=true` and `verify-deps-before-run=install` (auto-installs before running scripts).
- Turborepo orchestrates tasks; task graph lives in `turbo.json` (`envMode: "strict"`).

## Commands

```bash
pnpm dev          # turbo dev (starts all dev servers)
pnpm build        # turbo build
pnpm check-types  # turbo check-types  ← NOT `pnpm typecheck`
pnpm lint         # turbo lint
pnpm lint:fix     # turbo lint -- --fix
pnpm format       # prettier . --write
pnpm test         # turbo test — currently a NO-OP (no test files/configs exist)
```

Single workspace: `pnpm --filter <name> <script>`. Filter names are the package `name` fields, e.g. `cesium-exts`, `vite-cesium-plugin`, `vite-cesium-exts-dev`, `vite-cesium-sandcastle`, `cesium-examples`, `@repo/config-eslint`.

- `pnpm test` is wired in `turbo.json` but **no package defines a `test` script or vitest config** — it runs nothing. Don't assume tests exist.
- `cesium-exts` has no `check-types` script; its type declarations are generated during `gulp build`.

## Dependency management (pnpm catalogs)

External versions are centralized in `pnpm-workspace.yaml` under named catalogs: `cesium`, `tooling`, `eslint`, `react-app`, `cesium-plugin`. Reference them as `"catalog:<group>"` in package.json instead of literal versions. Cesium is pinned as `cesium: ^1.142.0` (the core lib's description claims v1.140.1 — the catalog is the source of truth).

## Workspace layout

- `packages/cesium-exts` — the core extension library. Public surface is `index.ts`, exporting `HeatLayer`, `RadarScanPrimitive`, `WindLayer`, and `cesiumUtils`. Modules live under `src/modules/<Name>/`.
- `packages/vite-cesium-plugin` — integrates CesiumJS into Vite (static serving in dev, injects `CESIUM_BASE_URL`, copies Assets/Workers/Widgets on build, injects CSS/JS into `index.html`). Default mode externalizes Cesium as a `<script>` tag (`rebuildCesium: false`).
- `packages/vite-cesium-exts-dev` — dev-only in-memory build of `.glsl` shader files (virtual modules), for `cesium-exts` development. Not currently wired into the examples app's `vite.config.ts`.
- `packages/vite-cesium-sandcastle` — replaces the `__CESIUM_BASE_URL__` placeholder in HTML (Sandcastle template compatibility).
- `apps/cesium-examples` — React + Vite demo: a Cesium Sandcastle-like playground (gallery + Monaco editor + iframe `Bucket` runner + console mirror).
- `tooling/config-typescript`, `tooling/config-eslint`, `tooling/config-prettier` — shared configs consumed by every workspace via `@repo/config-*` imports.

## Non-obvious architecture

- **`cesium-exts` ships source, not built output.** Its `main`/`module` point at `index.ts` directly; the examples app consumes it via `workspace:*` from source. `build` runs `gulp build` (esbuild → ESM `dist/index.js` + CJS `dist/index.cjs`, plus `tsc --emitDeclarationOnly`), **not** tsup. `cesium` is a `peerDependency` and esbuild `external`.
- **`packages/cesium-exts/types/cesium-extensions.d.ts`** uses `declare module "cesium"` to hand-type Cesium's internal/undocumented rendering APIs (`ShaderSource`, `ShaderProgram`, `DrawCommand`, `ComputeCommand`, `Texture`, `Framebuffer`, `RenderState`, etc.). Cesium's public `.d.ts` does not export these — they exist here so the library can render via Cesium's low-level primitives. Do not expect these to match upstream types.

## Lint / format / TS conventions

- **There is no root `eslint.config.js`.** Each workspace has its own; the shared configs are `@repo/config-eslint/base` and `@repo/config-eslint/react`. `scripts/lint-staged-eslint.mjs` walks up from each staged file to the nearest `eslint.config.js` and lints per-workspace — keep that in mind when adding a new workspace (it must carry its own config or its files are skipped).
- ESLint enforces:
  - `@typescript-eslint/consistent-type-imports` with `inline-type-imports` style (`import { type Foo }`).
  - `perfectionist/sort-imports` / `sort-named-imports` / `sort-exports` — natural order, grouped (type → external → `@/`/internal → relative), one blank line between groups. `pnpm lint:fix` will reorder imports.
  - `no-unused-vars` is `warn`; `_`-prefixed params/vars are ignored.
- Prettier (via `@repo/config-prettier`): `printWidth: 120`, double quotes, semicolons, `trailingComma: "none"`, `arrowParens: "avoid"`.
- TypeScript presets: `@repo/config-typescript` (`base.json`, `react.json`, `node.json`). Strict mode, `moduleResolution: "bundler"`, `verbatimModuleSyntax`. The app adds `erasableSyntaxOnly` and project references (`tsconfig.app.json` / `tsconfig.node.json`).

## Git hooks (Husky)

- `pre-commit` → `lint-staged` (Prettier + ESLint `--fix` on staged files).
- `commit-msg` → `scripts/verify-commit.sh` enforces conventional commits: `type(scope?): message`. Allowed types: `feat fix docs style refactor perf test build ci chore revert remove config`. Non-conforming commits are rejected.
