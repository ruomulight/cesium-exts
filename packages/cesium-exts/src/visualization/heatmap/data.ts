import { type HeatmapDataSet, type HeatmapInputPoint, type HeatmapPoint, type ResolvedHeatmapOptions } from "./config";
import { type HeatmapRenderData, type HeatmapRenderPoint } from "./types";

/** 相同画布像素的聚合键。 */
function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * `addData` 的调度结果，供 {@link Heatmap} 决定增量绘制还是全量重绘。
 */
export interface StoreAddResult {
  /** `none`：无有效点；`partial`：极值未变；`all`：极值变化或需全量 */
  render: "all" | "partial" | "none";
  /** min/max 是否在本次写入中被改写 */
  extremaChanged: boolean;
  /** 交给渲染器的数据。`partial` 时 `points` 仅为本次增量 */
  payload: HeatmapRenderData;
}

/**
 * 热力点存储器。
 *
 * 以 `"x,y"` 为键聚合相同像素上的强度；首次写入某点时锁定其 `radius`。
 * 坐标必须是有限数字，否则该点被忽略。
 */
export class Store {
  private readonly _points = new Map<string, HeatmapRenderPoint>();
  private _min = 0;
  private _max = 1;
  private _hasExtrema = false;
  private readonly _xField: string;
  private readonly _yField: string;
  private readonly _valueField: string;
  private _radius: number;

  /**
   * @param config 字段映射与默认半径
   */
  constructor(config: Pick<ResolvedHeatmapOptions, "xField" | "yField" | "valueField" | "radius">) {
    this._xField = config.xField;
    this._yField = config.yField;
    this._valueField = config.valueField;
    this._radius = config.radius;
  }

  /**
   * 更新缺省点半径，只影响后续未自带 `radius` 的新点。
   *
   * @param radius 半径（像素）
   */
  public setRadius(radius: number): void {
    this._radius = radius;
  }

  /**
   * 追加数据。极值变化时返回全量快照，否则只返回本次增量，避免把聚合总值再叠加一次。
   *
   * @param data 单个点或点数组
   */
  public addData(data: HeatmapInputPoint | HeatmapInputPoint[]): StoreAddResult {
    const items = Array.isArray(data) ? data : [data];
    const deltas: HeatmapRenderPoint[] = [];
    let extremaChanged = false;

    for (const item of items) {
      const result = this._ingest(item);
      if (!result) continue;
      deltas.push(result.delta);
      if (result.extremaChanged) extremaChanged = true;
    }

    if (deltas.length === 0) {
      return { render: "none", extremaChanged: false, payload: this.getRenderData() };
    }

    if (extremaChanged) {
      return { render: "all", extremaChanged: true, payload: this.getRenderData() };
    }

    return {
      render: "partial",
      extremaChanged: false,
      payload: { min: this._min, max: this._max, points: deltas }
    };
  }

  /**
   * 用完整数据集替换内部存储。`min` / `max` 以入参为准。
   *
   * @param data 数据集
   */
  public setData(data: HeatmapDataSet): HeatmapRenderData {
    this._points.clear();
    this._hasExtrema = false;

    for (const item of data.data) {
      this._ingest(item);
    }

    this._min = data.min ?? 0;
    this._max = data.max;
    this._hasExtrema = this._points.size > 0;
    return this.getRenderData();
  }

  /**
   * @param max 新的色带最大值
   */
  public setDataMax(max: number): HeatmapRenderData {
    this._max = max;
    this._hasExtrema = true;
    return this.getRenderData();
  }

  /**
   * @param min 新的色带最小值
   */
  public setDataMin(min: number): HeatmapRenderData {
    this._min = min;
    this._hasExtrema = true;
    return this.getRenderData();
  }

  /** 清空全部点，并将极值重置为 `min=0, max=1`。 */
  public clear(): HeatmapRenderData {
    this._points.clear();
    this._min = 0;
    this._max = 1;
    this._hasExtrema = false;
    return this.getRenderData();
  }

  /** 当前色带最小值 */
  public get min(): number {
    return this._min;
  }

  /** 当前色带最大值 */
  public get max(): number {
    return this._max;
  }

  /** 供渲染器使用的内部快照（点数组为浅拷贝） */
  public getRenderData(): HeatmapRenderData {
    return {
      min: this._min,
      max: this._max,
      points: [...this._points.values()]
    };
  }

  /** 对外导出的聚合数据（点对象为拷贝） */
  public getData(): { min: number; max: number; data: HeatmapPoint[] } {
    return {
      min: this._min,
      max: this._max,
      data: [...this._points.values()].map((point) => ({ ...point }))
    };
  }

  /**
   * 写入单点：同位置累加 value，并判断极值是否被刷新。
   * 返回的 `delta` 是本次增量，供增量绘制使用。
   */
  private _ingest(input: HeatmapInputPoint): { delta: HeatmapRenderPoint; extremaChanged: boolean } | null {
    const delta = this._readPoint(input);
    if (!delta) return null;

    const key = pointKey(delta.x, delta.y);
    const existing = this._points.get(key);
    let storedVal: number;
    if (existing) {
      existing.value += delta.value;
      storedVal = existing.value;
    } else {
      this._points.set(key, { ...delta });
      storedVal = delta.value;
    }

    let extremaChanged = false;

    if (!this._hasExtrema) {
      this._min = storedVal;
      this._max = storedVal;
      this._hasExtrema = true;
      extremaChanged = true;
    } else if (storedVal > this._max) {
      this._max = storedVal;
      extremaChanged = true;
    } else if (storedVal < this._min) {
      this._min = storedVal;
      extremaChanged = true;
    }

    return { delta, extremaChanged };
  }

  /** 按配置字段读取坐标 / 强度 / 半径；非法坐标返回 `null`。 */
  private _readPoint(input: HeatmapInputPoint): HeatmapRenderPoint | null {
    const x = Number(input[this._xField]);
    const y = Number(input[this._yField]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const rawValue = input[this._valueField];
    const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : 1;
    const rawRadius = input.radius;
    const radius = typeof rawRadius === "number" && Number.isFinite(rawRadius) ? rawRadius : this._radius;

    return { x, y, value, radius };
  }
}
