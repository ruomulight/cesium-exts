import { type ResolvedHeatmapOptions } from "./config";

/**
 * 渲染器使用的热力点。`radius` 已解析为像素值。
 */
export interface HeatmapRenderPoint {
  /** X 坐标（像素） */
  x: number;
  /** Y 坐标（像素，原点在画布左上） */
  y: number;
  /** 热力强度；同一坐标在 Store 中聚合后再交给渲染器。 */
  value: number;
  /** 点半径（像素） */
  radius: number;
}

/**
 * 一次绘制所需的数据快照。渲染器只读取数据，不得修改点对象。
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
   * 仅在极值未变且全部为新坐标时由引擎调用。
   *
   * @param data - 新增点与当前色带范围。
   */
  renderPartial(data: HeatmapRenderData): void;
  /**
   * 清空后全量重绘。
   *
   * @param data - 全部聚合点与色带范围；空点集会清空输出。
   */
  renderAll(data: HeatmapRenderData): void;
  /**
   * 更新样式与尺寸；调用方随后负责重新绘制。
   *
   * @param config - 已完成校验的完整配置。
   */
  updateConfig(config: ResolvedHeatmapOptions): void;
  /**
   * 调整画布与内部缓冲尺寸；宽高未变时不重新分配缓冲。
   *
   * @param width - 宽度，非负整数像素。
   * @param height - 高度，非负整数像素。
   */
  setDimensions(width: number, height: number): void;
  /**
   * 读取指定像素的热力值。
   *
   * @param point - 以左上角为原点的像素坐标，小数向下取整。
   * @returns 由 alpha 反推的近似值；无效坐标、越界或透明像素返回 0。
   */
  getValueAt(point: { x: number; y: number }): number;
  /**
   * 导出当前画面。
   *
   * @returns PNG Data URL；零尺寸画布返回 `data:,`。
   */
  getDataURL(): string;
  /** 释放 GPU / DOM 资源，可重复调用。仅移除引擎创建的画布。 */
  destroy(): void;
}
