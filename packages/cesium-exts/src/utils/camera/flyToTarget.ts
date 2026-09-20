import * as Cesium from "cesium";

export interface FlyToTargetOptions {
  /** 目标点的 `Cartesian3` 坐标。 */
  targetPosition: Cesium.Cartesian3;
  /** 包围球半径（米），默认 `10`。 */
  radius?: number;
  /** 航向角（度），默认 `0`（正北）。 */
  heading?: number;
  /** 俯仰角（度），默认 `-45`。 */
  pitch?: number;
  /** 相机与目标点的距离（米），默认 `15000`。 */
  range?: number;
  /** 动画持续时间（秒），默认 `1.5`。 */
  duration?: number;
}

/**
 * 平滑飞行到指定目标（基于包围球）。
 *
 * 需要直接跳转而无动画时，使用 `viewer.camera.setView`。
 */
export function flyToTarget(viewer: Cesium.Viewer, options: FlyToTargetOptions): void {
  const { targetPosition, radius = 10, heading = 0, pitch = -45, range = 15000, duration = 1.5 } = options;

  if (!viewer) {
    throw new Error("Invalid Cesium Viewer instance.");
  }

  const clonedPosition = Cesium.Cartesian3.clone(targetPosition);
  const boundingSphere = new Cesium.BoundingSphere(clonedPosition, radius);
  const headingRad = Cesium.Math.toRadians(heading);
  const pitchRad = Cesium.Math.toRadians(pitch);

  viewer.camera.flyToBoundingSphere(boundingSphere, {
    duration,
    offset: new Cesium.HeadingPitchRange(headingRad, pitchRad, range)
  });
}
