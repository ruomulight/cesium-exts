import type { Plugin, ViteDevServer } from "vite";

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/**
 * Vite 插件：为 cesium-exts 提供开发模式下的内存构建。
 *
 * - 将 `.glsl` 着色器文件在内存中编译为 ES module（`export default "..."`）
 * - 监听 Shaders 目录下 `.glsl` 文件的变更，自动触发 HMR full-reload
 *
 * @returns Vite Plugin 实例
 */
export default function cesiumExtsDev(): Plugin {
  return {
    name: "vite-cesium-exts-dev",

    /**
     * 将 `.glsl.js` 导入解析为以 `\0` 开头的虚拟模块 ID。
     *
     * @param id - 模块导入路径
     * @param importer - 发起导入的模块路径
     * @returns 虚拟模块 ID（以 `\0` 开头），或 `null` 表示不处理
     */
    resolveId(id: string, importer?: string) {
      if (id.startsWith("\0")) return null;
      if (id.endsWith(".glsl.js")) {
        return "\0" + (id.startsWith(".") ? resolve(dirname(importer ?? ""), id) : id);
      }
    },

    /**
     * 加载以 `\0` 开头的 `.glsl.js` 虚拟模块。
     * 读取对应的 `.glsl` 文件内容，包装为 ES module 导出。
     *
     * @param id - 模块 ID（含 `\0` 前缀）
     * @returns 包含代码和空 sourcemap 的对象，若文件不存在则报错
     */
    load(id: string) {
      if (id.startsWith("\0") && id.endsWith(".glsl.js")) {
        const glslPath = id.slice(1).replace(/\.glsl\.js$/, ".glsl");
        if (!existsSync(glslPath)) {
          this.error(`[vite-cesium-exts-dev] .glsl file not found: ${glslPath}`);
        }
        return {
          code: `export default ${JSON.stringify(readFileSync(glslPath, "utf-8"))};`,
          map: { mappings: "" }
        };
      }
    },

    /**
     * 配置开发服务器，监听 `**\/Shaders/**\/\*.glsl` 文件变更。
     * 变更时使对应虚拟模块失效并触发 full-reload。
     *
     * @param server - Vite 开发服务器实例
     */
    configureServer(server: ViteDevServer) {
      server.watcher.add("**/Shaders/**/*.glsl");
      server.watcher.on("change", path => {
        if (!path.endsWith(".glsl")) return;
        const glslJsId = "\0" + path.replace(/\.glsl$/, ".glsl.js");
        const mod = server.moduleGraph.getModuleById(glslJsId);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
    }
  };
}
