import { type HeatmapOptions } from "./config";
import { Heatmap } from "./core";

export type {
  HeatmapDataSet,
  HeatmapExtrema,
  HeatmapInputPoint,
  HeatmapOptions,
  HeatmapPoint,
  HeatmapRendererType
} from "./config";
export { Heatmap };

/**
 * Cesium 热力图层。
 *
 * 当前仍为占位实现，API 未稳定。内部画布引擎见 {@link Heatmap}。
 */
export class HeatLayer {
  /** 内部画布热力引擎 */
  public readonly heatmap: Heatmap;

  /**
   * @param options 传给 {@link Heatmap} 的配置
   */
  constructor(options: HeatmapOptions = {}) {
    this.heatmap = new Heatmap(options);
  }
}
