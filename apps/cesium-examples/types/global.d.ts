import type packageJson from "../package.json";

declare global {
  /**
   * 平台的名称、版本、运行所需的`node`版本、依赖、构建时间的类型提示
   */
  declare const __APP_INFO__: typeof packageJson;

  /**
   * Cesium 静态资源的基础访问路径。
   * 由 sandcastlePlugin 在构建时通过 Vite `define` 注入，同时通过 `transformIndexHtml` 在 HTML 中替换占位符。
   * 例如: `"/cesium/"`
   */
  declare const __CESIUM_BASE_URL__: string;

  /**
   * 沙箱 iframe 通信所需的内部 origin。
   * 由 sandcastlePlugin 在构建时通过 Vite `define` 注入为 `location.origin`。
   * 用于 {@link IframeBridge} 的来源校验与 bucket URL 构建。
   */
  declare const __INNER_ORIGIN__: string;

  /**
   * 外部应用（父窗口）的 origin。
   * 由 sandcastlePlugin 在构建时通过 Vite `define` 注入为 `location.origin`。
   * 用于 bucket-client.ts 中 {@link IframeBridge} 的来源校验与 Sandcastle 辅助函数的 postMessage 目标限定。
   */
  declare const __OUTER_ORIGIN__: string;

  /**
   * Window 接口扩展
   */
  interface Window {
    /**
     * Cesium 静态资源的基础 URL
     * 在 bucket.html 的内联脚本中设置
     */
    CESIUM_BASE_URL: string;

    /**
     * 外部应用的 Origin 源
     * 由 bucket-client.ts 的 init() 函数设置
     */
    SANDCASTLE_OUTER_ORIGIN: string;
  }
}

export {};
