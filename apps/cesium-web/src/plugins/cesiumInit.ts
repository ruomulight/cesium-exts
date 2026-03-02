import "cesium/Build/Cesium/Widgets/widgets.css";
import * as Cesium from "cesium";

/**
 * 扩展 Window 接口，解决 TypeScript 对自定义全局变量的报错
 */
declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

/**
 * 初始化 Cesium 全局配置
 * 主要用于配置静态资源路径和鉴权 Token
 */
export function cesiumInit() {
  // 获取 Vite 配置中的 base 路径 (例如: "/" 或 "/my-app/")
  const sysBaseUrl = import.meta.env.BASE_URL;
  // 判断是否为开发环境
  const isDev = import.meta.env.DEV;

  // Cesium 静态资源通常被复制到的目标文件夹名称
  const cesiumResourcePath = `${sysBaseUrl}cesium/`;

  /**
   * 配置 window.CESIUM_BASE_URL
   * ------------------------------------------------------------------
   * 作用：告诉 Cesium 引擎去哪里加载 Web Workers、纹理图片、地球数据等静态资源。
   *
   * 逻辑说明：
   * 1. 开发环境 (Development):
   *    Vite 在开发模式下，静态文件通常需要基于项目的 base 路径来访问。
   *    因此路径拼接为：`${sysBaseUrl}${cesiumResourcePath}`
   *
   * 2. 生产环境 (Production):
   *    通常在构建后，我们会在 index.html 同级目录下放置 cesium 文件夹。
   *    直接使用相对路径 "cesium/" 即可，或者根据 CDN 地址进行修改。
   */
  window.CESIUM_BASE_URL = isDev ? `${sysBaseUrl}node_modules/cesium/Build/Cesium/` : cesiumResourcePath;

  /**
   * 配置 Cesium Ion Access Token
   * 注意：在实际生产项目中，建议将 Token 放入 .env 文件中 (如 VITE_CESIUM_TOKEN)，
   * 通过 import.meta.env.VITE_CESIUM_TOKEN 读取，避免 Token 泄露。
   */
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI4Y2M1MDE1Ny1mYmRhLTQwNmYtYjI5MS0zZjIzYTRlNDkwNGQiLCJpZCI6ODc4OTIsImlhdCI6MTcyNjkwMTU4NX0.t34SW6s6up61DdPH11v9-hfbz7sq7xe1UoqWn2PhQCQ";

  // 使用 window.console 绕过构建工具可能配置的 drop_console (去除 console) 规则
  // 确保在生产环境中也能看到 Cesium 初始化的路径信息，方便排查资源 404 问题
  window.console.log(`[Cesium Init] 模式: ${import.meta.env.MODE}, 资源路径 BaseURL: ${window.CESIUM_BASE_URL}`);
}

/**
 * 应用初始化 Hook
 * ------------------------------------------------------------------
 * 作用：封装所有应用启动时需要执行的初始化逻辑。
 *
 * 使用示例 (在应用的 main.ts 或 App.vue 中调用):
 *
 * ```typescript
 * import { useAppInitialization } from "@/plugins/cesiumInit";
 *
 * // 执行初始化
 * useAppInitialization();
 * ```
 */
export const useAppInitialization = () => {
  cesiumInit();
};
