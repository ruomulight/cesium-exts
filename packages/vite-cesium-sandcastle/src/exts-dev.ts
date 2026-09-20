import { existsSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { normalizePath, type Plugin, type ResolvedConfig } from "vite";

/** iframe importmap 中 cesium-exts 地址的占位符。 */
export const CESIUM_EXTS_PLACEHOLDER = "__CESIUM_EXTS_URL__";

/** 库源码变更后通知示例应用重跑 iframe 的 HMR 事件名。 */
export const CESIUM_EXTS_HMR_EVENT = "cesium-exts:update";

/** 生产构建时注册的独立入口名，对应 `js/cesium-exts.[hash].js`。 */
export const CESIUM_EXTS_ENTRY_NAME = "cesium-exts";

export interface ExtsLocation {
  entry: string;
  pkgRoot: string;
}

/**
 * 开发期把 `cesium-exts` 源码交给示例 iframe：
 * GLSL 内存模块、Cesium 单例改写、改库后通知预览重跑。
 * HTML 占位符由 Sandcastle 插件统一替换。
 */
export function createCesiumExtsDevPlugin(): Plugin {
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
    name: "vite-cesium-sandcastle:exts",
    enforce: "pre",

    config(userConfig) {
      const root = userConfig.root ? resolve(userConfig.root) : process.cwd();
      const { entry } = getLocation(root);
      console.info(`[vite-cesium-sandcastle] cesium-exts source ${normalizePath(entry)}`);

      return {
        optimizeDeps: {
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
          this.error(`[vite-cesium-sandcastle] .glsl file not found: ${glslPath}`);
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

    configureServer(server) {
      const location = ctx.location ?? getLocation(server.config.root);
      server.watcher.add(location.pkgRoot);
      server.watcher.add("**/Shaders/**/*.glsl");
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

export function resolveCesiumExtsLocation(root: string): ExtsLocation {
  const require = createRequire(join(root, "package.json"));
  const pkgJsonPath = realpathSync(require.resolve("cesium-exts/package.json"));
  const pkgRoot = dirname(pkgJsonPath);
  const entry = join(pkgRoot, "index.ts");

  if (!existsSync(entry)) {
    throw new Error(`[vite-cesium-sandcastle] cesium-exts entry not found: ${entry}`);
  }

  return { entry, pkgRoot };
}

export function toFsUrl(filePath: string): string {
  return `/@fs/${normalizePath(filePath)}`;
}

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

function registerBuildEntry(config: ResolvedConfig, entryName: string, entryPath: string): void {
  const targetOptions = config.build.rolldownOptions ?? config.build.rollupOptions;
  if (!targetOptions) {
    return;
  }

  const inputs = targetOptions.input;

  if (inputs === undefined) {
    targetOptions.input = {
      index: resolve(config.root, "index.html"),
      [entryName]: entryPath
    };
    return;
  }

  if (typeof inputs !== "object" || Array.isArray(inputs)) {
    return;
  }

  if (!(entryName in inputs)) {
    inputs[entryName] = entryPath;
  }
}
