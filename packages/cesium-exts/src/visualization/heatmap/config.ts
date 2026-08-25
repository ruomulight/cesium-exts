/**
 * 热力图配置类，包含默认配置值
 */
export class HeatmapConfig {
  /** 默认点半径 */
  static defaultRadius: number = 40;
  /** 默认渲染器类型 */
  static defaultRenderer: string = "webgl";
  /** 默认渐变颜色 */
  static defaultGradient: { [key: number]: string } = {
    0.25: "rgb(0,0,255)",
    0.55: "rgb(0,255,0)",
    0.85: "rgb(253,222,0)",
    1.0: "rgb(255,0,0)"
  };
  /** 默认最大透明度 */
  static defaultMaxOpacity: number = 1;
  /** 默认最小透明度 */
  static defaultMinOpacity: number = 0;
  /** 默认模糊度 */
  static defaultBlur: number = 0.85;
  /** 默认 X 坐标字段名 */
  static defaultXField: string = "x";
  /** 默认 Y 坐标字段名 */
  static defaultYField: string = "y";
  /** 默认数值字段名 */
  static defaultValueField: string = "value";
  /** 插件配置 */
  static plugins: any = {};
}
