import { HeatmapConfig } from "./config";
import { type DataPoint, Store } from "./data";
import { Renderer } from "./renderer";
import { Util } from "./util";

/**
 * 事件协调器类，负责不同组件间的通信
 */
class Coordinator {
  private cStore: { [key: string]: Array<(data: any) => any> } = {};

  /**
   * 注册事件监听器
   * @param evtName - 事件名称
   * @param callback - 回调函数
   * @param scope - 回调函数的执行上下文
   */
  public on(evtName: string, callback: (data: any) => any, scope: any): void {
    if (!this.cStore[evtName]) {
      this.cStore[evtName] = [];
    }
    this.cStore[evtName].push((data: any) => {
      return callback.call(scope, data);
    });
  }

  /**
   * 触发事件
   * @param evtName - 事件名称
   * @param data - 传递给回调的数据
   */
  public emit(evtName: string, data: any): void {
    const events = this.cStore[evtName];
    if (events) {
      const len = events.length;
      for (let i = 0; i < len; i++) {
        const callback = events[i]!;
        callback(data);
      }
    }
  }
}

/**
 * 热力图主类
 */
export class Heatmap {
  private _config: any;
  private readonly _coordinator: Coordinator;
  private readonly _renderer: any;
  private readonly _store: Store;

  /**
   * 构造函数
   * @param config - 热力图配置项
   */
  constructor(config: any) {
    this._config = Util.merge(HeatmapConfig, config || {});
    this._coordinator = new Coordinator();

    if (this._config.plugin) {
      const pluginToLoad = this._config.plugin;
      const plugin = (HeatmapConfig as any).plugins[pluginToLoad];
      if (!plugin) {
        throw new Error(`插件 '${pluginToLoad}' 未找到。也许没被登记。`);
      }
      this._renderer = new plugin.renderer(this._config);
      this._store = new plugin.store(this._config);
    } else {
      this._renderer = new (Renderer as any)(this._config);
      this._store = new Store(this._config);
    }

    this._connect();
  }

  /**
   * 连接组件（渲染器、协调器、存储）
   */
  private _connect(): void {
    const renderer = this._renderer;
    const coordinator = this._coordinator;
    const store = this._store;

    coordinator.on("renderpartial", renderer.renderPartial, renderer);
    coordinator.on("renderall", renderer.renderAll, renderer);
    coordinator.on(
      "extremachange",
      (data: any) => {
        if (this._config.onExtremaChange) {
          this._config.onExtremaChange({
            min: data.min,
            max: data.max,
            gradient: this._config.gradient || this._config.defaultGradient
          });
        }
      },
      this
    );

    store.setCoordinator(coordinator);
  }

  /**
   * 添加数据点
   * @param data - 单个数据点或数据点数组
   * @returns 当前实例
   */
  public addData(data: DataPoint | DataPoint[]): this {
    this._store.addData(data);
    return this;
  }

  /**
   * 移除数据点（待实现）
   * @returns 当前实例
   */
  public removeData(): this {
    this._store.removeData();
    return this;
  }

  /**
   * 设置完整数据集
   * @param data - 数据对象
   * @returns 当前实例
   */
  public setData(data: { min: number; max: number; data: DataPoint[] }): this {
    this._store.setData(data);
    return this;
  }

  /**
   * 设置数据最大值
   * @param max - 最大值
   * @returns 当前实例
   */
  public setDataMax(max: number): this {
    this._store.setDataMax(max);
    return this;
  }

  /**
   * 设置数据最小值
   * @param min - 最小值
   * @returns 当前实例
   */
  public setDataMin(min: number): this {
    this._store.setDataMin(min);
    return this;
  }

  /**
   * 重新配置热力图
   * @param config - 新配置项
   * @returns 当前实例
   */
  public configure(config: any): this {
    this._config = Util.merge(this._config, config);
    this._renderer.updateConfig(this._config);
    this._coordinator.emit("renderall", (this._store as any)._getInternalData());
    return this;
  }

  /**
   * 重新绘制
   * @returns 当前实例
   */
  public repaint(): this {
    this._coordinator.emit("renderall", (this._store as any)._getInternalData());
    return this;
  }

  /**
   * 获取当前数据集
   * @returns 数据对象
   */
  public getData(): { min: number; max: number; data: DataPoint[] } {
    return this._store.getData();
  }

  /**
   * 获取 DataURL (base64)
   * @returns base64 字符串
   */
  public getDataURL(): string {
    return this._renderer.getDataURL();
  }

  /**
   * 获取指定位置的数值
   * @param point - 坐标点
   * @returns 数值
   */
  public getValueAt(point: { x: number; y: number }): number | null {
    if ((this._store as any).getValueAt) {
      return (this._store as any).getValueAt(point);
    } else if (this._renderer.getValueAt) {
      return this._renderer.getValueAt(point);
    }
    return null;
  }
}

/**
 * 热力图工厂对象
 */
const heatmapFactory = {
  /**
   * 创建热力图实例
   * @param config - 配置项
   * @returns 热力图实例
   */
  create(config: any): Heatmap {
    return new Heatmap(config);
  },
  /**
   * 注册插件
   * @param pluginKey - 插件唯一键名
   * @param plugin - 插件对象（包含 renderer 和 store）
   */
  register(pluginKey: string, plugin: any): void {
    HeatmapConfig.plugins[pluginKey] = plugin;
  }
};

export default heatmapFactory;
