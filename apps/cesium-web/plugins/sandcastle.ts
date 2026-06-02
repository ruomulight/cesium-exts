import { basename } from "path";
import { type HtmlTagDescriptor, type Plugin } from "vite";

/**
 * Sandcastle 专用 Vite 插件，参照官方 Cesium Sandcastle 的 cesiumPathReplace + createSandcastleConfig 实现。
 *
 * 职责：
 * 1. 在 JS 层通过 `define` 注入 `__CESIUM_BASE_URL__`、`__INNER_ORIGIN__`、`__OUTER_ORIGIN__` 全局常量
 * 2. 在 HTML 层通过 `transformIndexHtml` 替换 `__CESIUM_BASE_URL__` 文本占位符
 *    （Vite 的 `define` 只替换 JS 标识符，无法替换 HTML 属性或字符串字面量中的占位符）
 * 3. 向 bucket.html 注入 import map，使 iframe 中动态注入的代码能解析 `import Sandcastle from "Sandcastle"` 等模块导入
 * 4. 在构建时将 templates/Sandcastle.ts 作为库模式单独编译，输出为独立的 JS 文件供 import map 引用
 *
 * @param cesiumBaseUrl  Cesium 静态资源的访问路径，应与 vite-cesium-plugin 的 cesiumBaseUrl 保持一致
 * @param importMap       模块名到 URL 的映射，用于注入到 bucket.html 的 import map 中
 * @param htmlFilenames   需要注入 import map 的 HTML 文件名列表，默认仅 bucket.html
 */
export function sandcastlePlugin(
  cesiumBaseUrl: string = "/cesium/",
  importMap: Record<string, string> = {
    Sandcastle: "../templates/Sandcastle.js",
    cesium: "../cesium/Cesium.js"
  },
  htmlFilenames: string[] = ["bucket.html"]
): Plugin {
  // 确保路径以 / 结尾
  if (!cesiumBaseUrl.endsWith("/")) {
    cesiumBaseUrl += "/";
  }

  return {
    name: "sandcastle-config",

    config() {
      return {
        define: {
          // Cesium 静态资源路径（用于 bucket.html 的内联脚本和 JS 模块）
          __CESIUM_BASE_URL__: JSON.stringify(cesiumBaseUrl),
          // iframe 通信的 origin：同源部署下使用 location.origin 在运行时动态获取
          __INNER_ORIGIN__: "location.origin",
          __OUTER_ORIGIN__: "location.origin"
        }
      };
    },

    transformIndexHtml: {
      // 必须在其他 transformIndexHtml 钩子（如 vite-cesium-plugin）之前执行，
      // 以确保 __CESIUM_BASE_URL__ 占位符先被替换，再让其他插件处理 HTML
      order: "pre",
      handler(html, ctx) {
        // 1. 替换 HTML 中所有 __CESIUM_BASE_URL__ 文本占位符
        //    （包括 href 属性和内联脚本中的字符串字面量）
        html = html.replaceAll("__CESIUM_BASE_URL__", cesiumBaseUrl);

        // 2. 向指定的 HTML 文件注入 import map
        //    使 iframe 中动态注入的代码能解析模块导入（如 import Sandcastle from "Sandcastle"）
        const filename = basename(ctx.filename);
        if (htmlFilenames.length > 0 && !htmlFilenames.includes(filename)) {
          return html;
        }

        const tags: HtmlTagDescriptor[] = [
          {
            tag: "script",
            attrs: { type: "importmap" },
            children: JSON.stringify({ imports: importMap }, null, 2),
            injectTo: "head-prepend"
          }
        ];

        return { html, tags };
      }
    }
  };
}
