# cesium-examples

`cesium-exts` 的 Sandcastle 风格示例与调试应用，基于 React 19、TypeScript 和 Vite，提供 Monaco 代码编辑、iframe 预览、示例画廊与控制台输出。

仓库整体介绍见[中文 README](../../README_CN.md)和[英文 README](../../README.md)。

## 本地运行

需要 Node.js >= 22.22.1 和 pnpm >= 10.12.1，仓库固定使用 pnpm 10.12.1。在仓库根目录执行以下命令。

```bash
pnpm install
pnpm --filter cesium-examples dev
```

打开终端输出的开发地址。Vite 从 `env/` 加载环境配置，`env/.env.development` 中的 `VITE_HOST=0.0.0.0` 允许通过本机 IP 访问。

以下命令也在仓库根目录执行。

```bash
pnpm --filter cesium-examples check-types
pnpm --filter cesium-examples lint
pnpm --filter cesium-examples build
pnpm --filter cesium-examples preview
```

`build` 先执行 TypeScript 检查，再将应用构建到 `dist/`。运行 `preview` 前需要完成构建。

## 浏览、编辑与分享

- 点击画廊卡片直接运行示例，点击卡片上的代码图标进入编辑器。
- 左侧 Cesium 和 OpenLayers 按钮分别打开对应的示例画廊。
- 编辑器分别编辑 JavaScript 和 HTML/CSS。修改后点击“运行”，预览 iframe 会重新加载并执行当前代码。
- 展开预览下方的控制台查看运行日志、警告和错误。
- 内置示例通过 `?id=<目录名>` 定位，例如 `?id=radar-scan`。复制地址栏链接即可分享该示例。
- 编辑器的分享按钮将当前 JavaScript 和 HTML 压缩到 URL hash，并复制链接。打开链接可恢复代码。修改示例并运行后，地址栏中的示例 ID 会清除。
- 开发时修改 `cesium-exts` 源码会触发当前预览重新运行。

## 目录结构

```text
cesium-examples/
├── env/                         # 通用、开发与生产环境配置
├── gallery/cesium/              # 示例源码、元数据与图片
├── templates/bucket.html        # iframe 宿主模板与依赖映射
├── src/
│   ├── App.tsx                  # 页面布局、示例选择与运行操作
│   ├── components/
│   │   ├── Gallery/             # 示例画廊
│   │   ├── SandcastleEditor/    # Monaco 编辑器
│   │   ├── Bucket/              # iframe 预览与重载
│   │   └── ConsoleMirror/       # 控制台消息展示
│   ├── hooks/                  # 编辑状态、URL 分享与页面标题
│   └── util/
│       ├── gallery.ts          # 示例发现与资源地址替换
│       ├── IframeBridge.ts     # 父页面与 iframe 通信
│       └── bucket-client.ts    # iframe 内的 HTML 注入与代码执行
└── vite.config.ts              # React、Cesium 与 Sandcastle 插件配置
```

## 内置示例

- [雷达扫描](gallery/cesium/radar-scan)演示 `RadarScanPrimitive` 多实例渲染与参数调节。
- [发光墙](gallery/cesium/glow-wall)演示 `GlowWallPrimitive` 与流动贴图。
- [地形高度图](gallery/cesium/terrain-height-map)演示通过 `createTerrainHeightMap` 生成 GPU 浮点高度图，使用 ArcGIS World Elevation 地形服务。
- [WebGPU 地形径流](gallery/cesium/terrain-runoff)演示用 `createWebGpuTerrainHeightMap` 的纹理直接计算坡面径流，并在 Cesium 中预览水深。需要支持 WebGPU 的浏览器和 HTTPS 或 localhost；这是教学模型，不用于洪水预测。
- [WMS](gallery/cesium/web-map-service-wms)与[带时间参数的 WMTS](gallery/cesium/web-map-tile-service-with-time)演示影像服务加载。
- [几何层级](gallery/cesium/z-indexing-geometry)演示几何体叠放效果。

涉及在线影像或地形服务的示例需要能够访问对应服务。

## 新增示例

在 `gallery/cesium/<example-name>/` 下创建以下文件，目录名作为 URL 中的示例 ID。
OpenLayers 示例使用同样的文件结构，放在 `gallery/openlayers/<example-name>/`；其 URL ID 为 `openlayers/<example-name>`，避免与 Cesium 示例重名。

```text
my-example/
├── sandcastle.yaml
├── index.html
├── main.js
└── thumbnail.jpg
```

`sandcastle.yaml` 需要提供字符串类型的 `title` 和 `description`，可通过 `labels` 设置标签。

```yaml
title: My Example
description: 展示示例的主要功能。
labels:
  - cesium-exts
```

`index.html` 编写预览所需的 HTML 和样式，例如以下容器。

```html
<div id="cesiumContainer" class="fullSize"></div>
```

`main.js` 编写示例逻辑，可以从以下最小场景开始。

```js
import * as Cesium from "cesium";

const viewer = new Cesium.Viewer("cesiumContainer", {
  baseLayerPicker: false,
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"))
  )
});
```

运行器会将上述 Cesium 命名空间导入转换为 iframe 中已加载的全局 `Cesium`。模板同时为 `cesium-exts` 和 `tweakpane` 提供 import map，可以在示例脚本中直接导入它们。
OpenLayers 示例可使用预览环境提供的全局 `ol` 对象及其样式，参见 [基础地图](gallery/openlayers/basic-map)。示例使用的 OpenStreetMap 瓦片需要网络连接。

画廊通过 `import.meta.glob` 自动发现示例。缺少 `main.js`、`index.html`、有效标题或描述的条目会被跳过，并在浏览器控制台输出警告。`thumbnail.jpg` 可选，缺省时使用公共占位图。

示例脚本中形如 `"./arrow.png"` 的图片路径会替换为 Vite 处理后的资源地址，支持 png、jpg、jpeg、gif、webp 和 svg。此替换作用于 `main.js`，缩略图 `thumbnail.jpg` 仅用于画廊卡片。

## Cesium 运行时配置

`vite.config.ts` 组合了以下工作区插件。

- `vite-cesium-plugin` 托管和复制 Cesium 静态资源，注入 `CESIUM_BASE_URL`。
- `cesiumExtsDev()` 将扩展库源码连接到预览运行时，并提供源码更新通知。
- `cesiumSandcastle()` 处理 bucket 模板、依赖占位符与运行时资源。配置中的 `bucketClientEntry` 指向 `src/util/bucket-client.ts`，用于生成生产构建的 iframe 通信入口。

预览模板位于 `templates/bucket.html`。父页面通过 `IframeBridge` 发送已提交的代码与 HTML，iframe 清理 HTML 后注入页面，并以 ES module 执行脚本，再将控制台消息回传到应用。
