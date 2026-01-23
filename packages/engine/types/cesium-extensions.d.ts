import type { Geometry, Matrix4, Color, Cartesian3, Ray } from "cesium";

/**
 * Cesium 模块扩展类型定义
 * 为 Cesium 库添加底层渲染 API 和工具类的类型声明
 */
declare module "cesium" {
  // ==================== 工具类 ====================

  /** Knockout 数据绑定库实例 */
  export const knockout: any;

  /** 获取 DOM 元素 */
  export function getElement(container: any): any;

  // ==================== 着色器相关 ====================

  /**
   * 着色器源代码管理类
   * 用于组合和管理 GLSL 着色器源代码片段
   */
  export class ShaderSource {
    constructor(options: {
      /** 着色器源代码片段数组 */
      sources: string[];
      /** 预处理器定义（如 #define 宏） */
      defines?: string[];
    });
  }

  /**
   * 着色器程序管理类
   * 封装了 WebGL 着色器程序的创建、缓存和销毁
   */
  export class ShaderProgram {
    /**
     * 从缓存中获取或创建着色器程序
     * @returns 着色器程序实例
     */
    static fromCache(options: {
      /** 渲染上下文 */
      context: any;
      /** 顶点着色器源码 */
      vertexShaderSource: ShaderSource;
      /** 片段着色器源码 */
      fragmentShaderSource: ShaderSource;
      /** 顶点属性位置映射表 */
      attributeLocations?: Record<string, number>;
    }): ShaderProgram;

    /** 销毁着色器程序并释放 GPU 资源 */
    destroy(): void;
  }

  // ==================== 缓冲区和顶点数组 ====================

  /**
   * 缓冲区使用模式
   * 指示 GPU 如何优化缓冲区存储
   */
  export enum BufferUsage {
    /** 静态绘制：数据很少改变 */
    STATIC_DRAW,
    /** 动态绘制：数据频繁改变 */
    DYNAMIC_DRAW
  }

  /**
   * 顶点数组对象（VAO）
   * 封装顶点缓冲区和属性绑定
   */
  export class VertexArray {
    /**
     * 从几何体创建顶点数组
     * @returns 顶点数组实例
     */
    static fromGeometry(options: {
      /** 渲染上下文 */
      context: any;
      /** 几何体数据 */
      geometry: Geometry;
      /** 顶点属性位置映射表 */
      attributeLocations?: Record<string, number>;
      /** 缓冲区使用模式 */
      bufferUsage: BufferUsage;
    }): VertexArray;

    /** 销毁顶点数组并释放 GPU 资源 */
    destroy(): void;
  }

  // ==================== 纹理相关 ====================

  /** 像素格式枚举 */
  export enum PixelFormat {
    /** RGBA 四通道格式 */
    RGBA
  }

  /** 像素数据类型枚举 */
  export enum PixelDatatype {
    /** 无符号 8 位整数 (0-255) */
    UNSIGNED_BYTE,
    /** 32 位浮点数 */
    FLOAT
  }

  /** 纹理环绕模式 */
  export enum TextureWrap {
    /** 边缘夹紧：超出部分使用边缘像素 */
    CLAMP_TO_EDGE,
    /** 重复：纹理平铺重复 */
    REPEAT,
    /** 镜像重复：纹理镜像平铺 */
    MIRRORED_REPEAT
  }

  /** 纹理缩小过滤模式 */
  export enum TextureMinificationFilter {
    /** 最近邻过滤 */
    NEAREST,
    /** 线性过滤 */
    LINEAR
  }

  /** 纹理放大过滤模式 */
  export enum TextureMagnificationFilter {
    /** 最近邻过滤 */
    NEAREST,
    /** 线性过滤 */
    LINEAR
  }

  /**
   * 纹理采样器
   * 控制纹理的过滤和环绕行为
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
   * 封装 WebGL 纹理资源
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
      /** 初始数据源 */
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
     */
    copyFrom(options: {
      source: ArrayBufferView | ImageData | HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;
    }): void;

    /** 销毁纹理并释放 GPU 资源 */
    destroy(): void;
  }

  /**
   * 帧缓冲区对象（FBO）
   * 用于离屏渲染和渲染到纹理
   */
  export class Framebuffer {
    constructor(options: {
      /** 渲染上下文 */
      context: any;
      /** 颜色附件纹理数组 */
      colorTextures: Texture[];
      /** 深度附件纹理 */
      depthTexture: Texture;
    });

    /**
     * 获取指定索引的颜色纹理
     * @param index 颜色附件索引
     */
    getColorTexture(index: number): Texture;

    /** 深度纹理附件 */
    depthTexture: Texture;
  }

  // ==================== 渲染命令 ====================

  /** 图元类型枚举 */
  export enum PrimitiveType {
    /** 点图元 */
    POINTS,
    /** 线段图元 */
    LINES,
    /** 三角形图元 */
    TRIANGLES
  }

  /** 渲染通道类型 */
  export enum Pass {
    /** 不透明物体渲染通道 */
    OPAQUE,
    /** 半透明物体渲染通道 */
    TRANSLUCENT,
    /** 计算着色器通道 */
    COMPUTE
  }

  /**
   * 渲染状态管理
   * 封装 WebGL 渲染状态配置（深度测试、混合等）
   */
  export class RenderState {
    /**
     * 从缓存获取或创建渲染状态
     * @param options 渲染状态配置
     */
    static fromCache(options: any): any;
  }

  /**
   * 绘制命令
   * 封装一次完整的绘制调用所需的所有状态
   */
  /**
   * 表示向渲染器发送的绘制命令
   */
  export class DrawCommand {
    constructor(options?: {
      /** 几何体在世界空间中的边界体，用于剔除和视锥体选择 */
      boundingVolume?: any;
      /** 几何体在世界空间中的有向边界框 */
      orientedBoundingBox?: any;
      /** 从模型空间到世界空间的变换矩阵 */
      modelMatrix?: any;
      /** 顶点数组中的几何体类型 @default PrimitiveType.TRIANGLES */
      primitiveType?: any;
      /** 顶点数组 */
      vertexArray?: any;
      /** 要绘制的顶点数量 */
      count?: number;
      /** 顶点数组中开始绘制的偏移量 @default 0 */
      offset?: number;
      /** 要绘制的实例数量 @default 0 */
      instanceCount?: number;
      /** 要应用的着色器程序 */
      shaderProgram?: any;
      /** uniform 变量映射对象，函数名称与着色器程序中的 uniform 变量名相匹配 */
      uniformMap?: Record<string, () => any>;
      /** 渲染状态 */
      renderState?: any;
      /** 要绘制到的帧缓冲区 */
      framebuffer?: any;
      /** 渲染时的通道 */
      pass?: any;
      /** 创建此命令的对象 */
      owner?: any;
      /** 是否基于边界体进行剔除 @default true */
      cull?: boolean;
      /** 是否基于边界体进行地平线剔除 @default true */
      occlude?: boolean;
      /** 是否仅在包含边界体的最近视锥体中执行 @default false */
      executeInClosestFrustum?: boolean;
      /** 是否显示边界体（用于调试） @default false */
      debugShowBoundingVolume?: boolean;
      /** 启用阴影时是否投射阴影 @default false */
      castShadows?: boolean;
      /** 启用阴影时是否接收阴影 @default false */
      receiveShadows?: boolean;
      /** 拾取 ID（GLSL 字符串） */
      pickId?: string;
      /** 是否允许元数据拾取 @default false */
      pickMetadataAllowed?: boolean;
      /** 是否仅在拾取通道中执行 @default false */
      pickOnly?: boolean;
      /** 是否为半透明图元分类派生深度绘制 @default false */
      depthForTranslucentClassification?: boolean;
    });

    /** 几何体在世界空间中的边界体 */
    boundingVolume?: any;
    /** 几何体在世界空间中的有向边界框 */
    orientedBoundingBox?: any;
    /** 是否基于边界体进行剔除 */
    cull: boolean;
    /** 是否基于边界体进行地平线剔除 */
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
    /** uniform 变量映射对象 */
    uniformMap?: Record<string, () => any>;
    /** 渲染状态 */
    renderState?: any;
    /** 要绘制到的帧缓冲区 */
    framebuffer?: any;
    /** 渲染时的通道 */
    pass?: any;
    /** 是否仅在最近的视锥体中执行 */
    executeInClosestFrustum: boolean;
    /** 创建此命令的对象 */
    owner?: any;
    /** 是否显示边界体（调试用） */
    debugShowBoundingVolume: boolean;
    /** 重叠视锥体计数（调试用） @private */
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
    /** 命令是否已修改 */
    dirty: boolean;
    /** 最后修改时间 */
    lastDirtyTime: number;
    /** 派生命令集合 */
    derivedCommands: Record<string, DrawCommand>;

    /** 浅拷贝命令 */
    static shallowClone(command: DrawCommand, result?: DrawCommand): DrawCommand;
    static shallowClone(command: undefined, result?: DrawCommand): undefined;

    /** 执行绘制命令 */
    execute(context: any, passState?: any): void;
  }

  /**
   * 计算命令
   * 用于 GPGPU 计算（通用计算）
   */
  export class ComputeCommand {
    constructor(options: {
      /** 命令所有者 */
      owner: any;
      /** 片段着色器源码（用于计算） */
      fragmentShaderSource: ShaderSource;
      /** Uniform 变量映射表 */
      uniformMap: Record<string, () => any>;
      /** 输出纹理 */
      outputTexture: Texture;
      /** 是否在每帧持续执行 */
      persists: boolean;
    });

    uniformMap: Record<string, () => any>;
    shaderProgram?: ShaderProgram;
    vertexArray?: VertexArray;
    framebuffer?: Framebuffer;
    outputTexture?: Texture;
  }

  /**
   * 清除命令
   * 用于清除帧缓冲区的颜色和深度
   */
  export class ClearCommand {
    constructor(options: {
      /** 清除颜色值 */
      color: Color;
      /** 清除深度值 */
      depth: number;
      /** 目标帧缓冲区 */
      framebuffer?: any;
      /** 渲染通道 */
      pass: Pass;
    });

    framebuffer?: Framebuffer;

    /**
     * 执行清除操作
     * @param context 渲染上下文
     */
    execute(context: any): void;
  }

  // ==================== 数据类型 ====================

  /** 组件数据类型枚举 */
  export enum ComponentDatatype {
    /** 32 位浮点数 */
    FLOAT
  }

  // ==================== 事件系统 ====================

  /**
   * 事件对象
   * 实现观察者模式的事件系统
   */
  export class Event {
    /**
     * 添加事件监听器
     * @param listener 监听器回调函数
     * @param scope 回调函数的 this 上下文
     * @returns 移除监听器的函数
     */
    addEventListener(listener: (...args: any[]) => void, scope?: any): () => void;

    /**
     * 移除事件监听器
     * @param listener 要移除的监听器
     * @param scope 监听器的作用域
     * @returns 是否成功移除
     */
    removeEventListener(listener: (...args: any[]) => void, scope?: any): boolean;

    /**
     * 触发事件，通知所有监听器
     * @param args 传递给监听器的参数
     */
    raiseEvent(...args: any[]): void;
  }

  // ==================== 场景接口 ====================

  /**
   * 场景对象接口
   * Cesium 场景的核心渲染接口
   */
  export interface Scene {
    /** WebGL 渲染上下文 */
    context: any;

    /** 帧状态对象（包含相机、时间等信息） */
    frameState: any;

    /** 后渲染事件（每帧渲染完成后触发） */
    postRender: Event;

    /** 请求重新渲染场景 */
    requestRender(): void;

    /**
     * 射线拾取（Ray Picking）
     * 从给定的世界坐标系射线中拾取第一个相交的对象
     *
     * @param ray 世界坐标系中的射线
     * @param objectsToExclude 要排除的对象数组
     * @param width 射线拾取体积的宽度（米）
     * @returns 包含相交对象和位置的结果，无交点则返回 undefined
     * @throws 仅在 3D 模式下支持
     *
     * @example
     * ```typescript
     * const ray = new Cesium.Ray(origin, direction);
     * const hit = scene.pickFromRay(ray);
     * if (hit) {
     *   console.log('Hit object:', hit.object);
     *   console.log('Hit position:', hit.position);
     * }
     * ```
     */
    pickFromRay(ray: Ray, objectsToExclude?: any[], width?: number): { object: any; position: Cartesian3 } | undefined;

    /**
     * 多重射线拾取（Drill Ray Picking）
     * 拾取射线路径上的所有相交对象，按距离从近到远排序
     *
     * @param ray 世界坐标系中的射线
     * @param limit 最大拾取数量
     * @param objectsToExclude 要排除的对象数组
     * @param width 射线拾取体积的宽度（米）
     * @returns 相交对象数组，每个元素包含 object 和 position
     * @throws 仅在 3D 模式下支持
     *
     * @example
     * ```typescript
     * const ray = new Cesium.Ray(origin, direction);
     * const hits = scene.drillPickFromRay(ray, 5);
     * hits.forEach(hit => {
     *   console.log(hit.object, 'at', hit.position);
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
   * 提供动态属性值的获取和比较功能
   */
  namespace Property {
    /**
     * 获取属性值，如果为 undefined 则返回克隆的默认值
     * @param property 属性对象
     * @param time 时间参数（用于时间动态属性）
     * @param valueDefault 默认值
     * @param result 结果存储对象（避免内存分配）
     */
    function getValueOrClonedDefault(property?: any, time?: any, valueDefault?: any, result?: any): any;

    /**
     * 获取属性值，如果为 undefined 则返回 undefined
     * @param property 属性对象
     * @param time 时间参数
     * @param result 结果存储对象
     */
    function getValueOrUndefined(property?: any, time?: any, result?: any): any;

    /**
     * 比较两个属性是否相等
     */
    function equals<T, F>(left: T, right: F): boolean;

    /**
     * 判断属性是否为常量（不随时间变化）
     */
    function isConstant<T>(property: T): boolean;
  }

  /**
   * 创建属性描述符
   * 用于定义对象的动态属性
   *
   * @param name 属性名称
   * @param configurable 是否可配置
   * @param createPropertyCallback 属性创建回调
   */
  export function createPropertyDescriptor(name?: any, configurable?: any, createPropertyCallback?: any): any;
}
