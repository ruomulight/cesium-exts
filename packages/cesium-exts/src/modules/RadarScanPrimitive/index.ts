import * as Cesium from "cesium";

import { RadarPosition, RadarScanOptions } from "./src/types";
import { DOME_SHADER_SOURCE, GROUND_SHADER_SOURCE } from "./src/shaders";

/**
 * 高性能立体雷达扫描矩阵图元 (Library Standard)
 *
 * @description 采用底层 GeometryInstance 合并(Batching) 与 GPU 自定义 Shader (Fabric) 技术实现。
 * 支持海量雷达实例同屏丝滑渲染，并且内外结构透明度完全独立可控。
 */
export default class RadarScanPrimitive {
  // --- 核心依赖与实例标识 ---
  private _scene: Cesium.Scene;
  private _instanceId: string;

  // --- 内部数据与状态 ---
  private _positions: RadarPosition[];
  private _radius: number;
  private _color: Cesium.Color;
  private _speed: number;
  private _scanAlpha: number;
  private _domeBaseAlpha: number;
  private _groundBaseAlpha: number;
  private _groundOffset: number;
  private _show: boolean;

  // --- 底层 WebGL 渲染管线对象 ---
  private _time: number = 0.0;
  private _domePrimitive: Cesium.Primitive | null = null;
  private _groundPrimitive: Cesium.Primitive | null = null;
  private _domeMaterial: Cesium.Material | null = null;
  private _groundMaterial: Cesium.Material | null = null;

  // --- 生命周期控制器 ---
  private _preUpdateRemoveCallback: Cesium.Event.RemoveCallback | null = null;
  private _isDestroyed: boolean = false;

  /**
   * 实例化雷达扫描图元组件
   * @param scene Cesium Scene 场景实例 (通常为 viewer.scene)
   * @param options 初始化配置参数
   */
  constructor(scene: Cesium.Scene, options: RadarScanOptions = {}) {
    if (!scene) {
      throw new Error("[RadarScanPrimitive] Construction requires a valid Cesium.Scene instance.");
    }

    this._scene = scene;
    // 生成基于时间戳和随机数的唯一ID，防止多实例的材质缓存相互污染
    this._instanceId = Math.random().toString(36).substring(2, 9) + "_" + Date.now();

    // 解析配置参数并赋予默认值
    this._positions = options.positions ?? [];
    this._radius = options.radius ?? 1500;
    this._speed = options.speed ?? 1.0;
    this._scanAlpha = options.scanAlpha ?? 0.8;
    this._domeBaseAlpha = options.domeBaseAlpha ?? 0.2;
    this._groundBaseAlpha = options.groundBaseAlpha ?? 0.15;
    this._groundOffset = options.groundOffset ?? 5.0;
    this._show = options.show ?? true;

    // 颜色类型断言与转换
    if (options.color instanceof Cesium.Color) {
      this._color = options.color;
    } else {
      this._color = Cesium.Color.fromCssColorString(options.color ?? "#99ff00");
    }

    // 启动渲染管线与动画引擎
    this._buildPrimitives();
    this._bindAnimation();
  }

  /**
   * @private 获取防缓存的独一无二材质标识符
   */
  private _getMaterialType(type: "Dome" | "Ground"): string {
    return `RadarScan_${type}_${this._instanceId}`;
  }

  /**
   * @private 核心逻辑：合并构建几何体，并注入双层自定义 GLSL 着色器
   */
  private _buildPrimitives(): void {
    // 重建前强制清理旧图元，防止显存泄漏
    this._destroyPrimitives();

    if (this._positions.length === 0) return;

    const domeInstances: Cesium.GeometryInstance[] = [];
    const groundInstances: Cesium.GeometryInstance[] = [];

    // 创建共用的半球几何体骨架模板
    const hemisphereGeometry = new Cesium.EllipsoidGeometry({
      radii: new Cesium.Cartesian3(this._radius, this._radius, this._radius),
      maximumCone: Cesium.Math.PI_OVER_TWO, // 限制最大圆锥角以切出上半球
      slicePartitions: 48,
      stackPartitions: 24,
      vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
    });

    // 遍历传入的坐标集，生成 GeometryInstance 数组用于批处理渲染
    for (const pos of this._positions) {
      const height = pos.height ?? 0;
      const position = Cesium.Cartesian3.fromDegrees(pos.longitude, pos.latitude, height);
      const modelMatrix = Cesium.Transforms.eastNorthUpToFixedFrame(position);

      domeInstances.push(
        new Cesium.GeometryInstance({
          geometry: hemisphereGeometry,
          modelMatrix: modelMatrix
        })
      );

      groundInstances.push(
        new Cesium.GeometryInstance({
          geometry: new Cesium.EllipseGeometry({
            center: position,
            semiMajorAxis: this._radius,
            semiMinorAxis: this._radius,
            height: height + this._groundOffset, // 附加离地偏移量
            vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
          })
        })
      );
    }

    // 实例化并注入材质 (分别注入不同的 BaseAlpha)
    this._domeMaterial = new Cesium.Material({
      fabric: {
        type: this._getMaterialType("Dome"),
        uniforms: {
          u_color: this._color,
          u_scanAlpha: this._scanAlpha,
          u_baseAlpha: this._domeBaseAlpha,
          u_time: this._time
        },
        source: DOME_SHADER_SOURCE
      }
    });

    this._groundMaterial = new Cesium.Material({
      fabric: {
        type: this._getMaterialType("Ground"),
        uniforms: {
          u_color: this._color,
          u_scanAlpha: this._scanAlpha,
          u_baseAlpha: this._groundBaseAlpha,
          u_time: this._time
        },
        source: GROUND_SHADER_SOURCE
      }
    });

    // 组装最终 Primitive 图元
    this._domePrimitive = new Cesium.Primitive({
      geometryInstances: domeInstances,
      show: this._show,
      appearance: new Cesium.MaterialAppearance({
        material: this._domeMaterial,
        translucent: true,
        closed: false,
        renderState: {
          cull: { enabled: true, face: Cesium.CullFace.BACK },
          depthTest: { enabled: true }
        }
      })
    });

    this._groundPrimitive = new Cesium.Primitive({
      geometryInstances: groundInstances,
      show: this._show,
      appearance: new Cesium.MaterialAppearance({
        material: this._groundMaterial,
        translucent: true
      })
    });

    this._scene.primitives.add(this._domePrimitive);
    this._scene.primitives.add(this._groundPrimitive);
  }

  /**
   * @private 绑定帧渲染前事件，接管 GPU 的时间运算以驱动着色器动画
   */
  private _bindAnimation(): void {
    this._preUpdateRemoveCallback = this._scene.preUpdate.addEventListener(() => {
      // 当隐藏或速度为 0 时暂停累加，节省性能开销
      if (this._show && this._speed !== 0) {
        this._time += this._speed * 0.005;
        if (this._domeMaterial) this._domeMaterial.uniforms.u_time = this._time;
        if (this._groundMaterial) this._groundMaterial.uniforms.u_time = this._time;
      }
    });
  }

  /**
   * @private 从场景中移除底层图元，并清理引用
   */
  private _destroyPrimitives(): void {
    if (this._domePrimitive) {
      this._scene.primitives.remove(this._domePrimitive);
      this._domePrimitive = null;
    }
    if (this._groundPrimitive) {
      this._scene.primitives.remove(this._groundPrimitive);
      this._groundPrimitive = null;
    }
    this._domeMaterial = null;
    this._groundMaterial = null;
  }

  // ==========================================
  // API: 生命周期与显示控制
  // ==========================================

  /**
   * 设置图元是否在场景中显示
   */
  public set show(visible: boolean) {
    this._show = visible;
    if (this._domePrimitive) this._domePrimitive.show = visible;
    if (this._groundPrimitive) this._groundPrimitive.show = visible;
  }

  /**
   * 获取图元当前的显示状态
   */
  public get show(): boolean {
    return this._show;
  }

  /**
   * 彻底销毁组件：释放 GPU 显存，解除原生事件绑定
   * @description 切换前端路由或卸载组件时【必须调用】该方法，以防止由于 Cesium 机制导致的内存泄露。
   */
  public destroy(): void {
    if (this._isDestroyed) return;

    if (this._preUpdateRemoveCallback) {
      this._preUpdateRemoveCallback();
      this._preUpdateRemoveCallback = null;
    }
    this._destroyPrimitives();
    this._positions = [];
    this._isDestroyed = true;
  }

  /**
   * 检查当前对象实例是否已被销毁
   */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  // ==========================================
  // API: 数据点位操作
  // ==========================================

  /**
   * 全量更新雷达阵列的点位坐标
   * @param positions 新的坐标点位数组
   * @note 调用此方法将触发底层 Geometry 的重建过程。
   */
  public setPositions(positions: RadarPosition[]): void {
    this._positions = [...positions];
    this._buildPrimitives();
  }

  /**
   * 追加单个雷达点位
   * @param position 单个坐标点配置
   */
  public addPosition(position: RadarPosition): void {
    this._positions.push(position);
    this._buildPrimitives();
  }

  /**
   * 批量追加雷达点位
   * @param positions 坐标点数组
   */
  public addPositions(positions: RadarPosition[]): void {
    this._positions.push(...positions);
    this._buildPrimitives();
  }

  /**
   * 清空场景中所有的雷达点位数据 (快速卸载图元)
   */
  public clear(): void {
    this._positions = [];
    this._destroyPrimitives();
  }

  /**
   * 获取当前所有雷达点位数据的克隆副本
   * @returns 坐标点数组
   */
  public getPositions(): RadarPosition[] {
    return [...this._positions];
  }

  // ==========================================
  // API: 视觉配置动态更新 (基于 Shader Uniforms)
  // ==========================================

  /**
   * 动态修改雷达探测半径
   * @param radius 探测半径（米）
   * @warning 此操作涉及改变几何体顶点结构，会触发重建。频繁调用需在业务层增加防抖(Debounce)处理。
   */
  public setRadius(radius: number): void {
    if (this._radius !== radius) {
      this._radius = radius;
      this._buildPrimitives();
    }
  }

  /**
   * 动态修改雷达主题颜色
   * @param color CSS 颜色格式字符串 (如 '#00FFFF') 或 Cesium.Color 对象
   * @note 纯 GPU 级运算，修改后即时生效，无任何性能开销。
   */
  public setColor(color: string | Cesium.Color): void {
    this._color = typeof color === "string" ? Cesium.Color.fromCssColorString(color) : color;
    if (this._domeMaterial) this._domeMaterial.uniforms.u_color = this._color;
    if (this._groundMaterial) this._groundMaterial.uniforms.u_color = this._color;
  }

  /**
   * 动态修改扫描扇面的旋转速度
   * @param speed 旋转速度乘数 (0 表示暂停)
   * @note 纯 GPU 级运算，即时生效。
   */
  public setSpeed(speed: number): void {
    this._speed = speed;
  }

  /**
   * 动态修改扫描面拖尾最高发光亮度
   * @param alpha 发光透明度强度
   * @note 纯 GPU 级运算，即时生效。
   */
  public setScanAlpha(alpha: number): void {
    this._scanAlpha = alpha;
    if (this._domeMaterial) this._domeMaterial.uniforms.u_scanAlpha = this._scanAlpha;
    if (this._groundMaterial) this._groundMaterial.uniforms.u_scanAlpha = this._scanAlpha;
  }

  /**
   * 独立修改【上半球玻璃罩】的基础透明度
   * @param alpha 透明度值 (范围: 0.0 ~ 1.0)
   * @note 纯 GPU 级运算，即时生效。
   */
  public setDomeBaseAlpha(alpha: number): void {
    this._domeBaseAlpha = alpha;
    if (this._domeMaterial) this._domeMaterial.uniforms.u_baseAlpha = this._domeBaseAlpha;
  }

  /**
   * 独立修改【地面扫描罗盘底座】的基础透明度
   * @param alpha 透明度值 (范围: 0.0 ~ 1.0)
   * @note 纯 GPU 级运算，即时生效。
   */
  public setGroundBaseAlpha(alpha: number): void {
    this._groundBaseAlpha = alpha;
    if (this._groundMaterial) this._groundMaterial.uniforms.u_baseAlpha = this._groundBaseAlpha;
  }
}
