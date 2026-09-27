/**
 * RadarScanPrimitive 示例
 *
 * 演示立体雷达扫描半球与地面底盘的多实例渲染，
 * 并通过 Tweakpane 面板调节运行时参数、增删站点。
 */
import * as Cesium from "cesium";
import { flyToTarget, RadarScanPrimitive } from "cesium-exts";
import { Pane } from "tweakpane";

// 精简 Viewer UI，突出雷达效果本身
const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: true,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: true,
  infoBox: false,
  selectionIndicator: false
});

// 上海浦东附近的三个初始雷达站点（经度 / 纬度 / 高度，单位：度、度、米）
const INITIAL_POSITIONS = [
  { longitude: 121.505, latitude: 31.235, height: 0 },
  { longitude: 121.525, latitude: 31.245, height: 0 },
  { longitude: 121.49, latitude: 31.22, height: 0 }
];

/**
 * Tweakpane 绑定用的可变参数。
 * 字段含义与 RadarScanOptions 对应，便于面板与图元双向同步。
 */
const PARAMS = {
  show: true, // 是否显示雷达图元
  speed: 1.0, // 扫描扇面旋转速度乘数
  radius: 1500, // 探测半径（米）
  color: { r: 153, g: 255, b: 0 }, // 主题色（Tweakpane RGB）
  scanAlpha: 0.8, // 扫描拖尾亮度（约 0~2）
  domeBaseAlpha: 0.2, // 半球罩底色透明度（约 0~1）
  groundBaseAlpha: 0.15, // 地面底盘底色透明度（约 0~1）
  clickToAdd: true // 左键点击地球是否新增雷达站点
};

/**
 * 将 Tweakpane 的 { r, g, b } 转为 CSS 颜色字符串，
 * 供 RadarScanPrimitive.setColor / 构造选项使用。
 */
function toCssColor(color) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

// 创建雷达图元；groundOffset 略抬高底盘，减轻与地形的 Z-Fighting
const radar = new RadarScanPrimitive(viewer, {
  positions: INITIAL_POSITIONS,
  radius: PARAMS.radius,
  color: toCssColor(PARAMS.color),
  speed: PARAMS.speed,
  scanAlpha: PARAMS.scanAlpha,
  domeBaseAlpha: PARAMS.domeBaseAlpha,
  groundBaseAlpha: PARAMS.groundBaseAlpha,
  groundOffset: 5
});

// 飞到第一个站点附近，俯视观察半球与扫描效果
const center = INITIAL_POSITIONS[0];
flyToTarget(viewer, {
  targetPosition: Cesium.Cartesian3.fromDegrees(center.longitude, center.latitude, 0),
  radius: PARAMS.radius,
  heading: 40,
  pitch: -30,
  range: 7000,
  duration: 2
});

// ---------- 调试面板：实时同步到 RadarScanPrimitive ----------
const pane = new Pane({ title: "雷达扫描" });

pane.addBinding(PARAMS, "show", { label: "显示" }).on("change", ev => {
  radar.show = ev.value;
});

pane.addBinding(PARAMS, "speed", { label: "扫描速度", min: 0, max: 5, step: 0.1 }).on("change", ev => {
  radar.setSpeed(ev.value);
});

// 改半径会重建几何，成本高于改颜色 / 透明度
pane.addBinding(PARAMS, "radius", { label: "探测半径", min: 500, max: 5000, step: 50 }).on("change", ev => {
  radar.setRadius(ev.value);
});

pane.addBinding(PARAMS, "color", { label: "主题色" }).on("change", ev => {
  radar.setColor(toCssColor(ev.value));
});

pane.addBinding(PARAMS, "scanAlpha", { label: "扫描亮度", min: 0, max: 2, step: 0.05 }).on("change", ev => {
  radar.setScanAlpha(ev.value);
});

pane.addBinding(PARAMS, "domeBaseAlpha", { label: "半球透明度", min: 0, max: 1, step: 0.05 }).on("change", ev => {
  radar.setDomeBaseAlpha(ev.value);
});

pane.addBinding(PARAMS, "groundBaseAlpha", { label: "底盘透明度", min: 0, max: 1, step: 0.05 }).on("change", ev => {
  radar.setGroundBaseAlpha(ev.value);
});

// ---------- 站点管理：增删会触发几何重建 ----------
const actions = pane.addFolder({ title: "站点管理" });

actions.addBinding(PARAMS, "clickToAdd", { label: "点击添加" });

// 在现有站点附近随机偏移约 ±0.02°（量级约数公里）新增一座
actions.addButton({ title: "添加附近站点" }).on("click", () => {
  const base = radar.getPositions()[0] ?? INITIAL_POSITIONS[0];
  radar.addPosition({
    longitude: base.longitude + (Math.random() - 0.5) * 0.04,
    latitude: base.latitude + (Math.random() - 0.5) * 0.04,
    height: 0
  });
});

actions.addButton({ title: "重置站点" }).on("click", () => {
  radar.setPositions(INITIAL_POSITIONS);
});

// clear 会移除全部站点并销毁内部 Primitive；可再 setPositions / addPosition 重建
actions.addButton({ title: "清空全部" }).on("click", () => {
  radar.clear();
});

// 左键点击地球表面，在拾取位置新增一座雷达站（可在面板关闭「点击添加」）
// 优先 globe.pick，避免点中半透明半球罩而落到错误高度
const clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
clickHandler.setInputAction(click => {
  if (!PARAMS.clickToAdd) return;

  const ray = viewer.camera.getPickRay(click.position);
  const cartesian =
    (ray && viewer.scene.globe.pick(ray, viewer.scene)) ||
    viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);
  if (!Cesium.defined(cartesian)) return;

  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  radar.addPosition({
    longitude: Cesium.Math.toDegrees(cartographic.longitude),
    latitude: Cesium.Math.toDegrees(cartographic.latitude),
    height: Math.max(cartographic.height, 0)
  });
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);
