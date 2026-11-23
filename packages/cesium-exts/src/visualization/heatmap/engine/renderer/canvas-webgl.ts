import { type ResolvedHeatmapOptions } from "../config";
import { type HeatmapRenderData, type HeatmapRenderer, type HeatmapRenderPoint } from "../types";
import { FRAGMENT_SHADER_COLORIZE, FRAGMENT_SHADER_POINT, VERTEX_SHADER_POINT, VERTEX_SHADER_SCREEN } from "./shaders";
import { createColorPalette, mountCanvas, resolveCanvasSize, sampleHeatValue } from "./shared";

/** 点绘制 program 的 attrib / uniform 缓存，避免每帧查询。 */
interface PointProgram {
  program: WebGLProgram;
  aPosition: number;
  aIntensity: number;
  aRadius: number;
  uResolution: WebGLUniformLocation | null;
  uBlur: WebGLUniformLocation | null;
}

/** 上色 pass 的 attrib / uniform 缓存。 */
interface ColorizeProgram {
  program: WebGLProgram;
  aPosition: number;
  uAlphaTexture: WebGLUniformLocation | null;
  uPaletteTexture: WebGLUniformLocation | null;
  uOpacity: WebGLUniformLocation | null;
  uMaxOpacity: WebGLUniformLocation | null;
  uMinOpacity: WebGLUniformLocation | null;
  uUseGradientOpacity: WebGLUniformLocation | null;
}

/**
 * WebGL 热力图渲染器。
 *
 * @remarks
 * 两趟绘制：先以 source-over 合成径向点到 alpha 纹理，再采样调色板输出到屏幕。
 * 强度、模糊与透明度规则与 Canvas2D 后端一致；顶点内存与 GPU 缓冲按容量复用。
 * 卸载时必须调用 {@link CanvasWebGLRenderer.destroy}。
 */
export class CanvasWebGLRenderer implements HeatmapRenderer {
  /** 可见输出画布 */
  public readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private readonly _maxTextureSize: number;
  /** 为 true 时 destroy 会移除 canvas 节点 */
  private readonly _ownsCanvas: boolean;

  private _width = 0;
  private _height = 0;
  private _max = 1;
  private _min = 0;
  private _opacity = 0;
  private _maxOpacity = 1;
  private _minOpacity = 0;
  private _blur = 0.85;
  private _useGradientOpacity = false;
  private _destroyed = false;
  /** 每个点占四个浮点数：x、y、归一化强度、半径。 */
  private _vertices = new Float32Array(0);
  /** GPU 点缓冲容量（字节），仅在 CPU 顶点数组扩容后重新分配。 */
  private _pointBufferBytes = 0;
  /** 单像素查询复用同一数组，避免交互拾取时持续分配。 */
  private readonly _samplePixel = new Uint8Array(4);
  /** 调色板内容签名；只改透明度、尺寸等配置时无需重新烘焙颜色。 */
  private _gradientKey: string | undefined;
  /** 记录引擎显式应用的背景色，保留首次挂载前调用方的画布样式。 */
  private _backgroundColor: string | undefined;
  /** 按创建顺序登记资源，构造失败和正常销毁均按逆序释放。 */
  private readonly _disposers: (() => void)[] = [];

  private readonly pointProgram: PointProgram;
  private readonly colorizeProgram: ColorizeProgram;
  private readonly pointBuffer: WebGLBuffer;
  private readonly quadBuffer: WebGLBuffer;
  /** 绑定 alphaTexture 的离屏帧缓冲 */
  private readonly framebuffer: WebGLFramebuffer;
  /** 强度累加纹理 */
  private readonly alphaTexture: WebGLTexture;
  /** 256×1 调色板纹理 */
  private readonly paletteTexture: WebGLTexture;

  /**
   * 先完成 WebGL 资源创建，成功后再挂到 DOM，以便失败时回退 Canvas2D。
   *
   * @param config - 已解析的完整配置。
   * @throws {@link Error} 当前画布不支持 WebGL、着色器初始化失败或帧缓冲不完整。
   * @throws {@link RangeError} 画布尺寸超出当前设备的纹理上限。
   */
  constructor(config: ResolvedHeatmapOptions) {
    this._ownsCanvas = !config.canvas;
    this.canvas = config.canvas ?? document.createElement("canvas");

    const size = resolveCanvasSize(this.canvas, config);
    this._width = this.canvas.width = Math.max(size.width, 0);
    this._height = this.canvas.height = Math.max(size.height, 0);

    const contextOptions: WebGLContextAttributes = {
      preserveDrawingBuffer: true,
      antialias: false,
      // 与 Canvas2D putImageData 一样使用直通 alpha，避免叠到页面上发灰/发暗
      premultipliedAlpha: false
    };
    const gl =
      this.canvas.getContext("webgl", contextOptions) ??
      (this.canvas.getContext("experimental-webgl", contextOptions) as WebGLRenderingContext | null);

    if (!gl) {
      throw new Error("[heatmap] WebGL is not supported.");
    }
    this.gl = gl;
    this._maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

    try {
      this.pointProgram = this._createPointProgram();
      this.colorizeProgram = this._createColorizeProgram();
      this.pointBuffer = this._createBuffer();
      this.quadBuffer = this._createBuffer();
      this.framebuffer = this._createFramebuffer();
      this.alphaTexture = this._createTexture();
      this.paletteTexture = this._createTexture();

      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

      this._resizeAlphaTexture();
      this.updateConfig(config);
      // 颜色与 GPU 资源均就绪后再挂载，初始化失败时不会留下空画布。
      mountCanvas(this.canvas, config.container);
    } catch (error) {
      this._releaseResources();
      throw error;
    }
  }

  /**
   * 清空 alpha 纹理后全量重绘。
   *
   * @param data - 当前全部聚合点；空列表会清空输出。
   */
  public renderAll(data: HeatmapRenderData): void {
    if (this._destroyed) return;
    this._min = data.min;
    this._max = data.max;
    this._draw(data.points, false);
  }

  /**
   * 在已有 alpha 纹理上叠加新点后再上色。调用方须保证极值未变。
   *
   * @param data - 本次新增坐标的点；已有坐标的聚合值变化须使用全量绘制。
   */
  public renderPartial(data: HeatmapRenderData): void {
    if (this._destroyed || data.points.length === 0) return;
    this._min = data.min;
    this._max = data.max;
    this._draw(data.points, true);
  }

  /**
   * 更新渐变、模糊、透明度与尺寸。
   *
   * @param config - 新配置；调用后由引擎全量重绘。
   */
  public updateConfig(config: ResolvedHeatmapOptions): void {
    if (this._destroyed) return;

    const width = config.width ?? this._width;
    const height = config.height ?? this._height;
    // 尺寸与 CSS 色带可能被拒绝；预检完成后再提交透明度等样式字段。
    this._assertTextureSize(width, height);
    this._updatePalette(config.gradient);
    this.setDimensions(width, height);

    this._blur = config.blur;
    this._opacity = config.opacity;
    this._maxOpacity = config.maxOpacity;
    this._minOpacity = config.minOpacity;
    this._useGradientOpacity = config.useGradientOpacity;
    if (config.backgroundColor !== this._backgroundColor) {
      this.canvas.style.backgroundColor = config.backgroundColor ?? "";
      this._backgroundColor = config.backgroundColor;
    }
  }

  /**
   * 调整画布、viewport 与 alpha 纹理尺寸。
   *
   * @param width - 宽度（像素）。
   * @param height - 高度（像素）。
   * @throws {@link RangeError} 尺寸超出设备的纹理上限。
   * @throws {@link Error} 调整后的帧缓冲不完整。
   */
  public setDimensions(width: number, height: number): void {
    if (this._destroyed) return;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
      throw new RangeError("[heatmap] Canvas dimensions must be finite and non-negative.");
    }
    width = Math.floor(width);
    height = Math.floor(height);
    if (width === this._width && height === this._height) return;
    this._assertTextureSize(width, height);
    this._width = this.canvas.width = width;
    this._height = this.canvas.height = height;
    this.gl.viewport(0, 0, Math.max(width, 1), Math.max(height, 1));
    this._resizeAlphaTexture();
  }

  /**
   * 从 alpha 纹理 `readPixels`。WebGL 原点在左下，读取时翻转 Y。
   *
   * @param point - 画布像素坐标（左上原点）；小数坐标向下取整。
   * @returns 由 alpha 反推的近似热力值；空白、越界、非有限坐标或已销毁时返回 0。
   */
  public getValueAt(point: { x: number; y: number }): number {
    if (this._destroyed || this._width <= 0 || this._height <= 0) return 0;
    const x = Math.floor(point.x);
    const y = Math.floor(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= this._width || y >= this._height) {
      return 0;
    }

    const gl = this.gl;
    const pixels = this._samplePixel;
    pixels.fill(0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    try {
      // 像素行索引范围是 0..height-1，顶部一行对应 height-1。
      gl.readPixels(x, this._height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    return sampleHeatValue(pixels[3] ?? 0, this._min, this._max);
  }

  /**
   * 导出当前画面。
   *
   * @returns PNG 格式的 Data URL。
   * @throws {@link DOMException} 画布受跨源资源污染时无法导出。
   */
  public getDataURL(): string {
    return this.canvas.toDataURL();
  }

  /**
   * 释放 GPU 资源与顶点缓存；重复调用无副作用。
   *
   * @remarks
   * 只移除本实例创建的画布，调用方提供的画布保留在 DOM 中。
   */
  public destroy(): void {
    if (this._destroyed) return;

    this._releaseResources();
    this._vertices = new Float32Array(0);
    this._pointBufferBytes = 0;
    if (this._ownsCanvas) {
      this.canvas.remove();
    }

    this._destroyed = true;
  }

  /** 统一释放已成功创建的资源，兼容构造过程在任意一步失败。 */
  private _releaseResources(): void {
    while (this._disposers.length > 0) {
      this._disposers.pop()!();
    }
  }

  /** 创建 ARRAY_BUFFER。 */
  private _createBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error("[heatmap] Failed to create WebGL buffer.");
    }
    this._disposers.push(() => this.gl.deleteBuffer(buffer));
    return buffer;
  }

  /** 创建离屏 FBO，用于绑定 alpha 纹理。 */
  private _createFramebuffer(): WebGLFramebuffer {
    const framebuffer = this.gl.createFramebuffer();
    if (!framebuffer) {
      throw new Error("[heatmap] Failed to create WebGL framebuffer.");
    }
    this._disposers.push(() => this.gl.deleteFramebuffer(framebuffer));
    return framebuffer;
  }

  /** 创建 NEAREST / CLAMP 的 2D 纹理。 */
  private _createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("[heatmap] Failed to create WebGL texture.");
    }
    this._disposers.push(() => gl.deleteTexture(texture));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return texture;
  }

  /** 按当前画布尺寸重分配 alpha 纹理。宽高至少为 1，避免空纹理报错。 */
  private _resizeAlphaTexture(): void {
    const gl = this.gl;
    const width = Math.max(this._width, 1);
    const height = Math.max(this._height, 1);
    this._assertTextureSize(width, height);
    // 上色后活动单元为 TEXTURE1，显式切回以免覆盖调色板绑定。
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.alphaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    try {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.alphaTexture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("[heatmap] Alpha framebuffer is incomplete.");
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
  }

  /** 在修改画布前拒绝设备不支持的纹理尺寸，避免静默生成不完整帧缓冲。 */
  private _assertTextureSize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) {
      throw new RangeError("[heatmap] Canvas dimensions must be finite and non-negative.");
    }
    const maxSize = this._maxTextureSize;
    if (width > maxSize || height > maxSize) {
      throw new RangeError(`[heatmap] Canvas dimensions exceed the maximum texture size (${maxSize}).`);
    }
  }

  /** 编译点绘制 program，并缓存 location。 */
  private _createPointProgram(): PointProgram {
    const program = this._createProgram(VERTEX_SHADER_POINT, FRAGMENT_SHADER_POINT);
    const gl = this.gl;
    return {
      program,
      aPosition: gl.getAttribLocation(program, "a_position"),
      aIntensity: gl.getAttribLocation(program, "a_intensity"),
      aRadius: gl.getAttribLocation(program, "a_radius"),
      uResolution: gl.getUniformLocation(program, "u_resolution"),
      uBlur: gl.getUniformLocation(program, "u_blur")
    };
  }

  /** 编译全屏上色 program，并缓存 location。 */
  private _createColorizeProgram(): ColorizeProgram {
    const program = this._createProgram(VERTEX_SHADER_SCREEN, FRAGMENT_SHADER_COLORIZE);
    const gl = this.gl;
    return {
      program,
      aPosition: gl.getAttribLocation(program, "a_position"),
      uAlphaTexture: gl.getUniformLocation(program, "u_alphaTexture"),
      uPaletteTexture: gl.getUniformLocation(program, "u_paletteTexture"),
      uOpacity: gl.getUniformLocation(program, "u_opacity"),
      uMaxOpacity: gl.getUniformLocation(program, "u_maxOpacity"),
      uMinOpacity: gl.getUniformLocation(program, "u_minOpacity"),
      uUseGradientOpacity: gl.getUniformLocation(program, "u_useGradientOpacity")
    };
  }

  /**
   * 链接程序，并在任意编译或链接失败路径中释放中间对象。
   *
   * @param vsSource - 顶点着色器源码。
   * @param fsSource - 片元着色器源码。
   * @returns 已链接且已登记销毁操作的程序。
   * @throws {@link Error} 无法创建、编译或链接着色器程序。
   */
  private _createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this._compileShader(vsSource, gl.VERTEX_SHADER);
    let fs: WebGLShader | undefined;
    let program: WebGLProgram | null = null;
    try {
      fs = this._compileShader(fsSource, gl.FRAGMENT_SHADER);
      program = gl.createProgram();
      if (!program) {
        throw new Error("[heatmap] Failed to create WebGL program.");
      }
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error("[heatmap] Program link error: " + gl.getProgramInfoLog(program));
      }
      const linkedProgram = program;
      this._disposers.push(() => gl.deleteProgram(linkedProgram));
      return program;
    } catch (error) {
      if (program) gl.deleteProgram(program);
      throw error;
    } finally {
      gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
    }
  }

  /** 编译单个着色器，失败时带上 driver info 抛错。 */
  private _compileShader(source: string, type: number): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("[heatmap] Failed to create WebGL shader.");
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error("[heatmap] Shader compile error: " + info);
    }
    return shader;
  }

  /** 将渐变烘焙为 256×1 调色板并上传到 `paletteTexture`。 */
  private _updatePalette(gradient: Record<number, string>): void {
    const key = JSON.stringify(gradient);
    if (key === this._gradientKey) return;
    const gl = this.gl;
    const palette = createColorPalette(gradient);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      256,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array(palette.buffer, palette.byteOffset, palette.byteLength)
    );
    this._gradientKey = key;
  }

  /**
   * 交错顶点：`x, y, intensity, radius`。
   * intensity 已按 min/max 归一化，下限 0.01，与 Canvas2D 的 globalAlpha 一致。
   *
   * @param points - 待上传的聚合点。
   * @returns 当前有效顶点区间的视图；底层数组按容量复用。
   */
  private _toVertexData(points: HeatmapRenderPoint[]): Float32Array {
    const range = this._max - this._min || 1;
    const length = points.length * 4;
    if (this._vertices.length < length) {
      this._vertices = new Float32Array(Math.max(length, this._vertices.length * 2, 256));
    }
    const out = this._vertices;
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const offset = i * 4;
      out[offset] = point.x;
      out[offset + 1] = point.y;
      out[offset + 2] = Math.max((Math.min(point.value, this._max) - this._min) / range, 0.01);
      out[offset + 3] = point.radius;
    }
    return out.subarray(0, length);
  }

  /**
   * 两趟绘制：FBO 上累加点 alpha（`partial` 时不清空），再上色到默认帧缓冲。
   *
   * @param points - 待绘制的点。
   * @param partial - 为 true 时保留已有 alpha 纹理。
   */
  private _draw(points: HeatmapRenderPoint[], partial: boolean): void {
    if (this._width <= 0 || this._height <= 0) return;

    const gl = this.gl;
    const width = this._width;
    const height = this._height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, width, height);

    // Pass 1：径向点以 source-over 合成到 alpha 纹理。
    if (!partial) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    if (points.length > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.pointProgram.program);
      gl.uniform2f(this.pointProgram.uResolution, width, height);
      gl.uniform1f(this.pointProgram.uBlur, this._blur);

      const vertices = this._toVertexData(points);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
      if (this._pointBufferBytes < this._vertices.byteLength) {
        this._pointBufferBytes = this._vertices.byteLength;
        gl.bufferData(gl.ARRAY_BUFFER, this._pointBufferBytes, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
      gl.enableVertexAttribArray(this.pointProgram.aPosition);
      gl.vertexAttribPointer(this.pointProgram.aPosition, 2, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(this.pointProgram.aIntensity);
      gl.vertexAttribPointer(this.pointProgram.aIntensity, 1, gl.FLOAT, false, 16, 8);
      gl.enableVertexAttribArray(this.pointProgram.aRadius);
      gl.vertexAttribPointer(this.pointProgram.aRadius, 1, gl.FLOAT, false, 16, 12);
      gl.drawArrays(gl.POINTS, 0, points.length);
      // 程序间 location 可重叠；离开点 pass 时解除数组，避免残留顶点状态。
      gl.disableVertexAttribArray(this.pointProgram.aPosition);
      gl.disableVertexAttribArray(this.pointProgram.aIntensity);
      gl.disableVertexAttribArray(this.pointProgram.aRadius);
    }

    // Pass 2：直接写入上色结果，不再混合。
    // SRC_ALPHA 混合会把 RGB 再乘一次 alpha，低透明的蓝晕会被乘没。
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.colorizeProgram.program);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.alphaTexture);
    gl.uniform1i(this.colorizeProgram.uAlphaTexture, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.uniform1i(this.colorizeProgram.uPaletteTexture, 1);
    gl.uniform1f(this.colorizeProgram.uOpacity, this._opacity);
    gl.uniform1f(this.colorizeProgram.uMaxOpacity, this._maxOpacity);
    gl.uniform1f(this.colorizeProgram.uMinOpacity, this._minOpacity);
    gl.uniform1i(this.colorizeProgram.uUseGradientOpacity, this._useGradientOpacity ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.colorizeProgram.aPosition);
    gl.vertexAttribPointer(this.colorizeProgram.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disableVertexAttribArray(this.colorizeProgram.aPosition);
  }
}
