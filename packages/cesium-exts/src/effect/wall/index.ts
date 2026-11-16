/**
 * 动态发光墙的公开入口。
 *
 * 只导出 {@link GlowWallPrimitive} 及其配置类型。着色器和几何处理留在模块内部。
 */
export { GlowWallPrimitive } from "./GlowWallPrimitive";
export type { GlowWallOptions, GlowWallPosition } from "./types";
