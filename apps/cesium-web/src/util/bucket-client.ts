/**
 * 运行在 Viewer 的 bucket.html 页面上的最小 JS 代码。
 * 该代码负责与外部应用进行通信，请求并执行代码。
 */

import { originalWarn, wrapConsoleFunctions } from "./ConsoleWrapper";
import { type BridgeToApp, IframeBridge } from "./IframeBridge";
import DOMPurify from "dompurify";

declare global {
  interface Window {
    /**
     * 由 bucket-client.ts 的 init() 函数设置。
     * 用于 Sandcastle 辅助函数，确保向正确的外部源发送消息。
     */
    SANDCASTLE_OUTER_ORIGIN: string;
  }
}

/**
 * 外部应用的 Origin 源。
 * 该常量通常由构建工具进行注入。
 */
const OUTER_ORIGIN = __OUTER_ORIGIN__;

/**
 * 在页面中加载并运行 Sandcastle 代码。
 *
 * @param code 要运行的 JavaScript 代码内容。
 * @param html 要添加到页面中的 HTML 结构，添加前会使用 DOMPurify 进行清理分析。
 */
function loadSandcastle(code: string, html: string) {
  if (document.body.dataset.sandcastleLoaded === "yes") {
    originalWarn("A Sandcastle was already loaded on this page and conflicts could occur. Aborting");
    return;
  }

  const sanitized = DOMPurify.sanitize(html, {
    ADD_TAGS: ["style"],
    FORCE_BODY: true
  });

  const div = document.createElement("div");
  // Firefox 140+ 中样式表导入可能会出现异常，这是一个临时修复方案
  // 确认在 v147 版本中依然存在此问题
  // 详情参见: https://github.com/CesiumGS/cesium/issues/12700
  div.innerHTML = sanitized.replace(/@import/, "@import ");
  document.body.appendChild(div);

  const script = document.createElement("script");
  script.type = "module";
  script.textContent = code;
  document.body.appendChild(script);

  document.body.dataset.sandcastleLoaded = "yes";
}

/**
 * 页面初始化函数。
 * 设置必要的全局变量，建立 IframeBridge，并注册消息监听器以便接收来自桌面的代码执行指令。
 */
function initPage() {
  // 设置此变量，以便 Sandcastle 辅助函数知道将消息发送到何处
  window.SANDCASTLE_OUTER_ORIGIN = OUTER_ORIGIN;

  const bridge: BridgeToApp = new IframeBridge(OUTER_ORIGIN, window.parent);

  wrapConsoleFunctions(bridge);

  bridge.addEventListener(message => {
    if (message.type === "reload") {
      window.location.reload();
    } else if (message.type === "runCode") {
      loadSandcastle(message.code, message.html);
    }
  });

  bridge.sendMessage({ type: "bucketReady" });
}

/**
 * 监听窗口 load 事件，触发页面初始化。
 */
window.addEventListener("load", () => {
  initPage();
});
