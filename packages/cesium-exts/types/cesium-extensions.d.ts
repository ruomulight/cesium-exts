import type { Geometry, Matrix4, Color, Cartesian3, Ray } from "cesium";

/**
 * Cesium 底层渲染 API 扩展类型定义
 *
 * 本文件为 Cesium 库提供了底层渲染 API 和工具类的 TypeScript 类型声明
 * 主要包括：着色器管理、缓冲区操作、纹理处理、渲染命令、事件系统等
 *
 * @module cesium-extended
 */
declare module "cesium" {
  /**
   * Cesium 版本号
   * 可通过 Cesium.globalThis.CESIUM_VERSION 访问
   */
  export namespace globalThis {
    // Cesium 版本号
    const CESIUM_VERSION: string;
  }

  // ==================== 工具类 ====================

  /**
   * Knockout 数据绑定库实例
   * Cesium 内部使用的 MVVM 框架
   */
  export const knockout: any;

  /**
   * 获取 DOM 元素
   * @param container 容器元素或选择器
   * @returns DOM 元素实例
   */
  export function getElement(container: any): any;

  // ==================== 着色器系统 ====================

  /**
   * 着色器源代码管理类
   *
   * 用于组合和管理 GLSL 着色器源代码片段，支持模块化着色器开发
   * 可以将多个代码片段组合成完整的着色器程序
   *
   * @example
   * ```typescript
   * const shaderSource = new Cesium.ShaderSource({
   *   sources: [
   *     'precision highp float;',
   *     'uniform vec3 color;',
   *     'void main() { gl_FragColor = vec4(color, 1.0); }'
   *   ],
   *   defines: ['USE_LIGHTING']
   * });
   * ```
   */
  export class ShaderSource {
    constructor(options: {
      /** 着色器源代码片段数组，按顺序拼接 */
      sources: string[];
      /** 预处理器定义，如 #define 宏，会在代码开头插入 */
      defines?: string[];
    });
  }

  /**
   * 着色器程序管理类
   *
   * 封装了 WebGL 着色器程序的创建、编译、链接、缓存和销毁
   * 支持着色器程序复用，避免重复编译相同的着色器
   *
   * @example
   * ```typescript
   * const program = Cesium.ShaderProgram.fromCache({
   *   context: scene.context,
   *   vertexShaderSource: vertexShader,
   *   fragmentShaderSource: fragmentShader,
   *   attributeLocations: {
   *     position: 0,
   *     normal: 1
   *   }
   * });
   * ```
   */
  export class ShaderProgram {
    /**
     * 从缓存中获取或创建着色器程序
     *
     * 如果具有相同源代码的程序已存在于缓存中，则直接返回
     * 否则创建新程序并加入缓存
     *
     * @param options 着色器程序配置
     * @returns 着色器程序实例
     */
    static fromCache(options: {
      /** 渲染上下文 */
      context: any;
      /** 顶点着色器源码 */
      vertexShaderSource: ShaderSource;
      /** 片段着色器源码 */
      fragmentShaderSource: ShaderSource;
      /** 顶点属性位置映射表，键为属性名，值为 location 索引 */
      attributeLocations?: Record<string, number>;
    }): ShaderProgram;

    /**
     * 销毁着色器程序并释放 GPU 资源
     * 注意：从缓存创建的程序可能被多个对象共享，销毁需谨慎
     */
    destroy(): void;
  }

  // ==================== 缓冲区和顶点数组 ====================

  /**
   * 缓冲区使用模式枚举
   *
   * 向 GPU 提示缓冲区数据的使用模式，以便优化内存分配和访问
   */
  export enum BufferUsage {
    /** 静态绘制：数据几乎不改变，适合静态几何体 */
    STATIC_DRAW,
    /** 动态绘制：数据频繁改变，适合动画或粒子系统 */
    DYNAMIC_DRAW
  }

  /**
   * 顶点数组对象（Vertex Array Object, VAO）
   *
   * 封装顶点缓冲区和顶点属性绑定关系
   * 存储几何体的顶点数据（位置、法线、纹理坐标等）
   *
   * @example
   * ```typescript
   * const vertexArray = Cesium.VertexArray.fromGeometry({
   *   context: scene.context,
   *   geometry: boxGeometry,
   *   attributeLocations: {
   *     position: 0,
   *     normal: 1,
   *     st: 2
   *   },
   *   bufferUsage: Cesium.BufferUsage.STATIC_DRAW
   * });
   * ```
   */
  export class VertexArray {
    /**
     * 从几何体创建顶点数组
     *
     * 自动从几何体中提取顶点属性并创建对应的 GPU 缓冲区
     *
     * @param options 顶点数组配置
     * @returns 顶点数组实例
     */
    static fromGeometry(options: {
      /** 渲染上下文 */
      context: any;
      /** 几何体数据源 */
      geometry: Geometry;
      /** 顶点属性位置映射表 */
      attributeLocations?: Record<string, number>;
      /** 缓冲区使用模式，决定 GPU 如何优化存储 */
      bufferUsage: BufferUsage;
    }): VertexArray;

    /**
     * 销毁顶点数组并释放 GPU 资源
     * 包括所有关联的顶点缓冲区
     */
    destroy(): void;
  }

  // ==================== 纹理系统 ====================

  /**
   * 像素格式枚举
   * 定义纹理每个像素的颜色通道组成
   */
  export enum PixelFormat {
    /** RGBA 四通道格式：红、绿、蓝、透明度 */
    RGBA
  }

  /**
   * 像素数据类型枚举
   * 定义每个颜色通道的数据类型和精度
   */
  export enum PixelDatatype {
    /** 无符号 8 位整数，取值范围 0-255，最常用的格式 */
    UNSIGNED_BYTE,
    /** 32 位浮点数，用于 HDR 或计算纹理 */
    FLOAT
  }

  /**
   * 纹理环绕模式枚举
   * 控制纹理坐标超出 [0,1] 范围时的行为
   */
  export enum TextureWrap {
    /** 边缘夹紧：超出部分使用边缘像素颜色 */
    CLAMP_TO_EDGE,
    /** 重复：纹理平铺重复，适合地形贴图 */
    REPEAT,
    /** 镜像重复：纹理镜像平铺，避免接缝 */
    MIRRORED_REPEAT
  }

  /**
   * 纹理缩小过滤模式枚举
   * 当纹理被缩小显示时的采样方式
   */
  export enum TextureMinificationFilter {
    /** 最近邻过滤：速度快但有锯齿 */
    NEAREST,
    /** 线性过滤：平滑但略微模糊 */
    LINEAR
  }

  /**
   * 纹理放大过滤模式枚举
   * 当纹理被放大显示时的采样方式
   */
  export enum TextureMagnificationFilter {
    /** 最近邻过滤：像素化效果 */
    NEAREST,
    /** 线性过滤：平滑插值 */
    LINEAR
  }

  /**
   * 纹理采样器
   *
   * 控制纹理的过滤和环绕行为
   * 决定 GPU 如何读取和插值纹理数据
   *
   * @example
   * ```typescript
   * const sampler = new Cesium.Sampler({
   *   minificationFilter: Cesium.TextureMinificationFilter.LINEAR,
   *   magnificationFilter: Cesium.TextureMagnificationFilter.LINEAR,
   *   wrapS: Cesium.TextureWrap.REPEAT,
   *   wrapT: Cesium.TextureWrap.REPEAT
   * });
   * ```
   */
  export class Sampler {
    constructor(options?: {
      /** 缩小过滤模式 */
      minificationFilter?: TextureMinificationFilter;
      /** 放大过滤模式 */
      magnificationFilter?: TextureMagnificationFilter;
      /** S 方向（水平）环绕模式 */
      wrapS?: TextureWrap;
      /** T 方向（垂直）环绕模式 */
      wrapT?: TextureWrap;
    });
  }

  /**
   * 纹理对象
   *
   * 封装 WebGL 纹理资源，可用于贴图、离屏渲染等
   * 支持从图片、Canvas、视频或原始数据创建
   *
   * @example
   * ```typescript
   * // 创建空纹理
   * const texture = new Cesium.Texture({
   *   context: scene.context,
   *   width: 512,
   *   height: 512,
   *   pixelFormat: Cesium.PixelFormat.RGBA,
   *   pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE
   * });
   *
   * // 从数据创建
   * const textureWithData = new Cesium.Texture({
   *   context: scene.context,
   *   width: 256,
   *   height: 256,
   *   pixelFormat: Cesium.PixelFormat.RGBA,
   *   pixelDatatype: Cesium.PixelDatatype.UNSIGNED_BYTE,
   *   source: {
   *     arrayBufferView: new Uint8Array(256 * 256 * 4)
   *   }
   * });
   * ```
   */
  export class Texture {
    constructor(options: {
      /** 渲染上下文 */
      context: any;
      /** 纹理宽度（像素） */
      width: number;
      /** 纹理高度（像素） */
      height: number;
      /** 像素格式 */
      pixelFormat: PixelFormat;
      /** 像素数据类型 */
      pixelDatatype: PixelDatatype;
      /** 初始数据源，可选 */
      source?: {
        width?: number;
        height?: number;
        arrayBufferView: Uint8Array | Float32Array;
      };
      /** 采样器配置 */
      sampler?: Sampler;
    });

    /**
     * 从源数据更新纹理内容
     *
     * 支持从多种数据源更新：原始数组、图片元素、Canvas、视频等
     *
     * @param options 更新选项
     */
    copyFrom(options: {
      source: ArrayBufferView | ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
    }): void;

    /**
     * 销毁纹理并释放 GPU 资源
     * 如果纹理被多个对象引用，需确保不再使用后才销毁
     */
    destroy(): void;
  }

  /**
   * 帧缓冲区对象（Framebuffer Object, FBO）
   *
   * 用于离屏渲染和渲染到纹理（Render-to-Texture）
   * 可以将渲染结果输出到纹理而不是屏幕，实现后处理效果
   *
   * @example
   * ```typescript
   * const fbo = new Cesium.Framebuffer({
   *   context: scene.context,
   *   colorTextures: [colorTexture],
   *   depthTexture: depthTexture
   * });
   * ```
   */
  export class Framebuffer {
    constructor(options: {
      /** 渲染上下文 */
      context: any;
      /** 颜色附件纹理数组，最多支持多个渲染目标（MRT） */
      colorTextures: Texture[];
      /** 深度附件纹理，存储深度信息 */
      depthTexture: Texture;
    });

    /**
     * 获取指定索引的颜色纹理
     * @param index 颜色附件索引，从 0 开始
     * @returns 颜色纹理对象
     */
    getColorTexture(index: number): Texture;

    /** 深度纹理附件，用于深度测试和深度缓冲 */
    depthTexture: Texture;
  }

  // ==================== 渲染命令系统 ====================

  /**
   * 图元类型枚举
   * 定义几何体的渲染方式
   */
  export enum PrimitiveType {
    /** 点图元：每个顶点渲染为一个点 */
    POINTS,
    /** 线段图元：每两个顶点渲染为一条线段 */
    LINES,
    /** 三角形图元：每三个顶点渲染为一个三角形，最常用 */
    TRIANGLES
  }

  /**
   * 渲染通道类型枚举
   * 用于控制渲染顺序和混合
   */
  export enum Pass {
    /** 不透明物体渲染通道，先渲染，使用深度测试 */
    OPAQUE,
    /** 半透明物体渲染通道，后渲染，使用混合 */
    TRANSLUCENT,
    /** 计算着色器通道，用于 GPGPU 计算 */
    COMPUTE
  }

  /**
   * 渲染状态管理类
   *
   * 封装 WebGL 渲染状态配置（深度测试、混合、剔除等）
   * 支持状态缓存以提高性能
   */
  export class RenderState {
    /**
     * 从缓存获取或创建渲染状态
     *
     * 如果已存在相同配置的状态则复用，否则创建新状态
     *
     * @param options 渲染状态配置对象
     * @returns 渲染状态实例
     */
    static fromCache(options: any): any;
  }

  /**
   * 绘制命令
   *
   * 封装一次完整的绘制调用所需的所有状态和资源
   * 是 Cesium 渲染系统的核心数据结构
   *
   * @example
   * ```typescript
   * const drawCommand = new Cesium.DrawCommand({
   *   boundingVolume: boundingSphere,
   *   modelMatrix: Cesium.Matrix4.IDENTITY,
   *   primitiveType: Cesium.PrimitiveType.TRIANGLES,
   *   vertexArray: vertexArray,
   *   shaderProgram: shaderProgram,
   *   uniformMap: {
   *     u_color: () => Cesium.Color.RED
   *   },
   *   renderState: renderState,
   *   pass: Cesium.Pass.OPAQUE
   * });
   * ```
   */
  export class DrawCommand {
    constructor(options?: {
      /** 几何体在世界空间中的包围体，用于视锥体剔除 */
      boundingVolume?: any;
      /** 几何体在世界空间中的有向包围盒（OBB） */
      orientedBoundingBox?: any;
      /** 从模型空间到世界空间的变换矩阵 */
      modelMatrix?: any;
      /** 顶点数组中的几何体类型 @default PrimitiveType.TRIANGLES */
      primitiveType?: any;
      /** 顶点数组，包含几何体数据 */
      vertexArray?: any;
      /** 要绘制的顶点数量 */
      count?: number;
      /** 顶点数组中开始绘制的偏移量 @default 0 */
      offset?: number;
      /** 要绘制的实例数量（实例化渲染）@default 0 */
      instanceCount?: number;
      /** 要应用的着色器程序 */
      shaderProgram?: any;
      /** Uniform 变量映射对象，键为 uniform 名称，值为返回 uniform 值的函数 */
      uniformMap?: Record<string, () => any>;
      /** 渲染状态配置 */
      renderState?: any;
      /** 要绘制到的帧缓冲区，不指定则绘制到屏幕 */
      framebuffer?: any;
      /** 渲染通道类型 */
      pass?: any;
      /** 创建此命令的对象（用于调试） */
      owner?: any;
      /** 是否基于包围体进行视锥体剔除 @default true */
      cull?: boolean;
      /** 是否基于包围体进行地平线遮挡剔除 @default true */
      occlude?: boolean;
      /** 是否仅在包含包围体的最近视锥体中执行 @default false */
      executeInClosestFrustum?: boolean;
      /** 是否显示包围体（用于调试）@default false */
      debugShowBoundingVolume?: boolean;
      /** 启用阴影时是否投射阴影 @default false */
      castShadows?: boolean;
      /** 启用阴影时是否接收阴影 @default false */
      receiveShadows?: boolean;
      /** 拾取 ID（GLSL 字符串形式） */
      pickId?: string;
      /** 是否允许元数据拾取 @default false */
      pickMetadataAllowed?: boolean;
      /** 是否仅在拾取通道中执行 @default false */
      pickOnly?: boolean;
      /** 是否为半透明图元分类派生深度绘制 @default false */
      depthForTranslucentClassification?: boolean;
    });

    /** 几何体在世界空间中的包围体 */
    boundingVolume?: any;
    /** 几何体在世界空间中的有向包围盒 */
    orientedBoundingBox?: any;
    /** 是否基于包围体进行剔除 */
    cull: boolean;
    /** 是否基于包围体进行地平线遮挡剔除 */
    occlude: boolean;
    /** 从模型空间到世界空间的变换矩阵 */
    modelMatrix?: any;
    /** 顶点数组中的几何体类型 */
    primitiveType: any;
    /** 顶点数组 */
    vertexArray?: any;
    /** 要绘制的顶点数量 */
    count?: number;
    /** 顶点数组中开始绘制的偏移量 */
    offset: number;
    /** 要绘制的实例数量 */
    instanceCount: number;
    /** 要应用的着色器程序 */
    shaderProgram?: any;
    /** 是否投射阴影 */
    castShadows: boolean;
    /** 是否接收阴影 */
    receiveShadows: boolean;
    /** Uniform 变量映射对象 */
    uniformMap?: Record<string, () => any>;
    /** 渲染状态 */
    renderState?: any;
    /** 要绘制到的帧缓冲区 */
    framebuffer?: any;
    /** 渲染通道 */
    pass?: any;
    /** 是否仅在最近的视锥体中执行 */
    executeInClosestFrustum: boolean;
    /** 创建此命令的对象 */
    owner?: any;
    /** 是否显示包围体（调试用） */
    debugShowBoundingVolume: boolean;
    /** 重叠视锥体计数（调试用）@private */
    debugOverlappingFrustums: number;
    /** 拾取 ID */
    pickId?: string;
    /** 是否允许元数据拾取 @private */
    readonly pickMetadataAllowed: boolean;
    /** 拾取的元数据信息 */
    pickedMetadataInfo?: any;
    /** 是否仅在拾取通道中执行 */
    pickOnly: boolean;
    /** 是否为半透明分类派生深度 */
    depthForTranslucentClassification: boolean;
    /** 命令是否已修改（脏标记） */
    dirty: boolean;
    /** 最后修改时间戳 */
    lastDirtyTime: number;
    /** 派生命令集合（如阴影命令、拾取命令等） */
    derivedCommands: Record<string, DrawCommand>;

    /**
     * 浅拷贝绘制命令
     *
     * 创建命令的浅拷贝，共享引用类型的属性
     *
     * @param command 源命令
     * @param result 结果对象，可选，用于避免内存分配
     * @returns 拷贝后的命令
     */
    static shallowClone(command: DrawCommand, result?: DrawCommand): DrawCommand;
    static shallowClone(command: undefined, result?: DrawCommand): undefined;

    /**
     * 执行绘制命令
     *
     * 提交 GPU 绘制调用，渲染几何体
     *
     * @param context 渲染上下文
     * @param passState 渲染通道状态（可选）
     */
    execute(context: any, passState?: any): void;
  }

  /**
   * 计算命令
   *
   * 用于 GPGPU（通用 GPU 计算）
   * 将片段着色器用作计算着色器，将结果写入纹理
   *
   * @example
   * ```typescript
   * const computeCommand = new Cesium.ComputeCommand({
   *   owner: this,
   *   fragmentShaderSource: computeShader,
   *   uniformMap: {
   *     u_inputTexture: () => inputTexture
   *   },
   *   outputTexture: outputTexture,
   *   persists: true
   * });
   * ```
   */
  export class ComputeCommand {
    constructor(options: {
      /** 命令所有者（用于调试和管理） */
      owner: any;
      /** 片段着色器源码（作为计算着色器） */
      fragmentShaderSource: ShaderSource;
      /** Uniform 变量映射表 */
      uniformMap: Record<string, () => any>;
      /** 输出纹理，计算结果写入此纹理 */
      outputTexture: Texture;
      /** 是否在每帧持续执行 */
      persists: boolean;
    });

    /** Uniform 变量映射表 */
    uniformMap: Record<string, () => any>;
    /** 着色器程序 */
    shaderProgram?: ShaderProgram;
    /** 顶点数组 */
    vertexArray?: VertexArray;
    /** 帧缓冲区 */
    framebuffer?: Framebuffer;
    /** 输出纹理 */
    outputTexture?: Texture;
  }

  /**
   * 清除命令
   *
   * 用于清除帧缓冲区的颜色和深度
   * 通常在渲染开始前执行
   *
   * @example
   * ```typescript
   * const clearCommand = new Cesium.ClearCommand({
   *   color: Cesium.Color.BLACK,
   *   depth: 1.0,
   *   pass: Cesium.Pass.OPAQUE
   * });
   * clearCommand.execute(context);
   * ```
   */
  export class ClearCommand {
    constructor(options: {
      /** 清除颜色值 */
      color: Color;
      /** 清除深度值（通常为 1.0） */
      depth: number;
      /** 目标帧缓冲区，不指定则清除屏幕 */
      framebuffer?: any;
      /** 渲染通道 */
      pass: Pass;
    });

    /** 目标帧缓冲区 */
    framebuffer?: Framebuffer;

    /**
     * 执行清除操作
     * @param context 渲染上下文
     */
    execute(context: any): void;
  }

  // ==================== 数据类型 ====================

  /**
   * 组件数据类型枚举
   * 定义顶点属性的数据类型
   */
  export enum ComponentDatatype {
    /** 32 位浮点数，最常用的顶点属性类型 */
    FLOAT
  }

  // ==================== 事件系统 ====================

  /**
   * 事件对象
   *
   * 实现观察者模式的事件系统
   * 允许对象之间进行松耦合的消息传递
   *
   * @example
   * ```typescript
   * const event = new Cesium.Event();
   *
   * // 添加监听器
   * const removeListener = event.addEventListener((arg1, arg2) => {
   *   console.log('Event fired:', arg1, arg2);
   * });
   *
   * // 触发事件
   * event.raiseEvent('hello', 'world');
   *
   * // 移除监听器
   * removeListener();
   * ```
   */
  export class Event {
    /**
     * 添加事件监听器
     *
     * @param listener 监听器回调函数，接收事件触发时传入的参数
     * @param scope 回调函数的 this 上下文（可选）
     * @returns 返回一个函数，调用它可以移除此监听器
     */
    addEventListener(listener: (...args: any[]) => void, scope?: any): () => void;

    /**
     * 移除事件监听器
     *
     * @param listener 要移除的监听器函数
     * @param scope 监听器的作用域（必须与添加时相同）
     * @returns 是否成功移除
     */
    removeEventListener(listener: (...args: any[]) => void, scope?: any): boolean;

    /**
     * 触发事件，通知所有监听器
     *
     * 按照监听器添加的顺序依次调用
     *
     * @param args 传递给监听器的参数
     */
    raiseEvent(...args: any[]): void;
  }

  // ==================== 场景接口 ====================

  /**
   * 场景对象接口
   *
   * Cesium 场景的核心渲染接口
   * 提供渲染上下文、事件系统和拾取功能
   */
  export interface Scene {
    /** WebGL 渲染上下文，封装了底层 WebGL API */
    context: any;

    /** 帧状态对象，包含相机、时间、帧号等信息 */
    frameState: any;

    /** 后渲染事件，每帧渲染完成后触发 */
    postRender: Event;

    /**
     * 请求重新渲染场景
     *
     * 在非连续渲染模式下，调用此方法触发下一帧渲染
     */
    requestRender(): void;

    /**
     * 射线拾取（Ray Picking）
     *
     * 从给定的世界坐标系射线中拾取第一个相交的对象
     * 常用于鼠标点击拾取、碰撞检测等场景
     *
     * @param ray 世界坐标系中的射线
     * @param objectsToExclude 要排除的对象数组（可选）
     * @param width 射线拾取体积的宽度（米），用于扩大拾取范围（可选）
     * @returns 包含相交对象和位置的结果，无交点则返回 undefined
     * @throws 仅在 3D 模式下支持，2D/哥伦布视图会抛出异常
     *
     * @example
     * ```typescript
     * const origin = camera.position;
     * const direction = camera.direction;
     * const ray = new Cesium.Ray(origin, direction);
     *
     * const hit = scene.pickFromRay(ray);
     * if (hit) {
     *   console.log('拾取到对象:', hit.object);
     *   console.log('交点位置:', hit.position);
     * }
     * ```
     */
    pickFromRay(ray: Ray, objectsToExclude?: any[], width?: number): { object: any; position: Cartesian3 } | undefined;

    /**
     * 多重射线拾取（Drill Ray Picking）
     *
     * 拾取射线路径上的所有相交对象，按距离从近到远排序
     * 用于穿透多层对象的拾取场景
     *
     * @param ray 世界坐标系中的射线
     * @param limit 最大拾取数量（可选）
     * @param objectsToExclude 要排除的对象数组（可选）
     * @param width 射线拾取体积的宽度（米）（可选）
     * @returns 相交对象数组，每个元素包含 object 和 position 属性
     * @throws 仅在 3D 模式下支持
     *
     * @example
     * ```typescript
     * const ray = new Cesium.Ray(origin, direction);
     * const hits = scene.drillPickFromRay(ray, 5);
     *
     * hits.forEach((hit, index) => {
     *   console.log(`对象 ${index}:`, hit.object, '位置:', hit.position);
     * });
     * ```
     */
    drillPickFromRay(
      ray: Ray,
      limit?: number,
      objectsToExclude?: any[],
      width?: number
    ): Array<{ object: any; position: Cartesian3 }>;
  }

  // ==================== 属性系统 ====================

  /**
   * 属性工具命名空间
   *
   * 提供动态属性值的获取和比较功能
   * 支持时间动态属性和常量属性
   */
  namespace Property {
    /**
     * 获取属性值，如果为 undefined 则返回克隆的默认值
     *
     * @param property 属性对象
     * @param time 时间参数（用于时间动态属性）
     * @param valueDefault 默认值
     * @param result 结果存储对象（避免内存分配）
     * @returns 属性值或默认值的克隆
     */
    function getValueOrClonedDefault(property?: any, time?: any, valueDefault?: any, result?: any): any;

    /**
     * 获取属性值，如果为 undefined 则返回 undefined
     *
     * @param property 属性对象
     * @param time 时间参数
     * @param result 结果存储对象
     * @returns 属性值或 undefined
     */
    function getValueOrUndefined(property?: any, time?: any, result?: any): any;

    /**
     * 比较两个属性是否相等
     *
     * 深度比较属性值，支持对象和基本类型
     *
     * @param left 左侧属性
     * @param right 右侧属性
     * @returns 是否相等
     */
    function equals<T, F>(left: T, right: F): boolean;

    /**
     * 判断属性是否为常量（不随时间变化）
     *
     * @param property 属性对象
     * @returns 是否为常量
     */
    function isConstant<T>(property: T): boolean;
  }

  /**
   * 创建属性描述符
   *
   * 用于定义对象的动态属性，支持惰性初始化
   * 常用于实体属性系统
   *
   * @param name 属性名称
   * @param configurable 是否可配置（是否可删除或重新定义）
   * @param createPropertyCallback 属性创建回调，返回属性对象
   * @returns 属性描述符对象
   *
   * @example
   * ```typescript
   * Object.defineProperty(entity, 'billboard',
   *   Cesium.createPropertyDescriptor('billboard', true, () => {
   *     return new Cesium.BillboardGraphics();
   *   })
   * );
   * ```
   */
  export function createPropertyDescriptor(name?: any, configurable?: any, createPropertyCallback?: any): any;
}
