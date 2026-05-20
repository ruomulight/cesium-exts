import { HeatmapConfig } from "./config";

/**
 * 数据点接口
 */
export interface DataPoint {
  [key: string]: any;
  x: number;
  y: number;
  value: number;
  radius?: number;
}

/**
 * 数据存储配置接口
 */
export interface StoreConfig {
  xField?: string;
  yField?: string;
  valueField?: string;
  radius?: number;
  defaultXField?: string;
  defaultYField?: string;
  defaultValueField?: string;
}

/**
 * 数据存储类，负责管理热力图数据和极值
 */
export class Store {
  private _coordinator: any = {};
  private _data: number[][] = [];
  private _radi: number[][] = [];
  private _min: number = 10;
  private _max: number = 1;
  private readonly _xField: string;
  private readonly _yField: string;
  private readonly _valueField: string;
  private readonly _cfgRadius?: number;

  /**
   * 构造函数
   * @param config - 存储配置
   */
  constructor(config: StoreConfig) {
    this._xField = config.xField || config.defaultXField || "x";
    this._yField = config.yField || config.defaultYField || "y";
    this._valueField = config.valueField || config.defaultValueField || "value";

    if (config.radius) {
      this._cfgRadius = config.radius;
    }
  }

  /**
   * 整理数据点并更新极值
   * @param dataPoint - 原始数据点
   * @param forceRender - 是否强制渲染（更新极值）
   * @returns 整理后的数据点或 false
   */
  private _organiseData(dataPoint: DataPoint, forceRender: boolean): any {
    const x = dataPoint[this._xField]!;
    const y = dataPoint[this._yField]!;
    const radi = this._radi;
    const store = this._data;
    const max = this._max;
    const min = this._min;
    const value = dataPoint[this._valueField] || 1;
    const radius = dataPoint.radius || this._cfgRadius || HeatmapConfig.defaultRadius;

    if (!store[x]) {
      store[x] = [];
      radi[x] = [];
    }

    if (!store[x]![y]) {
      store[x]![y] = value;
      radi[x]![y] = radius;
    } else {
      store[x]![y]! += value;
    }
    const storedVal = store[x]![y]!;

    if (storedVal > max) {
      if (!forceRender) {
        this._max = storedVal;
      } else {
        this.setDataMax(storedVal);
      }
      return false;
    } else if (storedVal < min) {
      if (!forceRender) {
        this._min = storedVal;
      } else {
        this.setDataMin(storedVal);
      }
      return false;
    } else {
      return {
        x: x,
        y: y,
        value: value,
        radius: radius,
        min: min,
        max: max
      };
    }
  }

  /**
   * 将内部数据格式还原为平面数组格式
   * @returns 包含 min, max 和 data 数组的对象
   */
  private _unOrganizeData(): { min: number; max: number; data: DataPoint[] } {
    const unorganizedData: DataPoint[] = [];
    const data = this._data;
    const radi = this._radi;

    for (const x in data) {
      for (const y in data[x]!) {
        unorganizedData.push({
          x: Number(x),
          y: Number(y),
          radius: radi[x]![y]!,
          value: data[x]![y]!
        });
      }
    }
    return {
      min: this._min,
      max: this._max,
      data: unorganizedData
    };
  }

  /**
   * 当极值改变时触发事件
   */
  private _onExtremaChange(): void {
    this._coordinator.emit("extremachange", {
      min: this._min,
      max: this._max
    });
  }

  /**
   * 添加数据点
   * @param data - 单个数据点或数据点数组
   * @returns 当前 Store 实例
   */
  public addData(data: DataPoint | DataPoint[]): this {
    if (Array.isArray(data)) {
      let dataLen = data.length;
      while (dataLen--) {
        this.addData(data[dataLen]!);
      }
    } else {
      const organisedEntry = this._organiseData(data, true);
      if (organisedEntry) {
        if (this._data.length === 0) {
          this._min = this._max = organisedEntry.value;
        }
        this._coordinator.emit("renderpartial", {
          min: this._min,
          max: this._max,
          data: [organisedEntry]
        });
      }
    }
    return this;
  }

  /**
   * 设置完整的数据集
   * @param data - 包含 min, max 和 data 的对象
   * @returns 当前 Store 实例
   */
  public setData(data: { min: number; max: number; data: DataPoint[] }): this {
    const dataPoints = data.data;
    const pointsLen = dataPoints.length;

    // 重置数据数组
    this._data = [];
    this._radi = [];

    for (let i = 0; i < pointsLen; i++) {
      this._organiseData(dataPoints[i]!, false);
    }
    this._max = data.max;
    this._min = data.min || 0;

    this._onExtremaChange();
    this._coordinator.emit("renderall", this._getInternalData());
    return this;
  }

  /**
   * 移除数据（待实现）
   */
  public removeData(): void {
    // TODO: 实现
  }

  /**
   * 设置数据最大值并触发重新渲染
   * @param max - 最大值
   * @returns 当前 Store 实例
   */
  public setDataMax(max: number): this {
    this._max = max;
    this._onExtremaChange();
    this._coordinator.emit("renderall", this._getInternalData());
    return this;
  }

  /**
   * 设置数据最小值并触发重新渲染
   * @param min - 最小值
   * @returns 当前 Store 实例
   */
  public setDataMin(min: number): this {
    this._min = min;
    this._onExtremaChange();
    this._coordinator.emit("renderall", this._getInternalData());
    return this;
  }

  /**
   * 设置协调器，用于事件发布订阅
   * @param coordinator - 协调器对象
   */
  public setCoordinator(coordinator: any): void {
    this._coordinator = coordinator;
  }

  /**
   * 获取内部存储的数据格式
   * @returns 内部数据对象
   */
  private _getInternalData(): any {
    return {
      max: this._max,
      min: this._min,
      data: this._data,
      radi: this._radi
    };
  }

  /**
   * 获取外部可用的数据格式
   * @returns 外部数据对象
   */
  public getData(): { min: number; max: number; data: DataPoint[] } {
    return this._unOrganizeData();
  }
}
