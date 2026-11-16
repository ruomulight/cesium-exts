/**
 * 所有发光墙共用的 Fabric 类型名。
 *
 * Cesium 按这个名字缓存着色器。类型名固定后，多面墙和反复改高度都不会重新编译。
 */
export const GLOW_WALL_MATERIAL_TYPE = "cesium-exts-GlowWall";

/**
 * 动态发光墙的 Fabric 片元着色器。
 *
 * 墙面纹理坐标 `st.s` 沿墙长，`st.t` 从底（0）到顶（1）。
 * 时间来自 Cesium 内置的 `czm_frameNumber`，不需要每帧改 uniform。
 *
 * `useImage` 为 0 时，`fract(st.t - time)` 让高亮峰向上移动，`pow` 收成一条窄光带。
 * `useImage` 为 1 时，改为采样 `image`。`flowAxis` 为 0 沿墙高滚动，为 1 沿墙长滚动。
 * 贴图透明处 alpha 为 0，不遮挡后面的场景。
 *
 * uniform 由 `Cesium.Material` 按 fabric 声明注入，源码里不要再声明。
 */
export const GLOW_WALL_SHADER_SOURCE = `
  czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 st = materialInput.st;

    // speed / 1000 把帧号缩放到接近肉眼可辨的流速，fract 把时间折进 0~1
    float time = fract(czm_frameNumber * speed / 1000.0);

    if (useImage > 0.5) {
      vec2 uv = vec2(st.s * repeat.x, st.t * repeat.y);
      // 减去 time 后，同一纹素会移向更大的 s 或 t，正速度因此沿墙长或向上走
      uv.x = fract(uv.x - time * flowAxis);
      uv.y = fract(uv.y - time * (1.0 - flowAxis));
      vec4 imageColor = czm_gammaCorrect(texture(image, uv));
      material.diffuse = imageColor.rgb * color.rgb;
      material.alpha = imageColor.a * color.a;
      material.emission = material.diffuse * emission;
    } else {
      // 盯住墙面某个高度：time 增大时 position 减小，直到绕回 1，光带因此向上走
      float position = fract(st.t - time);
      // 指数越大，只有接近 1 的波峰还亮，其余接近透明
      float glow = pow(position, glowPower);
      material.diffuse = color.rgb;
      material.alpha = color.a * (glow + baseAlpha);
      material.emission = material.diffuse * emission;
    }

    return material;
  }
`;
