/** 热力图渲染后端；WebGL 初始化失败时自动回退到 Canvas 2D。 */
export type HeatmapRendererType = "webgl" | "canvas2d";

/**
 * 标准化后的热力点（画布像素坐标）。
 */
export interface HeatmapPoint {
  /** X 坐标（像素，原点在画布左上角）。 */
  x: number;
  /** Y 坐标（像素，向下为正）。 */
  y: number;
  /** 热力强度。 */
  value: number;
  /** 点半径（像素）；数据快照中的半径已填入默认值。 */
  radius?: number;
}

/**
 * 原始输入点。可通过 {@link HeatmapOptions.xField} / {@link HeatmapOptions.yField} /
 * {@link HeatmapOptions.valueField} 映射字段名，不必使用 `x` / `y` / `value`。
 */
export interface HeatmapInputPoint {
  /** 覆盖默认点半径（像素）；非有限值或非正值使用实例默认半径。 */
  radius?: number;
  /** 按配置的字段名读取坐标和强度；坐标支持有限数字及数字字符串。 */
  [field: string]: unknown;
}

/**
 * 完整输入数据集；`min` / `max` 指定本次替换后的色带范围。
 *
 * 范围必须有限且满足 `min <= max`。后续追加超出范围的点时，色带范围仍会扩展。
 */
export interface HeatmapDataSet {
  /** 色带最小值。 */
  min: number;
  /** 色带最大值。 */
  max: number;
  /** 热力点列表；坐标完全相同的点会累加强度，并保留首次写入的半径。 */
  data: HeatmapInputPoint[];
}

/** 聚合数据的独立快照；修改其中的数组或点对象不会影响热力图。 */
export interface HeatmapDataSnapshot {
  /** 当前色带最小值。 */
  min: number;
  /** 当前色带最大值。 */
  max: number;
  /** 聚合后的标准点，不受输入字段映射影响。 */
  data: HeatmapPoint[];
}

/**
 * 当前色带范围快照，传给 {@link HeatmapOptions.onExtremaChange} 回调。
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
  /** 画布宽度（像素）；有限非负数向下取整，缺省时读取容器计算样式或画布宽度。 */
  width?: number | undefined;
  /** 画布高度（像素）；有限非负数向下取整，缺省时读取容器计算样式或画布高度。 */
  height?: number | undefined;
  /** 渲染后端，默认 `webgl` */
  renderer?: HeatmapRendererType | undefined;
  /** 默认点半径（像素），必须为有限正数，默认 40；调整时仅影响后续的新坐标。 */
  radius?: number | undefined;
  /**
   * 非空色带。键为 `0~1` 的有限色停位置，值为 CSS 颜色；解析时复制，避免外部修改。
   * 默认蓝 → 绿 → 黄 → 红。
   */
  gradient?: Record<number, string> | undefined;
  /** 径向模糊程度；有限值夹取至 `0~1`，`0` 为实心圆，`1` 为最散，默认 0.85。 */
  blur?: number | undefined;
  /** 统一透明度；有限值夹取至 `0~1`，为 0 时改用 min/maxOpacity，默认 0。 */
  opacity?: number | undefined;
  /** 最大透明度；有限值夹取至 `0~1`，默认 1。 */
  maxOpacity?: number | undefined;
  /** 最小透明度；有限值夹取至 `0~maxOpacity`，默认 0。 */
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
  /** 替换、清空、手动设置范围，以及追加点使范围扩展时同步回调。 */
  onExtremaChange?: ((extrema: HeatmapExtrema) => void) | undefined;
}

/**
 * 经过校验、归一化并填入默认值的完整配置，供存储器和渲染器使用。
 */
export interface ResolvedHeatmapOptions {
  /** 可选画布挂载容器。 */
  container?: HTMLElement | undefined;
  /** 可选外部画布；其 DOM 所有权仍属于调用方。 */
  canvas?: HTMLCanvasElement | undefined;
  /** 显式指定的画布宽度，已归一化为非负整数。 */
  width?: number | undefined;
  /** 显式指定的画布高度，已归一化为非负整数。 */
  height?: number | undefined;
  /** 请求的渲染后端。 */
  renderer: HeatmapRendererType;
  /** 后续新点使用的有限正半径。 */
  radius: number;
  /** 与调用方对象隔离的渐变色带。 */
  gradient: Record<number, string>;
  /** 径向模糊程度，范围为 `0~1`。 */
  blur: number;
  /** 统一透明度，范围为 `0~1`；0 表示按强度计算。 */
  opacity: number;
  /** 最大透明度，范围为 `0~1`。 */
  maxOpacity: number;
  /** 最小透明度，范围为 `0~maxOpacity`。 */
  minOpacity: number;
  /** 是否使用色带自身的透明度。 */
  useGradientOpacity: boolean;
  /** 可选画布 CSS 背景色。 */
  backgroundColor?: string | undefined;
  /** 后续输入点的 X 坐标字段。 */
  xField: string;
  /** 后续输入点的 Y 坐标字段。 */
  yField: string;
  /** 后续输入点的强度字段。 */
  valueField: string;
  /** 色带范围变化回调。 */
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
 * 校验用户配置并与 {@link HEATMAP_DEFAULTS} 合并。
 *
 * @remarks
 * 有限的模糊与透明度值会夹取至合法范围；尺寸向下取整。
 * 渐变会创建副本，CSS 颜色的有效性由 Canvas 渲染上下文校验。
 *
 * @param options - 用户传入的局部配置。
 * @returns 可供存储器和渲染器直接使用的独立配置。
 * @throws {@link RangeError} 尺寸、半径、模糊、透明度或渐变色停无效。
 */
export function resolveHeatmapOptions(options: HeatmapOptions = {}): ResolvedHeatmapOptions {
  const radius = options.radius ?? HEATMAP_DEFAULTS.radius;
  if (!Number.isFinite(radius) || radius <= 0) {
    throw new RangeError("[heatmap] radius must be a finite positive number.");
  }

  const gradient = { ...(options.gradient ?? HEATMAP_DEFAULTS.gradient) };
  const stops = Object.keys(gradient);
  if (
    stops.length === 0 ||
    stops.some(stop => !Number.isFinite(Number(stop)) || Number(stop) < 0 || Number(stop) > 1)
  ) {
    throw new RangeError("[heatmap] gradient must contain color stops between 0 and 1.");
  }

  const maxOpacity = resolveUnitInterval(options.maxOpacity ?? HEATMAP_DEFAULTS.maxOpacity, "maxOpacity");

  return {
    container: options.container,
    canvas: options.canvas,
    width: resolveDimension(options.width, "width"),
    height: resolveDimension(options.height, "height"),
    renderer: options.renderer ?? HEATMAP_DEFAULTS.renderer,
    radius,
    gradient,
    blur: resolveUnitInterval(options.blur ?? HEATMAP_DEFAULTS.blur, "blur"),
    opacity: resolveUnitInterval(options.opacity ?? HEATMAP_DEFAULTS.opacity, "opacity"),
    maxOpacity,
    minOpacity: Math.min(
      resolveUnitInterval(options.minOpacity ?? HEATMAP_DEFAULTS.minOpacity, "minOpacity"),
      maxOpacity
    ),
    useGradientOpacity: options.useGradientOpacity ?? HEATMAP_DEFAULTS.useGradientOpacity,
    backgroundColor: options.backgroundColor,
    xField: options.xField ?? HEATMAP_DEFAULTS.xField,
    yField: options.yField ?? HEATMAP_DEFAULTS.yField,
    valueField: options.valueField ?? HEATMAP_DEFAULTS.valueField,
    onExtremaChange: options.onExtremaChange
  };
}

/** 保留未显式指定的尺寸；显式尺寸必须为有限非负数。 */
function resolveDimension(value: number | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`[heatmap] ${name} must be a finite non-negative number.`);
  }
  return Math.floor(value);
}

/** 校验有限值后夹取至单位区间，避免向 Canvas 或着色器传入无效参数。 */
function resolveUnitInterval(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`[heatmap] ${name} must be finite.`);
  }
  return Math.max(0, Math.min(1, value));
}
