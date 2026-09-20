import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { normalizePath, type Plugin, type ResolvedConfig, type ViteDevServer } from "vite";

import {
  CESIUM_EXTS_ENTRY_NAME,
  CESIUM_EXTS_HMR_EVENT,
  CESIUM_EXTS_PLACEHOLDER,
  registerBuildEntry,
  toFsUrl
} from "./shared.ts";

export { CESIUM_EXTS_HMR_EVENT, CESIUM_EXTS_PLACEHOLDER };

export interface CesiumExtsDevOptions {
  /**
   * HTML importmap 中的占位符。
   * @default "__CESIUM_EXTS_URL__"
   */
  placeholder?: string;
}

interface ExtsLocation {
  entry: string;
  pkgRoot: string;
}

/**
 * Vite 插件：开发期把 `cesium-exts` 源码直接交给示例 iframe 使用。
 *
 * - 把 `.glsl` 编译为内存 ES module
 * - 将库内 `import … from "cesium"` 改写为 `globalThis.Cesium`，避免第二份引擎
 * - 开发期替换 importmap 占位符为 `/@fs` 源码地址
 * - 将库注册为独立构建入口；生产环境的 `bucket.html` 由 sandcastle 插件统一回写
 * - 监听库源码变更，通知示例应用重跑预览 iframe
 */
export function cesiumExtsDev(options: CesiumExtsDevOptions = {}): Plugin {
  const placeholder = options.placeholder ?? CESIUM_EXTS_PLACEHOLDER;

  const ctx: {
    config?: ResolvedConfig;
    location?: ExtsLocation;
  } = {};

  function getLocation(root: string): ExtsLocation {
    if (!ctx.location) {
      ctx.location = resolveCesiumExtsLocation(root);
    }
    return ctx.location;
  }

  return {
    name: "vite-cesium-sandcastle:exts-dev",
    enforce: "pre",

    config(userConfig) {
      const root = userConfig.root ? resolve(userConfig.root) : process.cwd();
      const { entry } = getLocation(root);
      console.info(`[vite-cesium-sandcastle:exts-dev] source ${normalizePath(entry)}`);

      return {
        optimizeDeps: {
          // 预打包会缓存产物，改库源码后 iframe 经常看不到变化
          exclude: ["cesium-exts"]
        }
      };
    },

    configResolved(resolvedConfig) {
      ctx.config = resolvedConfig;
      const location = getLocation(resolvedConfig.root);

      if (resolvedConfig.command !== "build") {
        return;
      }

      registerBuildEntry(resolvedConfig, CESIUM_EXTS_ENTRY_NAME, location.entry);
    },

    resolveId(id: string, importer?: string) {
      if (id.startsWith("\0")) return null;
      if (id.endsWith(".glsl.js")) {
        return "\0" + (id.startsWith(".") ? resolve(dirname(importer ?? ""), id) : id);
      }
    },

    load(id: string) {
      if (id.startsWith("\0") && id.endsWith(".glsl.js")) {
        const glslPath = id.slice(1).replace(/\.glsl.js$/, ".glsl");
        if (!existsSync(glslPath)) {
          this.error(`[vite-cesium-sandcastle:exts-dev] .glsl file not found: ${glslPath}`);
        }
        return {
          code: `export default ${JSON.stringify(readFileSync(glslPath, "utf-8"))};`,
          map: { mappings: "" }
        };
      }
    },

    transform(code, id) {
      const location = ctx.location;
      if (!location || !isCesiumExtsSource(id, location.pkgRoot)) {
        return null;
      }
      if (!code.includes("from") || !code.includes("cesium")) {
        return null;
      }

      const rewritten = rewriteCesiumImports(code);
      return rewritten === code ? null : { code: rewritten, map: null };
    },

    transformIndexHtml: {
      order: "pre",
      handler(html) {
        if (ctx.config?.command === "build") {
          return html;
        }

        const root = ctx.config?.root ?? process.cwd();
        const location = ctx.location ?? getLocation(root);
        // 每次请求换 query，避免 iframe reload 后仍命中浏览器模块缓存
        const url = `${toFsUrl(location.entry)}?t=${Date.now()}`;
        return html.replaceAll(placeholder, url);
      }
    },

    configureServer(server) {
      const location = ctx.location ?? getLocation(server.config.root);
      watchCesiumExts(server, location);
    },

    handleHotUpdate({ file, server, modules }) {
      const location = ctx.location;
      if (!location || !isCesiumExtsFile(file, location.pkgRoot)) {
        return;
      }

      for (const mod of modules) {
        server.moduleGraph.invalidateModule(mod);
      }

      if (file.endsWith(".glsl")) {
        const glslJsId = "\0" + file.replace(/\.glsl$/, ".glsl.js");
        const mod = server.moduleGraph.getModuleById(glslJsId);
        if (mod) server.moduleGraph.invalidateModule(mod);
      }

      server.ws.send({ type: "custom", event: CESIUM_EXTS_HMR_EVENT });
      return [];
    }
  };
}

function resolveCesiumExtsLocation(root: string): ExtsLocation {
  const require = createRequire(join(root, "package.json"));
  const pkgJsonPath = realpathSync(require.resolve("cesium-exts/package.json"));
  const pkgRoot = dirname(pkgJsonPath);
  const entry = join(pkgRoot, "index.ts");

  if (!existsSync(entry)) {
    throw new Error(`[vite-cesium-sandcastle:exts-dev] cesium-exts entry not found: ${entry}`);
  }

  return { entry, pkgRoot };
}

function isCesiumExtsSource(id: string, pkgRoot: string): boolean {
  const file = normalizePath(id.split("?")[0] ?? id);
  if (!file.endsWith(".ts") && !file.endsWith(".tsx") && !file.endsWith(".js") && !file.endsWith(".mjs")) {
    return false;
  }
  if (file.endsWith(".d.ts")) {
    return false;
  }
  return isCesiumExtsFile(file, pkgRoot);
}

function isCesiumExtsFile(file: string, pkgRoot: string): boolean {
  const nFile = normalizePath(file).toLowerCase();
  const nRoot = normalizePath(pkgRoot).toLowerCase();
  return nFile === nRoot || nFile.startsWith(`${nRoot}/`);
}

function watchCesiumExts(server: ViteDevServer, location: ExtsLocation): void {
  server.watcher.add(location.pkgRoot);
  server.watcher.add("**/Shaders/**/*.glsl");
}

/**
 * 把运行时 cesium 导入改成全局对象，保持行结构以便堆栈行号大致对齐。
 * `import type` 不会被匹配，交给 ES 编译器删除。
 */
export function rewriteCesiumImports(code: string): string {
  return code
    .replace(
      /^([ \t]*)import\s+\*\s+as\s+(\w+)\s+from\s+["']cesium["']\s*;?[ \t]*$/gm,
      "$1const $2 = globalThis.Cesium;"
    )
    .replace(
      /^([ \t]*)import\s+(\w+)\s+from\s+["']cesium["']\s*;?[ \t]*$/gm,
      "$1const $2 = globalThis.Cesium;"
    )
    .replace(/^([ \t]*)import\s+\{([^}]+)\}\s+from\s+["']cesium["']\s*;?[ \t]*$/gm, (full, indent, spec) => {
      const destructure = namedImportsToDestructure(String(spec));
      return destructure ? `${indent}${destructure}` : full;
    });
}

function namedImportsToDestructure(spec: string): string {
  const bindings: string[] = [];

  for (const raw of spec.split(",")) {
    const part = raw.trim();
    if (!part || part.startsWith("type ")) {
      continue;
    }
    const renamed = /^(\w+)\s+as\s+(\w+)$/.exec(part);
    if (renamed) {
      bindings.push(`${renamed[1]}: ${renamed[2]}`);
      continue;
    }
    if (/^\w+$/.test(part)) {
      bindings.push(part);
    }
  }

  if (bindings.length === 0) {
    return "";
  }
  return `const { ${bindings.join(", ")} } = globalThis.Cesium;`;
}
