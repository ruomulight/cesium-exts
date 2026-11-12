import * as Cesium from "cesium";

import { GLOW_WALL_SHADER_SOURCE } from "./shaders";
import { type GlowWallOptions, type GlowWallPosition } from "./types";

/** 首尾经纬度差小于该值时视为同一个点，避免闭合时重复插点。 */
const POINT_EPSILON = 1e-10;

/**
 * 动态发光墙。
 *
 * 用 `WallGeometry` 拉出围栏，自定义材质在墙面上做出向上流动的光带。
 * 适合电子围栏、警戒线。卸载时必须调用 {@link GlowWallPrimitive.destroy}。
 */
export class GlowWallPrimitive {
  private readonly _scene: Cesium.Scene;
  private readonly _materialType: string;

  private _positions: GlowWallPosition[];
  private _closed: boolean;
  private _maximumHeight: number;
  private _minimumHeight: number;
  private _color: Cesium.Color;
  private _speed: number;
  private _glowPower: number;
  private _baseAlpha: number;
  private _emission: number;
  private _show: boolean;

  private _primitive: Cesium.Primitive | null = null;
  private _material: Cesium.Material | null = null;
  private _isDestroyed = false;

  /**
   * @param viewer Cesium Viewer
   * @param options 围栏顶点与发光参数。`positions` 必填
   */
  constructor(viewer: Cesium.Viewer, options: GlowWallOptions) {
    if (!viewer?.scene) {
      throw new Error("[GlowWallPrimitive] 需要有效的 Cesium.Viewer。");
    }
    if (!options.positions || options.positions.length < 2) {
      throw new Error("[GlowWallPrimitive] positions 至少需要 2 个顶点。");
    }

    this._scene = viewer.scene;
    this._materialType = `GlowWall_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;

    this._positions = options.positions.map(position => ({ ...position }));
    this._closed = options.closed ?? true;
    this._maximumHeight = options.maximumHeight ?? 200;
    this._minimumHeight = options.minimumHeight ?? 0;
    this._speed = options.speed ?? 2;
    this._glowPower = Math.max(options.glowPower ?? 6, 0.01);
    this._baseAlpha = clamp01(options.baseAlpha ?? 0.1);
    this._emission = Math.max(options.emission ?? 0.2, 0);
    this._show = options.show ?? true;
    this._color = resolveColor(options.color);

    this._build();
  }

  /** 是否显示。隐藏时不移除几何，只关掉绘制。 */
  public get show(): boolean {
    return this._show;
  }

  public set show(visible: boolean) {
    this._show = visible;
    if (this._primitive) {
      this._primitive.show = visible;
    }
  }

  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** 当前顶点的拷贝。改返回值不会影响墙体，需要 {@link setPositions}。 */
  public getPositions(): GlowWallPosition[] {
    return this._positions.map(position => ({ ...position }));
  }

  /**
   * 替换整条折线并重建几何。
   * @param positions 至少 2 个顶点
   */
  public setPositions(positions: GlowWallPosition[]): void {
    if (this._isDestroyed) return;
    if (positions.length < 2) {
      throw new Error("[GlowWallPrimitive] positions 至少需要 2 个顶点。");
    }
    this._positions = positions.map(position => ({ ...position }));
    this._build();
  }

  /** 统一墙顶高度（米），会重建几何。顶点上单独写的 `maximumHeight` 仍然优先。 */
  public setMaximumHeight(height: number): void {
    if (this._isDestroyed || this._maximumHeight === height) return;
    this._maximumHeight = height;
    this._build();
  }

  /** 统一墙底高度（米），会重建几何。 */
  public setMinimumHeight(height: number): void {
    if (this._isDestroyed || this._minimumHeight === height) return;
    this._minimumHeight = height;
    this._build();
  }

  /** 更新发光颜色，包含 alpha。不重建几何。 */
  public setColor(color: string | Cesium.Color): void {
    if (this._isDestroyed) return;
    this._color = resolveColor(color);
    this._syncUniforms();
  }

  /**
   * 光带速度。正值向上，负值向下，0 静止。
   */
  public setSpeed(speed: number): void {
    if (this._isDestroyed) return;
    this._speed = speed;
    this._syncUniforms();
  }

  /** 光带锐度。过小会被抬到 0.01，避免 `pow` 指数为 0 时整面发白。 */
  public setGlowPower(glowPower: number): void {
    if (this._isDestroyed) return;
    this._glowPower = Math.max(glowPower, 0.01);
    this._syncUniforms();
  }

  /** 光带之间的底色透明度，限制在 0~1。 */
  public setBaseAlpha(baseAlpha: number): void {
    if (this._isDestroyed) return;
    this._baseAlpha = clamp01(baseAlpha);
    this._syncUniforms();
  }

  /** 自发光强度，小于 0 时按 0 处理。 */
  public setEmission(emission: number): void {
    if (this._isDestroyed) return;
    this._emission = Math.max(emission, 0);
    this._syncUniforms();
  }

  /**
   * 从场景移除墙体并释放图元。
   * 重复调用是安全的。
   */
  public destroy(): void {
    if (this._isDestroyed) return;
    this._removePrimitive();
    this._positions = [];
    this._isDestroyed = true;
  }

  /** 按当前顶点生成墙体。闭合围栏会在首尾不相接时补上起点。 */
  private _build(): void {
    this._removePrimitive();

    const outline = this._resolveOutline();
    if (outline.length < 2) return;

    const positions = outline.map(point => Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude));
    const maximumHeights = outline.map(point => point.maximumHeight);
    const minimumHeights = outline.map(point => point.minimumHeight);

    this._material = new Cesium.Material({
      fabric: {
        type: this._materialType,
        uniforms: {
          color: this._color,
          speed: this._speed,
          glowPower: this._glowPower,
          baseAlpha: this._baseAlpha,
          emission: this._emission
        },
        source: GLOW_WALL_SHADER_SOURCE
      }
    });

    this._primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.WallGeometry({
          positions,
          maximumHeights,
          minimumHeights,
          vertexFormat: Cesium.MaterialAppearance.MaterialSupport.TEXTURED.vertexFormat
        })
      }),
      appearance: new Cesium.MaterialAppearance({
        material: this._material,
        translucent: true,
        closed: false,
        // 围栏要从内外两侧都能看见，不能剔除背面
        renderState: {
          cull: { enabled: false },
          depthTest: { enabled: true }
        }
      }),
      show: this._show,
      asynchronous: false
    });

    this._scene.primitives.add(this._primitive);
  }

  /** 展开闭合点，并保证每一段墙都有正高度。 */
  private _resolveOutline(): Array<GlowWallPosition & { maximumHeight: number; minimumHeight: number }> {
    const source = this._positions.map(position => ({ ...position }));
    const first = source[0];
    const last = source[source.length - 1];
    if (this._closed && first && last && !isSamePoint(first, last)) {
      source.push({ ...first });
    }

    return source.map(position => {
      const minimumHeight = position.minimumHeight ?? this._minimumHeight;
      const requestedTop = position.maximumHeight ?? this._maximumHeight;
      return {
        longitude: position.longitude,
        latitude: position.latitude,
        minimumHeight,
        // 顶底重合时 WallGeometry 没有面积，至少留出 1 米
        maximumHeight: Math.max(requestedTop, minimumHeight + 1)
      };
    });
  }

  private _syncUniforms(): void {
    if (!this._material) return;
    this._material.uniforms.color = this._color;
    this._material.uniforms.speed = this._speed;
    this._material.uniforms.glowPower = this._glowPower;
    this._material.uniforms.baseAlpha = this._baseAlpha;
    this._material.uniforms.emission = this._emission;
  }

  private _removePrimitive(): void {
    if (this._primitive) {
      this._scene.primitives.remove(this._primitive);
      this._primitive = null;
    }
    this._material = null;
  }
}

function resolveColor(color: string | Cesium.Color | undefined): Cesium.Color {
  if (color instanceof Cesium.Color) {
    return Cesium.Color.clone(color);
  }
  return Cesium.Color.fromCssColorString(color ?? "#00ffff");
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isSamePoint(a: GlowWallPosition, b: GlowWallPosition): boolean {
  return Math.abs(a.longitude - b.longitude) < POINT_EPSILON && Math.abs(a.latitude - b.latitude) < POINT_EPSILON;
}
