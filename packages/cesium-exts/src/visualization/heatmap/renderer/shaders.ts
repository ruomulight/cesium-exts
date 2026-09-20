/**
 * 热力图 WebGL 着色器。
 *
 * 绘制分两步：先把径向模糊点累加到 alpha 纹理，再按调色板上色输出到屏幕。
 */

/** 将画布像素坐标转为 clip space，Y 轴翻转以对齐 Canvas2D 左上原点。 */
export const VERTEX_SHADER_POINT = `
  attribute vec2 a_position;
  attribute float a_intensity;
  attribute float a_radius;
  varying float v_intensity;
  uniform vec2 u_resolution;
  void main() {
    vec2 clipSpace = (a_position / u_resolution) * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1.0, -1.0), 0.0, 1.0);
    gl_PointSize = a_radius * 2.0;
    v_intensity = a_intensity;
  }
`;

/**
 * 点精灵径向衰减。与 Canvas2D `createRadialGradient` 一致：内圈实心，向外线性降到 0。
 * `u_blur=0.85` 时内圈半径约为点半径的 15%。
 */
export const FRAGMENT_SHADER_POINT = `
  precision mediump float;
  varying float v_intensity;
  uniform float u_blur;
  void main() {
    float dist = distance(gl_PointCoord, vec2(0.5));
    if (dist > 0.5) discard;

    float alpha = 1.0;
    if (u_blur > 0.0) {
      float inner = 0.5 * (1.0 - u_blur);
      float t = clamp((dist - inner) / max(0.5 - inner, 0.0001), 0.0, 1.0);
      alpha = 1.0 - t;
    }

    gl_FragColor = vec4(0.0, 0.0, 0.0, alpha * v_intensity);
  }
`;

/** 全屏四边形，用于把 alpha 纹理采样到默认帧缓冲。 */
export const VERTEX_SHADER_SCREEN = `
  attribute vec2 a_position;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_position * 0.5 + 0.5;
  }
`;

/** 用 256×1 调色板将强度映射为颜色，透明度规则与 Canvas2D `_colorize` 对齐。 */
export const FRAGMENT_SHADER_COLORIZE = `
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

    vec4 color = texture2D(u_paletteTexture, vec2((floor(alpha * 255.0 + 0.5) + 0.5) / 256.0, 0.5));

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
