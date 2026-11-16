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
  /** 墙体所在场景。创建、重建和销毁都从这里增删图元。 */
  private readonly _scene: Cesium.Scene;
  /** 每个实例独立的 fabric 类型名，避免多面墙共用同一材质定义。 */
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

  /** 当前挂在场景上的墙体图元。尚未建出几何时为 `null`。 */
  private _primitive: Cesium.Primitive | null = null;
  /** 发光材质。几何重建时一起换掉，只改外观时更新它的 uniform。 */
  private _material: Cesium.Material | null = null;
  private _isDestroyed = false;

  /**
   * 创建发光墙并立即加入 `viewer.scene`。
   *
   * @param viewer 目标 Viewer，必须带有效的 `scene`
   * @param options 围栏顶点与发光参数。`positions` 至少 2 个
   * @throws 缺少有效 Viewer，或顶点少于 2 个时抛出
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

  /**
   * 是否绘制墙体。
   *
   * 设为 `false` 只隐藏图元，几何和材质仍留在场景中。
   */
  public get show(): boolean {
    return this._show;
  }

  /**
   * 切换墙体是否绘制。
   *
   * @param visible 为 `false` 时停止绘制，不销毁图元
   */
  public set show(visible: boolean) {
    this._show = visible;
    if (this._primitive) {
      this._primitive.show = visible;
    }
  }

  /**
   * 图元是否已经销毁。
   *
   * 为 `true` 后，除读取本属性和再次调用 {@link destroy} 外，其余更新都会被忽略。
   */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * 返回当前顶点的浅拷贝。
   *
   * 修改返回值不会改变墙体。要更新几何请使用 {@link setPositions}。
   *
   * @returns 顶点数组副本，顺序与创建时一致
   */
  public getPositions(): GlowWallPosition[] {
    return this._positions.map(position => ({ ...position }));
  }

  /**
   * 替换整条折线并重建墙体几何。
   *
   * 发光参数保持不变。已销毁时直接返回。
   *
   * @param positions 至少 2 个顶点
   * @throws 顶点少于 2 个时抛出
   */
  public setPositions(positions: GlowWallPosition[]): void {
    if (this._isDestroyed) return;
    if (positions.length < 2) {
      throw new Error("[GlowWallPrimitive] positions 至少需要 2 个顶点。");
    }
    this._positions = positions.map(position => ({ ...position }));
    this._build();
  }

  /**
   * 设置未单独指定高度的顶点所用的墙顶高度。
   *
   * 会重建几何。顶点自身的 `maximumHeight` 仍然优先。已销毁或数值未变时不重建。
   *
   * @param height 墙顶高度（米）
   */
  public setMaximumHeight(height: number): void {
    if (this._isDestroyed || this._maximumHeight === height) return;
    this._maximumHeight = height;
    this._build();
  }

  /**
   * 设置未单独指定高度的顶点所用的墙底高度。
   *
   * 会重建几何。已销毁或数值未变时不重建。
   *
   * @param height 墙底高度（米）
   */
  public setMinimumHeight(height: number): void {
    if (this._isDestroyed || this._minimumHeight === height) return;
    this._minimumHeight = height;
    this._build();
  }

  /**
   * 更新发光颜色，不重建几何。
   *
   * 颜色里的 alpha 会参与墙面透明度。传入的 `Cesium.Color` 会被克隆。
   *
   * @param color CSS 颜色字符串或 `Cesium.Color`
   */
  public setColor(color: string | Cesium.Color): void {
    if (this._isDestroyed) return;
    this._color = resolveColor(color);
    this._syncUniforms();
  }

  /**
   * 设置光带流动速度，不重建几何。
   *
   * @param speed 正值向上，负值向下，`0` 静止
   */
  public setSpeed(speed: number): void {
    if (this._isDestroyed) return;
    this._speed = speed;
    this._syncUniforms();
  }

  /**
   * 设置光带锐度，不重建几何。
   *
   * 对应着色器 `pow(position, glowPower)` 的指数。小于 `0.01` 时会被抬到 `0.01`，
   * 避免指数为 0 时整面发白。
   *
   * @param glowPower 锐度。越大光带越细
   */
  public setGlowPower(glowPower: number): void {
    if (this._isDestroyed) return;
    this._glowPower = Math.max(glowPower, 0.01);
    this._syncUniforms();
  }

  /**
   * 设置光带之间的底色透明度，不重建几何。
   *
   * @param baseAlpha 透明度，会被限制在 `0` 到 `1`
   */
  public setBaseAlpha(baseAlpha: number): void {
    if (this._isDestroyed) return;
    this._baseAlpha = clamp01(baseAlpha);
    this._syncUniforms();
  }

  /**
   * 设置自发光强度，不重建几何。
   *
   * @param emission 强度。小于 `0` 时按 `0` 处理
   */
  public setEmission(emission: number): void {
    if (this._isDestroyed) return;
    this._emission = Math.max(emission, 0);
    this._syncUniforms();
  }

  /**
   * 从场景移除墙体并释放图元。
   *
   * 重复调用是安全的。调用后 {@link isDestroyed} 为 `true`。
   */
  public destroy(): void {
    if (this._isDestroyed) return;
    this._removePrimitive();
    this._positions = [];
    this._isDestroyed = true;
  }

  /**
   * 按当前顶点重建墙体图元。
   *
   * 先移除旧图元，再生成 `WallGeometry` 和发光材质并加入场景。
   * 有效顶点不足 2 个时只移除、不新建。
   */
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

  /**
   * 把存储的折线展开成可直接交给 `WallGeometry` 的轮廓。
   *
   * `closed` 为 true 且首尾不是同一个点时，把起点补到末尾。
   * 每个点缺省的高度回退到统一高度；顶底重合时墙顶至少比墙底高 1 米，避免几何没有面积。
   *
   * @returns 带确定高度的轮廓点，顺序与折线一致
   */
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

  /**
   * 把当前发光参数写进材质 uniform。
   *
   * 材质尚未创建时不做任何事。几何不变，只更新颜色、速度和透明度。
   */
  private _syncUniforms(): void {
    if (!this._material) return;
    this._material.uniforms.color = this._color;
    this._material.uniforms.speed = this._speed;
    this._material.uniforms.glowPower = this._glowPower;
    this._material.uniforms.baseAlpha = this._baseAlpha;
    this._material.uniforms.emission = this._emission;
  }

  /**
   * 从场景移除当前图元，并丢弃材质引用。
   *
   * 图元不存在时只清空材质。不标记为已销毁，供重建前复用。
   */
  private _removePrimitive(): void {
    if (this._primitive) {
      this._scene.primitives.remove(this._primitive);
      this._primitive = null;
    }
    this._material = null;
  }
}

/**
 * 把配置里的颜色解析成独立的 `Cesium.Color`。
 *
 * @param color CSS 颜色字符串、`Cesium.Color`，或缺省。传入的 Color 会被克隆，避免和调用方共享引用
 * @returns 未传入时为青色 `#00ffff`，否则为解析后的颜色
 */
function resolveColor(color: string | Cesium.Color | undefined): Cesium.Color {
  if (color instanceof Cesium.Color) {
    return Cesium.Color.clone(color);
  }
  return Cesium.Color.fromCssColorString(color ?? "#00ffff");
}

/**
 * 把数值限制在 `0` 到 `1`。
 *
 * @param value 原始数值
 * @returns 钳制后的结果
 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * 判断两个顶点是否落在同一经纬度。
 *
 * 只比较经度和纬度，差值小于 {@link POINT_EPSILON} 即视为同一点，避免闭合围栏重复插点。
 *
 * @param a 第一个顶点
 * @param b 第二个顶点
 * @returns 经纬度足够接近时为 `true`
 */
function isSamePoint(a: GlowWallPosition, b: GlowWallPosition): boolean {
  return Math.abs(a.longitude - b.longitude) < POINT_EPSILON && Math.abs(a.latitude - b.latitude) < POINT_EPSILON;
}
