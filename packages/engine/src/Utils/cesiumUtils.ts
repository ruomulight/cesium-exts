import * as Cesium from "cesium";

import pkg from "../../package.json" with { type: "json" };

/**
 * 获取并返回当前 Cesium 库的版本号字符串
 *
 * @returns {string} Cesium 的版本号
 *
 * @example
 * ```ts
 * const version = cesiumVersion();
 * console.log('当前的 Cesium 版本:', version);
 * ```
 */
export function cesiumVersion(): string {
  return Cesium.globalThis.CESIUM_VERSION;
}

/**
 * 获取并返回当前 cesium-exts 库的版本号
 *
 * @returns {string} cesium-exts 的版本号
 *
 * @example
 * ```ts
 * const version = cesiumExtsVersion();
 * console.log('当前的 cesium-exts 版本:', version);
 * ```
 */
export function cesiumExtsVersion(): string {
  return pkg.version;
}

/**
 * 平滑地飞行到指定目标的相机视角（基于包围球计算）。
 *
 * @param viewer - Cesium `Viewer` 实例。
 * @param options - 相机飞行配置项。
 * @param options.targetPosition - 目标点的 `Cartesian3` 坐标。
 * @param options.radius - 包围球半径（单位：米，默认 `10` 米）。
 *   用于确定目标的空间范围。
 * @param options.heading - 航向角（单位：度，默认 `0`°，0 表示正北）。
 *   用于控制相机水平方向旋转。
 * @param options.pitch - 俯仰角（单位：度，默认 `-45`°，负值表示向下俯视）。
 *   用于控制相机上下倾斜角度。
 * @param options.range - 相机与目标点的距离（单位：米，默认 `15000` 米）。
 * @param options.duration - 动画持续时间（单位：秒，默认 `1.5` 秒）。
 *
 * @throws 如果 `viewer` 无效（`null` 或 `undefined`）会抛出异常。
 *
 * @remarks
 * - 该方法通过 `flyToBoundingSphere` 来实现相机移动，因此目标点会作为包围球中心进行定位。
 * - 如果只需要直接设置视角而不需要动画，可以考虑使用 `viewer.camera.setView`。
 *
 * @example
 * ```ts
 * // 创建目标点
 * const target = Cesium.Cartesian3.fromDegrees(116.397128, 39.916527, 1000);
 *
 * // 飞行到目标
 * flyToTarget(viewer, {
 *   targetPosition: target,
 *   heading: 90,  // 朝东
 *   pitch: -30,   // 俯视
 *   range: 5000,  // 5km 距离
 *   duration: 2   // 2 秒飞行时间
 * });
 * ```
 */
export function flyToTarget(
  viewer: Cesium.Viewer,
  options: {
    targetPosition: Cesium.Cartesian3;
    radius?: number;
    heading?: number;
    pitch?: number;
    range?: number;
    duration?: number;
  }
): void {
  const { targetPosition, radius = 10, heading = 0, pitch = -45, range = 15000, duration = 1.5 } = options;

  if (!viewer) {
    throw new Error("Invalid Cesium Viewer instance.");
  }

  // 克隆目标点的 Cartesian3 坐标
  const clonedPosition = Cesium.Cartesian3.clone(targetPosition);

  // 创建包围球，以目标点为中心
  const boundingSphere = new Cesium.BoundingSphere(clonedPosition, radius);

  // 转换角度为弧度
  const headingRad = Cesium.Math.toRadians(heading);
  const pitchRad = Cesium.Math.toRadians(pitch);

  // 使用 flyToBoundingSphere 跳转到目标点
  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration: duration,
    offset: new Cesium.HeadingPitchRange(headingRad, pitchRad, range)
  });
}

export default { cesiumVersion, cesiumExtsVersion, flyToTarget };
