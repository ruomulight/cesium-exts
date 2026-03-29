/// <reference types="vite/client" />

/**
 * 全局常量，由 Vite define 在构建时注入
 * 这些常量用于 Bucket 组件的跨域通信配置
 */

/** iframe bucket 页面的 origin，构建时注入 */
declare const __INNER_ORIGIN__: string;

/** 父级应用的 origin，构建时注入 */
declare const __OUTER_ORIGIN__: string;

/** Cesium 资源的基础路径 */
declare const __CESIUM_BASE_URL__: string;
