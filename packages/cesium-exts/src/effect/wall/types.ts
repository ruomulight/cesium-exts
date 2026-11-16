import type * as Cesium from "cesium";

/**
 * 发光墙折线上的一个顶点。
 *
 * 经纬度用十进制度，高度用米。某个点没写高度时，回退到 {@link GlowWallOptions} 的统一高度。
 */
export interface GlowWallPosition {
  /** 经度（十进制度）。 */
  longitude: number;
  /** 纬度（十进制度）。 */
  latitude: number;
  /**
   * 该点墙顶高度（米）。
   *
   * @defaultValue 使用 {@link GlowWallOptions.maximumHeight}
   */
  maximumHeight?: number;
  /**
   * 该点墙底高度（米）。
   *
   * @defaultValue 使用 {@link GlowWallOptions.minimumHeight}
   */
  minimumHeight?: number;
}

/**
 * 动态发光墙的初始化参数。
 *
 * 适用于电子围栏、警戒线等需要沿墙面向上流动光带的场景。
 */
export interface GlowWallOptions {
  /**
   * 围栏折线顶点，至少 2 个。
   *
   * `closed` 为 true 且首尾不重合时，会自动把起点再补到末尾，形成闭合围栏。
   */
  positions: GlowWallPosition[];
  /**
   * 是否闭合成环。
   *
   * 电子围栏一般为 `true`，警戒线可设为 `false`。
   *
   * @defaultValue true
   */
  closed?: boolean;
  /**
   * 统一墙顶高度（米），顶点未单独指定 `maximumHeight` 时使用。
   *
   * @defaultValue 200
   */
  maximumHeight?: number;
  /**
   * 统一墙底高度（米），顶点未单独指定 `minimumHeight` 时使用。
   *
   * @defaultValue 0
   */
  minimumHeight?: number;
  /**
   * 发光颜色。CSS 颜色字符串或 `Cesium.Color`。颜色中的 alpha 会参与墙面透明度。
   *
   * @defaultValue "#00ffff"
   */
  color?: string | Cesium.Color;
  /**
   * 光带流动速度。
   *
   * 正值向上流，负值向下流，`0` 静止。
   *
   * @defaultValue 2
   */
  speed?: number;
  /**
   * 光带锐度，对应着色器里 `pow(position, glowPower)` 的指数。
   *
   * 越大光带越细，越小渐变越平。
   *
   * @defaultValue 6
   */
  glowPower?: number;
  /**
   * 光带之间的基础透明度，避免两道光带之间墙体完全消失。
   *
   * @defaultValue 0.1
   */
  baseAlpha?: number;
  /**
   * 自发光强度。略大于 `0` 时墙面更像光源。
   *
   * @defaultValue 0.2
   */
  emission?: number;
  /**
   * 创建后是否立即显示。
   *
   * @defaultValue true
   */
  show?: boolean;
}
