import { type ResolvedHeatmapOptions } from "./config";

/**
 * 渲染器使用的热力点。`radius` 已解析为像素值。
 */
export interface HeatmapRenderPoint {
  /** X 坐标（像素） */
  x: number;
  /** Y 坐标（像素，原点在画布左上） */
  y: number;
  /** 热力强度；增量绘制时为本次叠加值，全量绘制时为聚合后总值 */
  value: number;
  /** 点半径（像素） */
  radius: number;
}

/**
 * 一次绘制所需的数据快照。
 */
export interface HeatmapRenderData {
  /** 色带最小值，用于强度归一化 */
  min: number;
  /** 色带最大值，用于强度归一化 */
  max: number;
  /** 待绘制的点 */
  points: HeatmapRenderPoint[];
}

/**
 * 热力图渲染器契约。Canvas2D 与 WebGL 实现必须行为对齐。
 */
export interface HeatmapRenderer {
  /** 输出画布 */
  readonly canvas: HTMLCanvasElement;
  /**
   * 增量绘制。将 `points` 叠加到已有 alpha 缓冲上再上色。
   * 仅在极值未变时由引擎调用。
   */
  renderPartial(data: HeatmapRenderData): void;
  /** 清空后全量重绘 */
  renderAll(data: HeatmapRenderData): void;
  /** 更新渐变、透明度、模糊和尺寸等样式 */
  updateConfig(config: ResolvedHeatmapOptions): void;
  /** 调整画布与内部缓冲尺寸；宽高未变时为 no-op */
  setDimensions(width: number, height: number): void;
  /**
   * 读取指定像素的热力值。
   *
   * @returns 由 alpha 反推的数值；画布无效时返回 0
   */
  getValueAt(point: { x: number; y: number }): number;
  /** 将当前画面导出为 Data URL */
  getDataURL(): string;
  /** 释放 GPU / DOM 资源。由引擎创建的 canvas 会从 DOM 移除 */
  destroy(): void;
}
