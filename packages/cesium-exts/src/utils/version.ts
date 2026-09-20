import * as Cesium from "cesium";

import pkg from "../../package.json" with { type: "json" };

/**
 * 获取当前 Cesium 库的版本号。
 */
export function cesiumVersion(): string {
  return Cesium.VERSION;
}

/**
 * 获取当前 cesium-exts 库的版本号。
 */
export function cesiumExtsVersion(): string {
  return pkg.version;
}
