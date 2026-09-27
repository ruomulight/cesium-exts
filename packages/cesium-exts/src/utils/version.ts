import cesiumPkg from "cesium/package.json" with { type: "json" };

import pkg from "../../package.json" with { type: "json" };

/**
 * 获取当前 Cesium 库的版本号。
 *
 * 优先使用运行时 UMD 的 `Cesium.VERSION`（iframe 等已挂载全局的场景）；
 * 否则回退到已安装的 `cesium` 包版本。不使用 `import * as Cesium`，
 * 避免 sandcastle 开发插件将其改写为尚未加载的 `globalThis.Cesium`。
 */
export function cesiumVersion(): string {
  const runtime = (globalThis as { Cesium?: { VERSION?: string } }).Cesium?.VERSION;
  return runtime ?? cesiumPkg.version;
}

/**
 * 获取当前 cesium-exts 库的版本号。
 */
export function cesiumExtsVersion(): string {
  return pkg.version;
}
