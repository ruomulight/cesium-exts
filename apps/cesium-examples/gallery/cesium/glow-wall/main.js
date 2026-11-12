/**
 * GlowWallPrimitive 示例
 *
 * 青色闭合围栏可在面板里改速度、高度和光带；旁边的红色折线是更快的警戒线。
 */
import * as Cesium from "cesium";
import { flyToTarget, GlowWallPrimitive } from "cesium-exts";
import { Pane } from "tweakpane";

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
  selectionIndicator: false,
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"))
  )
});

// 天安门附近的一块矩形围栏，单位：度
const LON = 116.391;
const LAT = 39.907;
const FENCE = [
  { longitude: LON, latitude: LAT },
  { longitude: LON + 0.012, latitude: LAT },
  { longitude: LON + 0.012, latitude: LAT + 0.008 },
  { longitude: LON, latitude: LAT + 0.008 }
];

// 不闭合的警戒折线，用更高的速度和红色区分
const WARNING = [
  { longitude: LON + 0.016, latitude: LAT },
  { longitude: LON + 0.022, latitude: LAT + 0.002 },
  { longitude: LON + 0.02, latitude: LAT + 0.007 },
  { longitude: LON + 0.015, latitude: LAT + 0.005 },
  { longitude: LON + 0.016, latitude: LAT }
];

const PARAMS = {
  show: true,
  speed: 2,
  maximumHeight: 200,
  color: { r: 0, g: 255, b: 255 },
  alpha: 0.9,
  glowPower: 6,
  baseAlpha: 0.1,
  emission: 0.2
};

function toColor() {
  return Cesium.Color.fromBytes(
    Math.round(PARAMS.color.r),
    Math.round(PARAMS.color.g),
    Math.round(PARAMS.color.b),
    Math.round(PARAMS.alpha * 255)
  );
}

const fence = new GlowWallPrimitive(viewer, {
  positions: FENCE,
  closed: true,
  maximumHeight: PARAMS.maximumHeight,
  color: toColor(),
  speed: PARAMS.speed,
  glowPower: PARAMS.glowPower,
  baseAlpha: PARAMS.baseAlpha,
  emission: PARAMS.emission
});

// 警戒线不闭合，光带更快、更细
new GlowWallPrimitive(viewer, {
  positions: WARNING,
  closed: false,
  maximumHeight: 160,
  color: Cesium.Color.RED.withAlpha(0.85),
  speed: 6,
  glowPower: 10,
  baseAlpha: 0.08
});

flyToTarget(viewer, {
  targetPosition: Cesium.Cartesian3.fromDegrees(LON + 0.008, LAT + 0.004, 0),
  heading: 30,
  pitch: -35,
  range: 2800,
  duration: 1.5
});

const pane = new Pane({ title: "电子围栏" });

pane.addBinding(PARAMS, "show", { label: "显示" }).on("change", ev => {
  fence.show = ev.value;
});

pane.addBinding(PARAMS, "speed", { label: "流动速度", min: -8, max: 12, step: 0.1 }).on("change", ev => {
  fence.setSpeed(ev.value);
});

pane.addBinding(PARAMS, "maximumHeight", { label: "墙高（米）", min: 40, max: 800, step: 10 }).on("change", ev => {
  fence.setMaximumHeight(ev.value);
});

pane.addBinding(PARAMS, "color", { label: "颜色" }).on("change", () => {
  fence.setColor(toColor());
});

pane.addBinding(PARAMS, "alpha", { label: "颜色透明度", min: 0, max: 1, step: 0.05 }).on("change", () => {
  fence.setColor(toColor());
});

pane.addBinding(PARAMS, "glowPower", { label: "光带锐度", min: 1, max: 16, step: 0.5 }).on("change", ev => {
  fence.setGlowPower(ev.value);
});

pane.addBinding(PARAMS, "baseAlpha", { label: "底色透明度", min: 0, max: 1, step: 0.05 }).on("change", ev => {
  fence.setBaseAlpha(ev.value);
});

pane.addBinding(PARAMS, "emission", { label: "自发光", min: 0, max: 2, step: 0.05 }).on("change", ev => {
  fence.setEmission(ev.value);
});
