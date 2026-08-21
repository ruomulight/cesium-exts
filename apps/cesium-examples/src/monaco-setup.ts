/**
 * @file Monaco Editor 本地加载配置。
 *
 * 默认情况下 `@monaco-editor/react` 会从 jsdelivr CDN 运行时下载 Monaco 核心，
 * 首次进入会有明显网络延迟。本模块将 Monaco 指向本地安装的 `monaco-editor` 包，
 * 由 Vite 打包进产物，消除 CDN 请求。
 *
 * 同时配置各语言的 Web Worker（通过 Vite 的 `?worker` 后缀导入），
 * 为 JSON / CSS / HTML / TypeScript(含 JavaScript) 提供语法高亮、智能提示等后台能力。
 *
 * 需在应用入口（`main.tsx`）中于 `<Editor>` 挂载前以副作用导入方式引入本模块。
 */

import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";

/**
 * Monaco Web Worker 环境，按语言标签分发对应的 worker 实例。
 *
 * @param _workerId - Monaco 内部分配的 worker 标识，此处未使用。
 * @param label - 语言标签（如 "json"、"typescript" 等），用于选择专用 worker；
 *                未匹配的语言回退到通用编辑器 worker。
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string): Worker {
    if (label === "json") return new jsonWorker();
    if (label === "css" || label === "scss" || label === "less") return new cssWorker();
    if (label === "html" || label === "handlebars" || label === "razor") return new htmlWorker();
    if (label === "typescript" || label === "javascript") return new tsWorker();
    return new editorWorker();
  }
};

// 让 @monaco-editor/react 使用本地 monaco-editor 包，而非 CDN
loader.config({ monaco });
