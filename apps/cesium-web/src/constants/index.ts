/**
 * 应用常量定义
 */

/**
 * Sandcastle Bridge 通信标识
 */
export const SANDCASTLE_BRIDGE_ID = "sandcastle-bridge" as const;

/**
 * 本地存储键名
 */
export const STORAGE_KEYS = {
  /** 主题设置 */
  THEME: "cesium-web-theme",
  /** 编辑器设置 */
  EDITOR_SETTINGS: "cesium-web-editor-settings",
  /** 最近打开的示例 */
  RECENT_DEMOS: "cesium-web-recent-demos",
  /** 用户偏好设置 */
  USER_PREFERENCES: "cesium-web-preferences"
} as const;

/**
 * 默认配置
 */
export const DEFAULT_CONFIG = {
  /** 默认 Cesium 基础路径 */
  CESIUM_BASE_URL: "/cesium/",
  /** 默认编辑器字体大小 */
  EDITOR_FONT_SIZE: 14,
  /** 默认 Tab 大小 */
  EDITOR_TAB_SIZE: 2,
  /** 默认编辑器字体 */
  EDITOR_FONT_FAMILY: "JetBrains Mono, Menlo, Monaco, 'Courier New', monospace"
} as const;

/**
 * 路由路径
 */
export const ROUTES = {
  HOME: "/",
  GALLERY: "/gallery",
  ABOUT: "/about"
} as const;

/**
 * 消息类型
 */
export const MESSAGE_TYPES = {
  /** Bucket 准备就绪 */
  BUCKET_READY: "bucketReady",
  /** 重新加载 */
  RELOAD: "reload",
  /** 运行代码 */
  RUN_CODE: "runCode",
  /** 高亮代码 */
  HIGHLIGHT: "highlight"
} as const;

/**
 * 支持的编程语言
 */
export const SUPPORTED_LANGUAGES = {
  JAVASCRIPT: "javascript",
  TYPESCRIPT: "typescript",
  HTML: "html",
  CSS: "css"
} as const;
