import { type ResolvedHeatmapOptions } from "../config";
import { type HeatmapRenderData, type HeatmapRenderer, type HeatmapRenderPoint } from "../types";
import {
  FRAGMENT_SHADER_COLORIZE,
  FRAGMENT_SHADER_POINT,
  VERTEX_SHADER_POINT,
  VERTEX_SHADER_SCREEN
} from "./shaders";
import {
  createColorPalette,
  mountCanvas,
  opacityToByte,
  resolveCanvasSize,
  sampleHeatValue
} from "./shared";

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
 * 两趟绘制：先以加法混合把径向点累加到 alpha 纹理，再采样调色板输出到屏幕。
 * 强度已归一化，模糊与透明度规则与 {@link Canvas2dRenderer} 对齐。
 * 卸载时必须调用 {@link CanvasWebGLRenderer.destroy}。
 */
export class CanvasWebGLRenderer implements HeatmapRenderer {
  /** 可见输出画布 */
  public readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGLRenderingContext;
  /** 为 true 时 destroy 会移除 canvas 节点 */
  private readonly _ownsCanvas: boolean;
  private readonly _container: HTMLElement | undefined;

  private _width = 0;
  private _height = 0;
  private _max = 1;
  private _min = 0;
  private _opacity = 0;
  private _maxOpacity = 255;
  private _minOpacity = 0;
  private _blur = 0.85;
  private _useGradientOpacity = false;
  private _destroyed = false;

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
   * @param config 已解析的完整配置
   * @throws 当前 canvas 无法创建 WebGL 上下文，或着色器编译/链接失败
   */
  constructor(config: ResolvedHeatmapOptions) {
    this._ownsCanvas = !config.canvas;
    this._container = config.container;
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
    mountCanvas(this.canvas, config.container);
    this.updateConfig(config);
  }

  /**
   * 清空 alpha 纹理后全量重绘。
   *
   * @param data 当前全部聚合点
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
   * @param data 本次增量点
   */
  public renderPartial(data: HeatmapRenderData): void {
    if (this._destroyed) return;
    this._min = data.min;
    this._max = data.max;
    this._draw(data.points, true);
  }

  /**
   * 更新渐变、模糊、透明度与尺寸。
   *
   * @param config 新配置
   */
  public updateConfig(config: ResolvedHeatmapOptions): void {
    if (this._destroyed) return;

    this._blur = config.blur;
    this._opacity = opacityToByte(config.opacity);
    this._maxOpacity = opacityToByte(config.maxOpacity);
    this._minOpacity = opacityToByte(config.minOpacity);
    this._useGradientOpacity = config.useGradientOpacity;
    this._updatePalette(config.gradient);

    if (config.backgroundColor) {
      this.canvas.style.backgroundColor = config.backgroundColor;
    }

    const width = config.width ?? this._width;
    const height = config.height ?? this._height;
    this.setDimensions(width, height);
  }

  /**
   * 调整画布、viewport 与 alpha 纹理尺寸。
   *
   * @param width 宽度（像素）
   * @param height 高度（像素）
   */
  public setDimensions(width: number, height: number): void {
    if (this._destroyed || (width === this._width && height === this._height)) return;
    this._width = this.canvas.width = width;
    this._height = this.canvas.height = height;
    this.gl.viewport(0, 0, Math.max(width, 1), Math.max(height, 1));
    this._resizeAlphaTexture();
  }

  /**
   * 从 alpha 纹理 `readPixels`。WebGL 原点在左下，读取时翻转 Y。
   *
   * @param point 画布像素坐标（左上原点）
   */
  public getValueAt(point: { x: number; y: number }): number {
    if (this._destroyed || this._width <= 0 || this._height <= 0) return 0;

    const gl = this.gl;
    const pixels = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.alphaTexture, 0);
    gl.readPixels(point.x, this._height - point.y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return sampleHeatValue(pixels[3] ?? 0, this._min, this._max);
  }

  /** @returns PNG Data URL */
  public getDataURL(): string {
    return this.canvas.toDataURL();
  }

  /**
   * 删除 program / buffer / texture / framebuffer。由本实例创建的 canvas 会从 DOM 移除。
   */
  public destroy(): void {
    if (this._destroyed) return;

    const gl = this.gl;
    gl.deleteProgram(this.pointProgram.program);
    gl.deleteProgram(this.colorizeProgram.program);
    gl.deleteBuffer(this.pointBuffer);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteTexture(this.alphaTexture);
    gl.deleteTexture(this.paletteTexture);
    gl.deleteFramebuffer(this.framebuffer);

    if (this._ownsCanvas) {
      this.canvas.remove();
    } else if (this._container && this.canvas.parentElement === this._container) {
      this._container.removeChild(this.canvas);
    }

    this._destroyed = true;
  }

  /** 创建 ARRAY_BUFFER。 */
  private _createBuffer(): WebGLBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error("[heatmap] Failed to create WebGL buffer.");
    }
    return buffer;
  }

  /** 创建离屏 FBO，用于绑定 alpha 纹理。 */
  private _createFramebuffer(): WebGLFramebuffer {
    const framebuffer = this.gl.createFramebuffer();
    if (!framebuffer) {
      throw new Error("[heatmap] Failed to create WebGL framebuffer.");
    }
    return framebuffer;
  }

  /** 创建 NEAREST / CLAMP 的 2D 纹理。 */
  private _createTexture(): WebGLTexture {
    const gl = this.gl;
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("[heatmap] Failed to create WebGL texture.");
    }
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
    gl.bindTexture(gl.TEXTURE_2D, this.alphaTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
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
   * 链接顶点/片元着色器。链接完成后删除 shader 对象以释放驱动内存。
   */
  private _createProgram(vsSource: string, fsSource: string): WebGLProgram {
    const gl = this.gl;
    const vs = this._compileShader(vsSource, gl.VERTEX_SHADER);
    const fs = this._compileShader(fsSource, gl.FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!program) {
      throw new Error("[heatmap] Failed to create WebGL program.");
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("[heatmap] Program link error: " + gl.getProgramInfoLog(program));
    }
    return program;
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
    const gl = this.gl;
    const palette = createColorPalette(gradient);
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
  }

  /**
   * 交错顶点：`x, y, intensity, radius`。
   * intensity 已按 min/max 归一化，下限 0.01，与 Canvas2D 的 globalAlpha 一致。
   */
  private _toVertexData(points: HeatmapRenderPoint[]): Float32Array {
    const range = this._max - this._min || 1;
    const out = new Float32Array(points.length * 4);
    for (let i = 0; i < points.length; i++) {
      const point = points[i]!;
      const offset = i * 4;
      out[offset] = point.x;
      out[offset + 1] = point.y;
      out[offset + 2] = Math.max((Math.min(point.value, this._max) - this._min) / range, 0.01);
      out[offset + 3] = point.radius;
    }
    return out;
  }

  /**
   * 两趟绘制：FBO 上累加点 alpha（`partial` 时不清空），再上色到默认帧缓冲。
   *
   * @param points 待绘制的点
   * @param partial 为 true 时保留已有 alpha 纹理
   */
  private _draw(points: HeatmapRenderPoint[], partial: boolean): void {
    if (this._width <= 0 || this._height <= 0) return;

    const gl = this.gl;
    const width = this._width;
    const height = this._height;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.alphaTexture, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return;
    }
    gl.viewport(0, 0, width, height);

    // Pass 1：径向点以 source-over 叠到 alpha 纹理（与 Canvas2D 默认合成一致，不是加法）
    if (!partial) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.pointProgram.program);
    gl.uniform2f(this.pointProgram.uResolution, width, height);
    gl.uniform1f(this.pointProgram.uBlur, this._blur);

    const vertices = this._toVertexData(points);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pointBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(this.pointProgram.aPosition);
    gl.vertexAttribPointer(this.pointProgram.aPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(this.pointProgram.aIntensity);
    gl.vertexAttribPointer(this.pointProgram.aIntensity, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(this.pointProgram.aRadius);
    gl.vertexAttribPointer(this.pointProgram.aRadius, 1, gl.FLOAT, false, 16, 12);
    gl.drawArrays(gl.POINTS, 0, points.length);

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
    gl.uniform1f(this.colorizeProgram.uOpacity, this._opacity / 255);
    gl.uniform1f(this.colorizeProgram.uMaxOpacity, this._maxOpacity / 255);
    gl.uniform1f(this.colorizeProgram.uMinOpacity, this._minOpacity / 255);
    gl.uniform1i(this.colorizeProgram.uUseGradientOpacity, this._useGradientOpacity ? 1 : 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
    gl.enableVertexAttribArray(this.colorizeProgram.aPosition);
    gl.vertexAttribPointer(this.colorizeProgram.aPosition, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
