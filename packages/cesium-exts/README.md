# cesium-exts

Cesium 扩展引擎核心库，基于 Cesium v1.141.0 开发，提供热力图、雷达扫描、风场等地理可视化组件。

## 特性

- 热力图（HeatLayer）- 基于 h337 的高性能 Canvas2D/WebGL 双渲染
- 雷达扫描（Radar）- 自定义 GLSL Shader，支持海量实例同屏渲染
- 风场（WindLayer）- 风场可视化
- 工具函数（cesiumUtils）- Cesium 版本查询、相机飞行等

## 安装

```bash
pnpm add cesium-exts
```

peerDependencies: `cesium`

## 构建

```bash
pnpm install
pnpm build
```

## License

ISC
