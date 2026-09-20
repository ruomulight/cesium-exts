/**
 * 雷达扫描模块 GLSL 着色器源码
 *
 * 半球防护罩着色器：内含极点消隐与独立 domeBaseAlpha
 * 地面扫描底盘着色器：内含刻度圆环与独立 groundBaseAlpha
 */

/** 半球防护罩专属着色器 (内含极点消隐与独立 domeBaseAlpha) */
export const DOME_SHADER_SOURCE = `
  czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    float angle = materialInput.st.s; float elevation = materialInput.st.t;
    float scan = fract(u_time); float diff = scan - angle; if (diff < 0.0) diff += 1.0;
    float trail = exp(-diff * 6.0); float edge = smoothstep(0.95, 1.0, trail);
    float poleFade = 1.0 - smoothstep(0.85, 1.0, elevation);
    vec3 color = u_color.rgb;
    float alpha = u_baseAlpha + (trail * u_scanAlpha * 0.7 * poleFade);
    material.diffuse = color; material.alpha = alpha * u_color.a;
    material.emission = color * (trail * 0.5 + edge * 2.0) * poleFade;
    return material;
  }
`;

/** 地面扫描底盘专属着色器 (内含刻度圆环与独立 groundBaseAlpha) */
export const GROUND_SHADER_SOURCE = `
  czm_material czm_getMaterial(czm_materialInput materialInput) {
    czm_material material = czm_getDefaultMaterial(materialInput);
    vec2 uv = materialInput.st - 0.5; float dist = length(uv); if (dist > 0.5) discard;
    float angle = fract((atan(uv.y, uv.x) + 3.14159265) / 6.2831853 + 0.25);
    float scan = fract(u_time); float diff = scan - angle; if (diff < 0.0) diff += 1.0;
    float trail = exp(-diff * 6.0); float edge = smoothstep(0.95, 1.0, trail);
    float rings = step(0.96, fract(dist * 10.0)) * 0.15;
    float crosshair = (step(abs(uv.x), 0.003) + step(abs(uv.y), 0.003)) * 0.15;
    vec3 color = u_color.rgb;
    float alpha = u_baseAlpha + trail * u_scanAlpha + rings + crosshair;
    material.diffuse = color; material.alpha = alpha * u_color.a;
    material.emission = color * (trail * 0.6 + edge * 2.0 + rings);
    return material;
  }
`;
