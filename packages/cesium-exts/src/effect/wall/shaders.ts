/**
 * 动态发光墙材质。
 *
 * 墙面纹理坐标 `st.t` 从底（0）到顶（1）。
 * `fract(st.t - time)` 让高亮峰随帧向上移动；`pow` 把线性渐变收成一条窄光带。
 * 时间来自 Cesium 内置的 `czm_frameNumber`，不需要每帧改 uniform。
 *
 * uniforms 由 `Cesium.Material` 按 fabric 声明注入，这里不要再写一遍 `uniform`。
 */
export const GLOW_WALL_SHADER_SOURCE = `
  czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 st = materialInput.st;

    // speed / 1000 把帧号缩放到接近肉眼可辨的流速，fract 把时间折进 0~1
    float time = fract(czm_frameNumber * speed / 1000.0);
    // 盯住墙面某个高度：time 增大时 position 减小，直到绕回 1，光带因此向上走
    float position = fract(st.t - time);
    // 指数越大，只有接近 1 的波峰还亮，其余接近透明
    float glow = pow(position, glowPower);

    material.diffuse = color.rgb;
    material.alpha = color.a * (glow + baseAlpha);
    material.emission = material.diffuse * emission;
    return material;
  }
`;
