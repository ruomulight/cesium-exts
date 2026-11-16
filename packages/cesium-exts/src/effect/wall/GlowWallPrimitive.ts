import * as Cesium from "cesium";

import { GLOW_WALL_MATERIAL_TYPE, GLOW_WALL_SHADER_SOURCE } from "./shaders";
import { type GlowWallFlowAxis, type GlowWallImageRepeat, type GlowWallOptions, type GlowWallPosition } from "./types";

/** 首尾经纬度差小于该值时视为同一个点，避免闭合时重复插点。 */
const POINT_EPSILON = 1e-10;

/** 顶底重合时 WallGeometry 没有面积，墙顶至少比墙底高出这么多米。 */
const MIN_SEGMENT_HEIGHT = 1;

/** 交给 WallGeometry 的轮廓点，高度已经落到米。 */
interface GlowWallOutlinePoint {
  longitude: number;
  latitude: number;
  maximumHeight: number;
  minimumHeight: number;
}

/**
 * 动态发光墙。
 *
 * 用 `WallGeometry` 拉出围栏。不传贴图时，材质在墙面上做出向上流动的光带；
 * 传入 `image` 后改为滚动这张贴图。适合电子围栏、警戒线。
 * 动画在 GPU 上完成。改颜色、速度或贴图只写 uniform；改顶点或高度才重建几何，并沿用同一份材质。
 * 卸载时必须调用 {@link GlowWallPrimitive.destroy}。
 */
export class GlowWallPrimitive {
  /** 墙体所在场景。创建、重建和销毁都从这里增删图元。 */
  private readonly _scene: Cesium.Scene;

  private _positions: GlowWallPosition[];
  private _closed: boolean;
  private _maximumHeight: number;
  private _minimumHeight: number;
  private _color: Cesium.Color;
  private _speed: number;
  private _glowPower: number;
  private _baseAlpha: number;
  private _emission: number;
  private _image: string | undefined;
  private readonly _imageRepeat = new Cesium.Cartesian2(1, 1);
  private _flowAxis: GlowWallFlowAxis;
  private _show: boolean;

  /** 当前挂在场景上的墙体图元。尚未建出几何时为 `null`。 */
  private _primitive: Cesium.Primitive | null = null;
  /**
   * 发光材质。整个实例只创建一次，几何重建时继续使用。
   * 所有实例共用 {@link GLOW_WALL_MATERIAL_TYPE}，着色器只编译一次。
   */
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
    this._positions = options.positions.map(position => ({ ...position }));
    this._closed = options.closed ?? true;
    this._maximumHeight = options.maximumHeight ?? 200;
    this._minimumHeight = options.minimumHeight ?? 0;
    this._speed = options.speed ?? 2;
    this._glowPower = Math.max(options.glowPower ?? 6, 0.01);
    this._baseAlpha = clamp01(options.baseAlpha ?? 0.1);
    this._emission = Math.max(options.emission ?? 0.2, 0);
    this._image = options.image || undefined;
    this._imageRepeat.x = options.imageRepeat?.x ?? 1;
    this._imageRepeat.y = options.imageRepeat?.y ?? 1;
    this._flowAxis = normalizeFlowAxis(options.flowAxis);
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
   * 发光参数和材质保持不变。已销毁时直接返回。
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
   * 会重建几何，不重建材质。顶点自身的 `maximumHeight` 仍然优先。已销毁或数值未变时不重建。
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
   * 会重建几何，不重建材质。已销毁或数值未变时不重建。
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
   * 使用贴图时，这个颜色再乘到图片颜色上。
   *
   * @param color CSS 颜色字符串或 `Cesium.Color`
   */
  public setColor(color: string | Cesium.Color): void {
    if (this._isDestroyed) return;
    this._color = resolveColor(color);
    this._syncUniforms();
  }

  /**
   * 设置流动速度，不重建几何。
   *
   * @param speed 正值向上；贴图 {@link GlowWallOptions.flowAxis} 为 `horizontal` 时改为沿墙长。负值反向，`0` 静止
   */
  public setSpeed(speed: number): void {
    if (this._isDestroyed) return;
    this._speed = speed;
    this._syncUniforms();
  }

  /**
   * 设置光带锐度，不重建几何。
   *
   * 只在未使用贴图时生效，对应着色器 `pow(position, glowPower)` 的指数。
   * 小于 `0.01` 时会被抬到 `0.01`，避免指数为 0 时整面发白。
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
   * 只在未使用贴图时生效。
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
   * 设置流动贴图，不重建几何。
   *
   * 传入 URL 后墙面滚动这张图，透明像素不绘制。传空字符串或不传时回到程序化光带。
   *
   * @param image 图片 URL。空值表示不使用贴图
   */
  public setImage(image?: string): void {
    if (this._isDestroyed) return;
    this._image = image || undefined;
    this._syncUniforms();
  }

  /**
   * 设置贴图重复次数，不重建几何。
   *
   * 只更新传入的分量，另一个分量保持原值。
   *
   * @param repeat `x` 沿墙长，`y` 沿墙高
   */
  public setImageRepeat(repeat: GlowWallImageRepeat): void {
    if (this._isDestroyed) return;
    if (repeat.x !== undefined) this._imageRepeat.x = repeat.x;
    if (repeat.y !== undefined) this._imageRepeat.y = repeat.y;
    this._syncUniforms();
  }

  /**
   * 设置贴图流动方向，不重建几何。
   *
   * @param flowAxis `vertical` 沿墙高，`horizontal` 沿墙长
   * @throws 传入其他值时抛出
   */
  public setFlowAxis(flowAxis: GlowWallFlowAxis): void {
    if (this._isDestroyed) return;
    this._flowAxis = normalizeFlowAxis(flowAxis);
    this._syncUniforms();
  }

  /**
   * 从场景移除墙体并释放几何与材质。
   *
   * 重复调用是安全的。调用后 {@link isDestroyed} 为 `true`。
   */
  public destroy(): void {
    if (this._isDestroyed) return;
    this._removePrimitive();
    if (this._material) {
      this._material.destroy();
      this._material = null;
    }
    this._positions = [];
    this._isDestroyed = true;
  }

  /**
   * 按当前顶点重建墙体几何。
   *
   * 材质只在第一次创建。有效顶点不足 2 个时只移除旧几何。
   */
  private _build(): void {
    this._removePrimitive();

    const outline = this._resolveOutline();
    if (outline.length < 2) return;

    const positions = outline.map(point => Cesium.Cartesian3.fromDegrees(point.longitude, point.latitude));
    const maximumHeights = outline.map(point => point.maximumHeight);
    const minimumHeights = outline.map(point => point.minimumHeight);

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
        material: this._ensureMaterial(),
        translucent: true,
        closed: false,
        // 光带和贴图自己发光，不参与光照
        flat: true,
        // 围栏要从内外两侧都能看见，不能剔除背面
        renderState: {
          cull: { enabled: false },
          depthTest: { enabled: true }
        }
      }),
      show: this._show,
      // 围栏顶点很少，同步创建避免首帧空窗
      asynchronous: false
    });

    this._scene.primitives.add(this._primitive);
  }

  /**
   * 取得这份墙的材质，没有就创建。
   *
   * 创建后的颜色、速度和贴图都通过 {@link _syncUniforms} 更新，不再新建材质。
   *
   * @returns 已挂上当前参数的材质
   */
  private _ensureMaterial(): Cesium.Material {
    if (this._material) return this._material;

    this._material = new Cesium.Material({
      fabric: {
        type: GLOW_WALL_MATERIAL_TYPE,
        uniforms: {
          color: this._color,
          speed: this._speed,
          glowPower: this._glowPower,
          baseAlpha: this._baseAlpha,
          emission: this._emission,
          image: this._image ?? Cesium.Material.DefaultImageId,
          repeat: this._imageRepeat,
          useImage: this._image ? 1 : 0,
          flowAxis: this._flowAxis === "horizontal" ? 1 : 0
        },
        source: GLOW_WALL_SHADER_SOURCE
      }
    });
    return this._material;
  }

  /**
   * 把存储的折线展开成可直接交给 `WallGeometry` 的轮廓。
   *
   * `closed` 为 true 且首尾不是同一个点时，把起点补到末尾。
   * 每个点缺省的高度回退到统一高度；顶底重合时墙顶至少比墙底高 {@link MIN_SEGMENT_HEIGHT} 米。
   *
   * @returns 带确定高度的轮廓点，顺序与折线一致
   */
  private _resolveOutline(): GlowWallOutlinePoint[] {
    const positions = this._positions;
    const first = positions[0];
    if (!first) return [];

    const last = positions[positions.length - 1];
    const outline = positions.map(position => this._toOutlinePoint(position));
    if (this._closed && last && !isSamePoint(first, last)) {
      outline.push(this._toOutlinePoint(first));
    }
    return outline;
  }

  /**
   * 把一个顶点收成墙段高度。
   *
   * 缺省高度回退到统一高度，并保证墙顶高于墙底。
   *
   * @param position 折线顶点
   * @returns 带确定高度的轮廓点
   */
  private _toOutlinePoint(position: GlowWallPosition): GlowWallOutlinePoint {
    const minimumHeight = position.minimumHeight ?? this._minimumHeight;
    const requestedTop = position.maximumHeight ?? this._maximumHeight;
    return {
      longitude: position.longitude,
      latitude: position.latitude,
      minimumHeight,
      maximumHeight: Math.max(requestedTop, minimumHeight + MIN_SEGMENT_HEIGHT)
    };
  }

  /**
   * 把当前发光参数写进材质 uniform。
   *
   * 材质尚未创建时不做任何事。几何不变。相同的贴图 URL 不会重新下载。
   */
  private _syncUniforms(): void {
    if (!this._material) return;
    const uniforms = this._material.uniforms;
    uniforms.color = this._color;
    uniforms.speed = this._speed;
    uniforms.glowPower = this._glowPower;
    uniforms.baseAlpha = this._baseAlpha;
    uniforms.emission = this._emission;
    uniforms.image = this._image ?? Cesium.Material.DefaultImageId;
    uniforms.repeat = this._imageRepeat;
    uniforms.useImage = this._image ? 1 : 0;
    uniforms.flowAxis = this._flowAxis === "horizontal" ? 1 : 0;
  }

  /**
   * 从场景移除当前几何。
   *
   * 不释放材质，供下一次重建复用。图元不存在时什么都不做。
   */
  private _removePrimitive(): void {
    if (!this._primitive) return;
    this._scene.primitives.remove(this._primitive);
    this._primitive = null;
  }
}

/**
 * 把流动方向收成着色器认识的两个取值。
 *
 * @param flowAxis 调用方传入的方向。缺省视为沿墙高
 * @returns `vertical` 或 `horizontal`
 * @throws 传入其他字符串时抛出
 */
function normalizeFlowAxis(flowAxis: string | undefined): GlowWallFlowAxis {
  if (flowAxis === undefined || flowAxis === "vertical") return "vertical";
  if (flowAxis === "horizontal") return "horizontal";
  throw new Error("[GlowWallPrimitive] flowAxis 只能是 vertical 或 horizontal。");
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
