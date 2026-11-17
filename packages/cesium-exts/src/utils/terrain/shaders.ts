/**
 * 高度图顶点着色器。
 *
 * 顶点 `position.xy` 已经是高度图 NDC，`position.z` 是米制高程。
 * 把高程归一化后编进窗口深度：更高的地形深度更小，配合 `LESS` 深度测试胜出。
 * `u_minHeight === u_maxHeight` 时深度固定为 0.5。
 */
export const HEIGHTMAP_VERTEX_SHADER = `
  in vec3 position;
  out float v_height;
  uniform float u_minHeight;
  uniform float u_maxHeight;

  void main() {
    float range = u_maxHeight - u_minHeight;
    float nz = range > 0.0 ? (position.z - u_minHeight) / range : 0.5;
    v_height = position.z;
    gl_Position = vec4(position.xy, 1.0 - nz, 1.0);
  }
`;

/**
 * 高度图片元着色器。
 *
 * 把米制高程写入 R，A = 1 表示该片段被地形覆盖。G / B 未使用，保持 0。
 */
export const HEIGHTMAP_FRAGMENT_SHADER = `
  in float v_height;

  void main() {
    out_FragColor = vec4(v_height, 0.0, 0.0, 1.0);
  }
`;
