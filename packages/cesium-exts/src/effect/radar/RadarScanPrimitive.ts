import * as Cesium from "cesium";

import { DOME_SHADER_SOURCE, GROUND_SHADER_SOURCE } from "./shaders";
import { type RadarPosition, type RadarScanOptions } from "./types";

/**
 * 高性能立体雷达扫描矩阵图元。
 *
 * 采用 GeometryInstance 合并与 GPU 自定义 Shader 实现，支持多实例同屏渲染，
 * 半球罩与地面底盘透明度独立可控。卸载时必须调用 {@link RadarScanPrimitive.destroy}。
 */
export class RadarScanPrimitive {
  private _scene: Cesium.Scene;
  private _instanceId: string;

  private _positions: RadarPosition[];
  private _radius: number;
  private _color: Cesium.Color;
  private _speed: number;
  private _scanAlpha: number;
  private _domeBaseAlpha: number;
  private _groundBaseAlpha: number;
  private _groundOffset: number;
  private _show: boolean;

  private _time: number = 0.0;
  private _domePrimitive: Cesium.Primitive | null = null;
  private _groundPrimitive: Cesium.Primitive | null = null;
  private _domeMaterial: Cesium.Material | null = null;
  private _groundMaterial: Cesium.Material | null = null;

  private _preUpdateRemoveCallback: Cesium.Event.RemoveCallback | null = null;
  private _isDestroyed: boolean = false;

  /**
   * @param viewer Cesium Viewer
   * @param options 初始化配置
   */
  constructor(viewer: Cesium.Viewer, options: RadarScanOptions = {}) {
    if (!viewer?.scene) {
      throw new Error("[RadarScanPrimitive] Construction requires a valid Cesium.Viewer instance.");
    }

    this._scene = viewer.scene;
    this._instanceId = Math.random().toString(36).substring(2, 9) + "_" + Date.now();

    this._positions = options.positions ?? [];
    this._radius = options.radius ?? 1500;
    this._speed = options.speed ?? 1.0;
    this._scanAlpha = options.scanAlpha ?? 0.8;
    this._domeBaseAlpha = options.domeBaseAlpha ?? 0.2;
    this._groundBaseAlpha = options.groundBaseAlpha ?? 0.15;
    this._groundOffset = options.groundOffset ?? 5.0;
    this._show = options.show ?? true;

    if (options.color instanceof Cesium.Color) {
      this._color = options.color;
    } else {
      this._color = Cesium.Color.fromCssColorString(options.color ?? "#99ff00");
    }

    this._buildPrimitives();
    this._bindAnimation();
  }

  private _getMaterialType(type: "Dome" | "Ground"): string {
    return `RadarScan_${type}_${this._instanceId}`;
  }

  private _buildPrimitives(): void {
    this._destroyPrimitives();

    if (this._positions.length === 0) return;

    const domeInstances: Cesium.GeometryInstance[] = [];
    const groundInstances: Cesium.GeometryInstance[] = [];

    const hemisphereGeometry = new Cesium.EllipsoidGeometry({
      radii: new Cesium.Cartesian3(this._radius, this._radius, this._radius),
      maximumCone: Cesium.Math.PI_OVER_TWO,
      slicePartitions: 48,
      stackPartitions: 24,
      vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
    });

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
            height: height + this._groundOffset,
            vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
          })
        })
      );
    }

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

  private _bindAnimation(): void {
    this._preUpdateRemoveCallback = this._scene.preUpdate.addEventListener(() => {
      if (this._show && this._speed !== 0) {
        this._time += this._speed * 0.005;
        if (this._domeMaterial) this._domeMaterial.uniforms.u_time = this._time;
        if (this._groundMaterial) this._groundMaterial.uniforms.u_time = this._time;
      }
    });
  }

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

  public set show(visible: boolean) {
    this._show = visible;
    if (this._domePrimitive) this._domePrimitive.show = visible;
    if (this._groundPrimitive) this._groundPrimitive.show = visible;
  }

  public get show(): boolean {
    return this._show;
  }

  /**
   * 释放 GPU 资源并解除场景事件。路由切换或组件卸载时必须调用。
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

  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  public setPositions(positions: RadarPosition[]): void {
    this._positions = [...positions];
    this._buildPrimitives();
  }

  public addPosition(position: RadarPosition): void {
    this._positions.push(position);
    this._buildPrimitives();
  }

  public addPositions(positions: RadarPosition[]): void {
    this._positions.push(...positions);
    this._buildPrimitives();
  }

  public clear(): void {
    this._positions = [];
    this._destroyPrimitives();
  }

  public getPositions(): RadarPosition[] {
    return [...this._positions];
  }

  public setRadius(radius: number): void {
    if (this._radius !== radius) {
      this._radius = radius;
      this._buildPrimitives();
    }
  }

  public setColor(color: string | Cesium.Color): void {
    this._color = typeof color === "string" ? Cesium.Color.fromCssColorString(color) : color;
    if (this._domeMaterial) this._domeMaterial.uniforms.u_color = this._color;
    if (this._groundMaterial) this._groundMaterial.uniforms.u_color = this._color;
  }

  public setSpeed(speed: number): void {
    this._speed = speed;
  }

  public setScanAlpha(alpha: number): void {
    this._scanAlpha = alpha;
    if (this._domeMaterial) this._domeMaterial.uniforms.u_scanAlpha = this._scanAlpha;
    if (this._groundMaterial) this._groundMaterial.uniforms.u_scanAlpha = this._scanAlpha;
  }

  public setDomeBaseAlpha(alpha: number): void {
    this._domeBaseAlpha = alpha;
    if (this._domeMaterial) this._domeMaterial.uniforms.u_baseAlpha = this._domeBaseAlpha;
  }

  public setGroundBaseAlpha(alpha: number): void {
    this._groundBaseAlpha = alpha;
    if (this._groundMaterial) this._groundMaterial.uniforms.u_baseAlpha = this._groundBaseAlpha;
  }
}
