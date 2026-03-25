import { basename } from "path";

/** @import {PluginOption} from 'vite' */

/**
 * 替换文件中的 Cesium 路径值的 Vite 插件
 * @param {string} cesiumBaseUrl 用于进行替换的基础路径
 * @returns {PluginOption}
 */
export const cesiumPathReplace = cesiumBaseUrl => {
  return {
    name: "custom-cesium-path-plugin",
    config(config) {
      config.define = {
        ...config.define,
        __CESIUM_BASE_URL__: JSON.stringify(cesiumBaseUrl)
      };
    },
    transformIndexHtml(html) {
      return html.replaceAll("__CESIUM_BASE_URL__", `${cesiumBaseUrl}`);
    }
  };
};

/**
 * 为构建的 HTML 文件指定 import map 的 Vite 插件
 * @param {Object<string, string>} imports 导入映射表 (import map)
 * @param {string[]} [filenames] 需要注入 import map 的文件名列表，默认包含 bucket.html 和 standalone.html
 * @returns {PluginOption}
 */
export const insertImportMap = (imports, filenames = ["bucket.html", "standalone.html"]) => {
  return {
    name: "custom-import-map",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        if (filenames.length > 0 && !filenames.includes(basename(ctx.filename))) {
          return;
        }
        return {
          html,
          tags: [
            {
              tag: "script",
              attrs: {
                type: "importmap"
              },
              children: JSON.stringify({ imports }, null, 2),
              injectTo: "head-prepend"
            }
          ]
        };
      }
    }
  };
};
