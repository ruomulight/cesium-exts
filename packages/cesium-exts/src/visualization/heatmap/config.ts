/** 热力图渲染后端。`webgl` 不可用时会自动回退到 `canvas2d`。 */
export type HeatmapRendererType = "webgl" | "canvas2d";

/**
 * 标准化后的热力点（画布像素坐标）。
 */
export interface HeatmapPoint {
  /** X 坐标（像素） */
  x: number;
  /** Y 坐标（像素，原点在画布左上） */
  y: number;
  /** 热力强度 */
  value: number;
  /** 点半径（像素）；缺省时使用实例 `radius` */
  radius?: number;
}

/**
 * 原始输入点。可通过 {@link HeatmapOptions.xField} / {@link HeatmapOptions.yField} /
 * {@link HeatmapOptions.valueField} 映射字段名，不必使用 `x` / `y` / `value`。
 */
export interface HeatmapInputPoint {
  /** 覆盖默认点半径（像素） */
  radius?: number;
  [field: string]: unknown;
}

/**
 * 完整数据集。`min` / `max` 会覆盖根据点值推算出的极值，用于固定色带范围。
 */
export interface HeatmapDataSet {
  /** 色带最小值 */
  min: number;
  /** 色带最大值 */
  max: number;
  /** 热力点列表；相同像素位置会累加 `value` */
  data: HeatmapInputPoint[];
}

/**
 * 当前数据极值快照，随 {@link HeatmapOptions.onExtremaChange} 回调抛出。
 */
export interface HeatmapExtrema {
  /** 当前最小值 */
  min: number;
  /** 当前最大值 */
  max: number;
  /** 正在使用的渐变色带 */
  gradient: Record<number, string>;
}

/**
 * {@link Heatmap} 初始化与 {@link Heatmap.configure} 的配置项。
 *
 * 未提供的字段使用 {@link HEATMAP_DEFAULTS}。`opacity` 为 `0` 时表示不使用统一透明度，
 * 改由 `minOpacity` / `maxOpacity` 按强度夹取。
 */
export interface HeatmapOptions {
  /** 挂载画布的 DOM 容器；仅离屏绘制时可省略 */
  container?: HTMLElement | undefined;
  /** 复用已有 canvas；不传则内部创建 */
  canvas?: HTMLCanvasElement | undefined;
  /** 画布宽度（像素）；缺省时读取 container 计算样式 */
  width?: number | undefined;
  /** 画布高度（像素）；缺省时读取 container 计算样式 */
  height?: number | undefined;
  /** 渲染后端，默认 `webgl` */
  renderer?: HeatmapRendererType | undefined;
  /** 默认点半径（像素），默认 40 */
  radius?: number | undefined;
  /**
   * 色带。键为 `0~1` 的色停位置，值为 CSS 颜色。
   * 默认蓝 → 绿 → 黄 → 红。
   */
  gradient?: Record<number, string> | undefined;
  /** 径向模糊程度，`0` 为实心圆，`1` 为最散，默认 0.85 */
  blur?: number | undefined;
  /** 统一透明度（0~1）。为 0 时改用 min/maxOpacity，默认 0 */
  opacity?: number | undefined;
  /** 最大透明度（0~1），默认 1 */
  maxOpacity?: number | undefined;
  /** 最小透明度（0~1），默认 0 */
  minOpacity?: number | undefined;
  /** 为 true 时使用色带自身的 alpha，而不是强度推导的透明度 */
  useGradientOpacity?: boolean | undefined;
  /** 画布 CSS 背景色 */
  backgroundColor?: string | undefined;
  /** X 字段名，默认 `"x"` */
  xField?: string | undefined;
  /** Y 字段名，默认 `"y"` */
  yField?: string | undefined;
  /** 强度字段名，默认 `"value"` */
  valueField?: string | undefined;
  /** 极值变化时回调（setData / addData 导致 min/max 更新） */
  onExtremaChange?: ((extrema: HeatmapExtrema) => void) | undefined;
}

/**
 * 填入默认值后的完整配置，供 Store 与 Renderer 内部使用。
 */
export interface ResolvedHeatmapOptions {
  container?: HTMLElement | undefined;
  canvas?: HTMLCanvasElement | undefined;
  width?: number | undefined;
  height?: number | undefined;
  renderer: HeatmapRendererType;
  radius: number;
  gradient: Record<number, string>;
  blur: number;
  opacity: number;
  maxOpacity: number;
  minOpacity: number;
  useGradientOpacity: boolean;
  backgroundColor?: string | undefined;
  xField: string;
  yField: string;
  valueField: string;
  onExtremaChange?: ((extrema: HeatmapExtrema) => void) | undefined;
}

/**
 * 热力图默认配置。
 *
 * `opacity: 0` 表示不启用统一透明度。
 */
export const HEATMAP_DEFAULTS = {
  renderer: "webgl" as HeatmapRendererType,
  radius: 40,
  gradient: {
    0.25: "rgb(0,0,255)",
    0.55: "rgb(0,255,0)",
    0.85: "rgb(253,222,0)",
    1: "rgb(255,0,0)"
  } satisfies Record<number, string>,
  blur: 0.85,
  opacity: 0,
  maxOpacity: 1,
  minOpacity: 0,
  useGradientOpacity: false,
  xField: "x",
  yField: "y",
  valueField: "value"
};

/**
 * 将用户配置与 {@link HEATMAP_DEFAULTS} 合并为内部完整配置。
 *
 * @param options 用户传入的局部配置
 */
export function resolveHeatmapOptions(options: HeatmapOptions = {}): ResolvedHeatmapOptions {
  return {
    container: options.container,
    canvas: options.canvas,
    width: options.width,
    height: options.height,
    renderer: options.renderer ?? HEATMAP_DEFAULTS.renderer,
    radius: options.radius ?? HEATMAP_DEFAULTS.radius,
    gradient: options.gradient ?? { ...HEATMAP_DEFAULTS.gradient },
    blur: options.blur ?? HEATMAP_DEFAULTS.blur,
    opacity: options.opacity ?? HEATMAP_DEFAULTS.opacity,
    maxOpacity: options.maxOpacity ?? HEATMAP_DEFAULTS.maxOpacity,
    minOpacity: options.minOpacity ?? HEATMAP_DEFAULTS.minOpacity,
    useGradientOpacity: options.useGradientOpacity ?? HEATMAP_DEFAULTS.useGradientOpacity,
    backgroundColor: options.backgroundColor,
    xField: options.xField ?? HEATMAP_DEFAULTS.xField,
    yField: options.yField ?? HEATMAP_DEFAULTS.yField,
    valueField: options.valueField ?? HEATMAP_DEFAULTS.valueField,
    onExtremaChange: options.onExtremaChange
  };
}
