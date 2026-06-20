/**
 * Sandcastle 插件配置选项
 */
export interface SandcastlePluginOptions {
  /**
   * Cesium 静态资源的基础路径
   * @default "/cesium/"
   */
  cesiumBaseUrl?: string;

  /**
   * 自定义 Sandcastle.ts 的输出路径（相对于 outDir）
   * @default "templates"
   */
  sandcastleOutDir?: string;
}

/**
 * Sandcastle 构建元数据
 */
export interface SandcastleBuildMeta {
  /** 构建时间戳 */
  buildTime: string;
  /** Vite 版本 */
  viteVersion: string;
  /** 是否为生产构建 */
  isProduction: boolean;
}
