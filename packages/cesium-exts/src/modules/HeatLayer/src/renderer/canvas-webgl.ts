import { HeatmapConfig } from "../config";
import { type RendererConfig } from "./canvas2d";

/**
 * WebGL 渲染器类，提供高性能的热力图渲染
 */
export class CanvasWebGLRenderer {
  public canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  private _width: number = 0;
  private _height: number = 0;
  private _max: number = 1;
  private _min: number = 0;

  // Shader programs
  private pointProgram!: WebGLProgram;
  private colorizeProgram!: WebGLProgram;

  // Buffers
  private pointBuffer!: WebGLBuffer;
  private quadBuffer!: WebGLBuffer;

  // Textures
  private framebuffer!: WebGLFramebuffer;
  private alphaTexture!: WebGLTexture;
  private paletteTexture!: WebGLTexture;

  private _palette!: Uint8ClampedArray;
  private _opacity: number = 255;
  private _maxOpacity: number = 255;
  private _minOpacity: number = 0;
  private _blur: number = 0.85;
  private _useGradientOpacity: boolean = false;

  /**
   * 构造函数
   * @param config - 渲染器配置
   */
  constructor(config: RendererConfig) {
    const container = config.container;
    const canvas = (this.canvas = config.canvas || document.createElement("canvas"));
    canvas.className = "heatmap-canvas";

    const computed = getComputedStyle(container) || {};
    this._width = canvas.width = config.width || +(computed.width?.replace(/px/, "") || 0);
    this._height = canvas.height = config.height || +(computed.height?.replace(/px/, "") || 0);

    const gl =
      canvas.getContext("webgl", { preserveDrawingBuffer: true, antialias: false }) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext);

    if (!gl) {
      throw new Error("WebGL not supported");
    }
    this.gl = gl;

    canvas.style.cssText = "position:absolute;left:0;top:0;";
    container.style.position = "relative";
    container.appendChild(canvas);

    this._initWebGL();
    this.updateConfig(config);
  }

  /**
   * 初始化 WebGL 资源
   */
  private _initWebGL(): void {
    const gl = this.gl;

    // 1. 初始化着色器程序
    this.pointProgram = this._createProgram(vertexShaderPoint, fragmentShaderPoint);
    this.colorizeProgram = this._createProgram(vertexShaderScreen, fragmentShaderColorize);

    // 2. 初始化缓冲区
    this.pointBuffer = gl.createBuffer()!;
    this.quadBuffer = gl.createBuffer()!;

    // 屏幕填充四边形数据
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    // 3. 初始化帧缓冲区和纹理
    this.framebuffer = gl.createFramebuffer()!;
    this.alphaTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.alphaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this._width, this._height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.paletteTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * 创建着色器程序
   */
  private _createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this._compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = this._compileShader(fsSource, gl.FRAGMENT_SHADER);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(program));
    }
    return program;
  }

  /**
   * 编译着色器
   */
  private _compileShader(source: string, type: number): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  /**
   * 更新配置
   * @param config - 配置项
   */
  public updateConfig(config: RendererConfig): void {
    if (config.gradient || config.defaultGradient) {
      this._updatePalette(config);
    }
    this._blur = config.blur === 0 ? 0 : config.blur || config.defaultBlur || HeatmapConfig.defaultBlur;
    this._opacity = (config.opacity || 0) * 255;
    this._maxOpacity = (config.maxOpacity || config.defaultMaxOpacity || HeatmapConfig.defaultMaxOpacity) * 255;
    this._minOpacity = (config.minOpacity || config.defaultMinOpacity || HeatmapConfig.defaultMinOpacity) * 255;
    this._useGradientOpacity = !!config.useGradientOpacity;

    if (config.backgroundColor) {
      this.canvas.style.backgroundColor = config.backgroundColor;
    }

    if (config.width || config.height) {
      this.setDimensions(config.width || this._width, config.height || this._height);
    }
  }

  /**
   * 更新调色板纹理
   */
  private _updatePalette(config: any): void {
    const gl = this.gl;
    const gradientConfig = config.gradient || config.defaultGradient || HeatmapConfig.defaultGradient;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d")!;
    canvas.width = 256;
    canvas.height = 1;

    const gradient = ctx.createLinearGradient(0, 0, 256, 1);
    for (const key in gradientConfig) {
      gradient.addColorStop(Number(key), gradientConfig[key]);
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 1);

    this._palette = ctx.getImageData(0, 0, 256, 1).data;
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, this._palette);
  }

  /**
   * 设置尺寸
   * @param width - 宽度
   * @param height - 高度
   */
  public setDimensions(width: number, height: number): void {
    const gl = this.gl;
    this._width = this.canvas.width = width;
    this._height = this.canvas.height = height;
    gl.viewport(0, 0, width, height);

    gl.bindTexture(gl.TEXTURE_2D, this.alphaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  }

  /**
   * 渲染全部数据
   * @param data - 数据封装
   */
  public renderAll(data: any): void {
    this._max = data.max;
    this._min = data.min;

    const points = [];
    const radi = data.radi;
    const store = data.data;

    for (const x in store) {
      for (const y in store[x]!) {
        points.push(Number(x), Number(y), store[x]![y]!, radi[x]![y]!);
      }
    }

    this._draw(points);
  }

  /**
   * 渲染部分数据
   * @param data - 数据增量
   */
  public renderPartial(data: any): void {
    this._max = data.max;
    this._min = data.min;

    const points = [];
    for (const point of data.data) {
      points.push(point.x, point.y, point.value, point.radius);
    }
    // 注意：WebGL 增量渲染需要混合到现有纹理，这里简化为重新绘制所有（或保存状态）
    // 为了真实的高性能，通常推荐重新上传受影响的数据
    this._draw(points, true);
  }

  /**
   * 核心绘制流程
   */
  private _draw(points: number[], partial: boolean = false): void {
    const gl = this.gl;

    // --- 第一步：绘制点到 Alpha 纹理 ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.alphaTexture, 0);

    if (!partial) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE); // 加法混合

    gl.useProgram(this.pointProgram);

    const uResolution = gl.getUniformLocation(this.pointProgram, "u_resolution");
    gl.uniform2f(uResolution, this._width, this._height);

    const uBlur = gl.getUniformLocation(this.pointProgram, "u_blur");
    gl.uniform1f(uBlur, this._blur);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STREAM_DRAW);

    const aPosition = gl.getAttribLocation(this.pointProgram, "a_position");
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 16, 0);

    const aIntensity = gl.getAttribLocation(this.pointProgram, "a_intensity");
    gl.enableVertexAttribArray(aIntensity);
    gl.vertexAttribPointer(aIntensity, 1, gl.FLOAT, false, 16, 8);

    const aRadius = gl.getAttribLocation(this.pointProgram, "a_radius");
    gl.enableVertexAttribArray(aRadius);
    gl.vertexAttribPointer(aRadius, 1, gl.FLOAT, false, 16, 12);

    gl.drawArrays(gl.POINTS, 0, points.length / 4);

    // --- 第二步：将 Alpha 纹理着色并绘制到屏幕 ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(this.colorizeProgram);

    const uAlphaTexture = gl.getUniformLocation(this.colorizeProgram, "u_alphaTexture");
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.alphaTexture);
    gl.uniform1i(uAlphaTexture, 0);

    const uPaletteTexture = gl.getUniformLocation(this.colorizeProgram, "u_paletteTexture");
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.uniform1i(uPaletteTexture, 1);

    const uOpacity = gl.getUniformLocation(this.colorizeProgram, "u_opacity");
    gl.uniform1f(uOpacity, this._opacity / 255);
    const uMaxOpacity = gl.getUniformLocation(this.colorizeProgram, "u_maxOpacity");
    gl.uniform1f(uMaxOpacity, this._maxOpacity / 255);
    const uMinOpacity = gl.getUniformLocation(this.colorizeProgram, "u_minOpacity");
    gl.uniform1f(uMinOpacity, this._minOpacity / 255);
    const uUseGradientOpacity = gl.getUniformLocation(this.colorizeProgram, "u_useGradientOpacity");
    gl.uniform1i(uUseGradientOpacity, this._useGradientOpacity ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    const aScreenPos = gl.getAttribLocation(this.colorizeProgram, "a_position");
    gl.enableVertexAttribArray(aScreenPos);
    gl.vertexAttribPointer(aScreenPos, 2, gl.FLOAT, false, 0, 0);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.BLEND);
  }

  /**
   * 获取某点数值
   */
  public getValueAt(point: { x: number; y: number }): number {
    const gl = this.gl;
    const pixels = new Uint8Array(4);

    // 从 Alpha 纹理读取
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.readPixels(point.x, this._height - point.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    const alpha = pixels[3]! / 255;
    return Math.round(alpha * (this._max - this._min) + this._min);
  }

  /**
   * 获取 DataURL
   */
  public getDataURL(): string {
    return this.canvas.toDataURL();
  }
}

// --- 着色器源码 ---

const vertexShaderPoint = `
  attribute vec2 a_position;
  attribute float a_intensity;
  attribute float a_radius;
  varying float v_intensity;
  varying float v_radius;
  uniform vec2 u_resolution;
  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    gl_PointSize = a_radius * 2.0;
    v_intensity = a_intensity;
    v_radius = a_radius;
  }
`;

const fragmentShaderPoint = `
  precision mediump float;
  varying float v_intensity;
  varying float v_radius;
  uniform float u_blur;
  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;
    
    // 实现径向模糊
    float alpha = 1.0 - smoothstep(0.5 * u_blur, 0.5, dist);
    gl_FragColor = vec4(0, 0, 0, alpha * v_intensity);
  }
`;

const vertexShaderScreen = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0, 1);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

const fragmentShaderColorize = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_alphaTexture;
  uniform sampler2D u_paletteTexture;
  uniform float u_opacity;
  uniform float u_maxOpacity;
  uniform float u_minOpacity;
  uniform bool u_useGradientOpacity;

  void main() {
    float alpha = texture2D(u_alphaTexture, v_texCoord).a;
    if (alpha <= 0.0) {
      discard;
    }

    vec4 color = texture2D(u_paletteTexture, vec2(alpha, 0.5));
    
    float finalAlpha;
    if (u_opacity > 0.0) {
      finalAlpha = u_opacity;
    } else {
      finalAlpha = clamp(alpha, u_minOpacity, u_maxOpacity);
    }

    if (u_useGradientOpacity) {
      gl_FragColor = vec4(color.rgb, color.a);
    } else {
      gl_FragColor = vec4(color.rgb, finalAlpha);
    }
  }
`;
