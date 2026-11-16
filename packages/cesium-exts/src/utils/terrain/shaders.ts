/**
 * 高度图顶点着色器。
 *
 * 顶点的 xy 已经是高度图 NDC，z 是米制高程。
 * 把高程编进窗口深度，深度测试 LESS 时更高的地形胜出。
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

/** 把米制高程写入 R，A = 1 表示该片段被地形覆盖。 */
export const HEIGHTMAP_FRAGMENT_SHADER = `
  in float v_height;

  void main() {
    out_FragColor = vec4(v_height, 0.0, 0.0, 1.0);
  }
`;
