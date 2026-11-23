import {
  type HeatmapDataSet,
  type HeatmapDataSnapshot,
  type HeatmapInputPoint,
  type ResolvedHeatmapOptions
} from "./config";
import { type HeatmapRenderData, type HeatmapRenderPoint } from "./types";

/** 坐标完全相同才聚合；保留小数精度，不进行像素取整。 */
function pointKey(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * `addData` 的调度结果，供 {@link Heatmap} 决定增量绘制还是全量重绘。
 */
export interface StoreAddResult {
  /** `none`：无有效写入；`partial`：仅新增坐标且范围未变；`all`：更新已有坐标或范围变化。 */
  render: "all" | "partial" | "none";
  /** 色带范围是否在本次写入中被改写。 */
  extremaChanged: boolean;
  /** 交给渲染器的数据；`partial` 仅包含新增点，`none` 的点数组为空。 */
  payload: HeatmapRenderData;
}

/**
 * 热力点存储器。
 *
 * 以 `"x,y"` 为键聚合相同坐标的强度；首次写入某点时锁定其 `radius`。
 * 忽略无效坐标及会使聚合值溢出的写入。自动维护的色带范围只向外扩展，
 * 如需收缩范围可调用 `setDataMin`、`setDataMax` 或 `setData`。
 */
export class Store {
  private readonly _points = new Map<string, HeatmapRenderPoint>();
  private _min = 0;
  private _max = 1;
  private _hasExtrema = false;
  private _xField: string;
  private _yField: string;
  private _valueField: string;
  private _radius: number;

  /**
   * @param config - 已解析的字段映射与默认半径。
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
   * @param radius - 有限正半径（像素）。
   * @throws {@link RangeError} 半径不是有限正数。
   */
  public setRadius(radius: number): void {
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError("[heatmap] radius must be a finite positive number.");
    }
    this._radius = radius;
  }

  /**
   * 更新后续输入使用的字段映射和默认半径，已聚合的点保持不变。
   *
   * @param config - 已解析的字段映射与默认半径。
   * @throws {@link RangeError} 半径不是有限正数。
   */
  public updateConfig(config: Pick<ResolvedHeatmapOptions, "xField" | "yField" | "valueField" | "radius">): void {
    this.setRadius(config.radius);
    this._xField = config.xField;
    this._yField = config.yField;
    this._valueField = config.valueField;
  }

  /**
   * 追加数据并选择增量绘制或全量重绘。
   *
   * @remarks
   * 已有坐标的强度累加后必须全量绘制：source-over 合成并非线性累加，
   * 将本次强度再次盖印不能得到聚合总值对应的画面。同一批中重复的坐标也适用。
   *
   * @param data - 单个点或点数组。
   * @returns 绘制方式、范围变化标志及对应数据。
   */
  public addData(data: HeatmapInputPoint | HeatmapInputPoint[]): StoreAddResult {
    const items = Array.isArray(data) ? data : [data];
    const deltas: HeatmapRenderPoint[] = [];
    let extremaChanged = false;
    let requiresFullRender = false;
    let accepted = 0;

    for (const item of items) {
      const result = this._ingest(item);
      if (!result) continue;
      accepted++;
      extremaChanged ||= result.extremaChanged;
      requiresFullRender ||= result.isUpdate || result.extremaChanged;
      // 已确定重绘时不再积累增量对象，减少大批量写入时的临时数组开销。
      if (!requiresFullRender) deltas.push(result.point);
    }

    if (accepted === 0) {
      return { render: "none", extremaChanged: false, payload: { min: this._min, max: this._max, points: [] } };
    }

    if (requiresFullRender) {
      return { render: "all", extremaChanged, payload: this.getRenderData() };
    }

    return {
      render: "partial",
      extremaChanged: false,
      payload: { min: this._min, max: this._max, points: deltas }
    };
  }

  /**
   * 用完整数据集替换内部存储，保留入参指定的色带范围，包括空数据集。
   *
   * @param data - 完整数据集；后续追加数据仍可扩展范围。
   * @returns 全量绘制快照。
   * @throws {@link RangeError} 色带范围非有限或最小值大于最大值；原数据保持不变。
   */
  public setData(data: HeatmapDataSet): HeatmapRenderData {
    const min = data.min ?? 0;
    assertExtrema(min, data.max);
    this._points.clear();
    this._hasExtrema = false;

    for (const item of data.data) {
      this._ingest(item);
    }

    this._min = min;
    this._max = data.max;
    this._hasExtrema = true;
    return this.getRenderData();
  }

  /**
   * 设置色带最大值。
   *
   * @param max - 新的有限最大值，不能小于当前最小值。
   * @returns 全量绘制快照。
   * @throws {@link RangeError} 色带范围无效；原数据保持不变。
   */
  public setDataMax(max: number): HeatmapRenderData {
    assertExtrema(this._min, max);
    this._max = max;
    this._hasExtrema = true;
    return this.getRenderData();
  }

  /**
   * 设置色带最小值。
   *
   * @param min - 新的有限最小值，不能大于当前最大值。
   * @returns 全量绘制快照。
   * @throws {@link RangeError} 色带范围无效；原数据保持不变。
   */
  public setDataMin(min: number): HeatmapRenderData {
    assertExtrema(min, this._max);
    this._min = min;
    this._hasExtrema = true;
    return this.getRenderData();
  }

  /**
   * 清空全部点，并将色带范围重置为 `min=0, max=1`。
   *
   * @returns 点数组为空的全量绘制快照。
   */
  public clear(): HeatmapRenderData {
    this._points.clear();
    this._min = 0;
    this._max = 1;
    this._hasExtrema = false;
    return this.getRenderData();
  }

  /** 当前色带最小值。 */
  public get min(): number {
    return this._min;
  }

  /** 当前色带最大值。 */
  public get max(): number {
    return this._max;
  }

  /**
   * 取得供渲染器同步使用的数据。
   *
   * @returns 新点数组；其中的点对象归存储器所有，调用方不得修改。
   */
  public getRenderData(): HeatmapRenderData {
    return {
      min: this._min,
      max: this._max,
      points: [...this._points.values()]
    };
  }

  /**
   * 导出聚合数据，使用标准字段名且与后续写入隔离。
   *
   * @returns 数组和点对象均为拷贝的数据快照。
   */
  public getData(): HeatmapDataSnapshot {
    return {
      min: this._min,
      max: this._max,
      data: Array.from(this._points.values(), point => ({ ...point }))
    };
  }

  /**
   * 聚合单点并检查范围变化；在修改已存点前拒绝会溢出的强度和。
   */
  private _ingest(
    input: HeatmapInputPoint
  ): { point: HeatmapRenderPoint; extremaChanged: boolean; isUpdate: boolean } | null {
    const point = this._readPoint(input);
    if (!point) return null;

    const key = pointKey(point.x, point.y);
    const existing = this._points.get(key);
    const storedVal = existing ? existing.value + point.value : point.value;
    if (!Number.isFinite(storedVal)) return null;

    if (existing) {
      existing.value = storedVal;
    } else {
      this._points.set(key, point);
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

    return { point: existing ?? point, extremaChanged, isUpdate: existing !== undefined };
  }

  /** 读取字段映射；缺省或无效强度使用 1，无效半径使用默认值，非法坐标忽略。 */
  private _readPoint(input: HeatmapInputPoint): HeatmapRenderPoint | null {
    if (!input || typeof input !== "object") return null;
    const rawX = input[this._xField];
    const rawY = input[this._yField];
    // 只转换数字与字符串，避免 Symbol、对象隐式转换造成异常或意外坐标。
    if (
      (typeof rawX !== "number" && typeof rawX !== "string") ||
      (typeof rawY !== "number" && typeof rawY !== "string")
    ) {
      return null;
    }
    const x = Number(rawX);
    const y = Number(rawY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

    const rawValue = input[this._valueField];
    const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : 1;
    const rawRadius = input.radius;
    const radius =
      typeof rawRadius === "number" && Number.isFinite(rawRadius) && rawRadius > 0 ? rawRadius : this._radius;

    return { x, y, value, radius };
  }
}

/** 在任何存储变更前校验完整范围，防止无效归一化参数进入渲染器。 */
function assertExtrema(min: number, max: number): void {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
    throw new RangeError("[heatmap] extrema must be finite and satisfy min <= max.");
  }
}
