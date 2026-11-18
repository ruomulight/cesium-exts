/**
 * WebGL 高度图顶点着色器。
 *
 * 顶点 `position.xy` 已经是高度图 NDC，`position.z` 是米制高程。
 * 先将高程归一化为 `nz`，再写入 NDC 深度 `1 - nz`。窗口深度为 `1 - 0.5 * nz`，
 * 高处的深度更小，重叠时通过 `LESS` 测试。等高网格使用 `nz = 0.5`，窗口深度为 0.75。
 * 有高度跨度时，恰等于最低高程的片元深度为 1，与清屏值相等，无法通过 `LESS`。
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
 * WebGL 高度图片元着色器。
 *
 * 把米制高程写入 R，A = 1 表示该片段被地形覆盖。G / B 未使用，保持 0。
 */
export const HEIGHTMAP_FRAGMENT_SHADER = `
  in float v_height;

  void main() {
    out_FragColor = vec4(v_height, 0.0, 0.0, 1.0);
  }
`;

/**
 * WebGPU 高度图的顶点与片元着色器。沿用 WebGL 版本的输入布局和 RGBA 通道约定。
 *
 * WebGPU 的纹理第 0 行位于视口顶部。顶点阶段翻转 NDC y，使这一行对应南侧，
 * 读回时可以直接按纹理行序写入数组。设备深度采用 [0, 1]，着色器使用 [0.25, 0.75]
 * 为最低高程留出与深度清屏值 1 的间隔，使其也能通过 `less` 测试。
 */
export const HEIGHTMAP_WGSL = `
  struct VertexOutput {
    @builtin(position) clipPosition: vec4f,
    @location(0) height: f32,
  }

  @group(0) @binding(0) var<uniform> heightRange: vec2f;

  @vertex
  fn vertexMain(@location(0) position: vec3f) -> VertexOutput {
    let range = heightRange.y - heightRange.x;
    var normalizedHeight = 0.5;
    if (range > 0.0) {
      normalizedHeight = clamp((position.z - heightRange.x) / range, 0.0, 1.0);
    }
    return VertexOutput(
      vec4f(position.x, -position.y, 0.75 - 0.5 * normalizedHeight, 1.0),
      position.z
    );
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    return vec4f(input.height, 0.0, 0.0, 1.0);
  }
`;
