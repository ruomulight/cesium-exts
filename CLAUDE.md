# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Cesium extension library monorepo providing visualization components (HeatLayer, WindLayer) with a Vite+React development environment for testing and demos.

## Common Commands

```bash
pnpm dev           # Start development server (cesium-web app)
pnpm dev:cesium-web # Start only the cesium-web app
pnpm build          # Build all packages (engine library + apps)
pnpm lint           # Run ESLint on all packages
pnpm format         # Format all files with Prettier
```

## Architecture

### Monorepo Structure

- **apps/cesium-web** - Development/demo application (Vite + React)
- **packages/engine** - Core extension library (HeatLayer, WindLayer, Utils)

### Sandboxed Code Execution

The `cesium-web` app uses a Sandcastle-style pattern where user code runs in an isolated iframe (`apps/cesium-web/public/templates/bucket.html`). Communication between the main app and sandbox uses `IframeBridge` via postMessage.

Key files:

- [Bucket.tsx](apps/cesium-web/src/components/Bucket/Bucket.tsx) - Sandboxed iframe container
- [IframeBridge.ts](apps/cesium-web/src/util/IframeBridge.ts) - Message bridge between app and iframe
- [SandcastleEditor.tsx](apps/cesium-web/src/components/SandcastleEditor/SandcastleEditor.tsx) - Monaco-based code editor

### Engine Package Structure

- `packages/engine/src/modules/HeatLayer/` - Heat map visualization
- `packages/engine/src/modules/WindLayer/` - Wind field visualization
- `packages/engine/src/Utils/` - Utility functions (cesiumUtils, etc.)
- Build uses Gulp + Rollup (configured in `gulpfile.js`, `rollup.config.js`)

### Cesium Initialization

[cesiumInit.ts](apps/cesium-web/src/plugins/cesiumInit.ts) configures:

- `CESIUM_BASE_URL` for static resources
- Cesium Ion access token

## Code Style

- TypeScript strict mode enabled
- ESLint with react-hooks and react-refresh plugins
- Prettier for formatting
- Unused variables must be prefixed with `_` to be ignored by ESLint
