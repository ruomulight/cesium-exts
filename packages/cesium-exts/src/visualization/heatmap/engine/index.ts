import { type HeatmapOptions } from "./config";
import { Heatmap } from "./core";

export type {
  HeatmapDataSet,
  HeatmapDataSnapshot,
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
 *
 * @alpha
 */
export class HeatLayer {
  /** 内部画布热力引擎，负责像素坐标下的数据与绘制。 */
  public readonly heatmap: Heatmap;

  /**
   * 创建占位图层及其画布引擎。
   *
   * @param options - 传给 {@link Heatmap} 的配置。
   */
  constructor(options: HeatmapOptions = {}) {
    this.heatmap = new Heatmap(options);
  }

  /** 释放内部引擎的画布与渲染资源，可重复调用。 */
  public destroy(): void {
    this.heatmap.destroy();
  }
}
