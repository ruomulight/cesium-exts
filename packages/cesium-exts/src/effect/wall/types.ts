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
 * 贴图沿墙面重复的次数。
 */
export interface GlowWallImageRepeat {
  /**
   * 沿墙长的重复次数。
   *
   * @defaultValue 1
   */
  x?: number;
  /**
   * 沿墙高的重复次数。
   *
   * @defaultValue 1
   */
  y?: number;
}

/**
 * 贴图流动方向。
 *
 * `vertical` 沿墙高，`horizontal` 沿墙长。
 */
export type GlowWallFlowAxis = "horizontal" | "vertical";

/**
 * 动态发光墙的初始化参数。
 *
 * 不传贴图时是向上流动的光带；传入贴图时改为沿墙面滚动图片。
 * 适用于电子围栏、警戒线。
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
   * 贴图 {@link flowAxis} 为 `horizontal` 时，正值改为沿墙长流动。
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
   * 流动贴图的 URL。
   *
   * 传入后墙面滚动这张图，不再使用程序化光带。透明像素不绘制，因此黑色底要做成透明。
   * 图片颜色会再乘上 {@link color}。不传时保持原来的光带。
   */
  image?: string;
  /**
   * 贴图在墙面上的重复次数。`x` 沿墙长，`y` 沿墙高。
   *
   * 只在设置了 {@link image} 时生效。
   *
   * @defaultValue `{ x: 1, y: 1 }`
   */
  imageRepeat?: GlowWallImageRepeat;
  /**
   * 贴图流动方向。
   *
   * `vertical` 沿墙高，正速度向上，和无图时光带一致。
   * `horizontal` 沿墙长，适合箭头指向水平方向的贴图。
   *
   * @defaultValue "vertical"
   */
  flowAxis?: GlowWallFlowAxis;
  /**
   * 创建后是否立即显示。
   *
   * @defaultValue true
   */
  show?: boolean;
}
