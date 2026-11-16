/**
 * GlowWallPrimitive 示例
 *
 * 闭合围栏默认滚动箭头贴图。面板里可以开关贴图、改流动方向和重复次数。
 * 关掉贴图后，同一面墙回到程序化光带，锐度和底色才生效。
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

// 贴图与本示例放在同一目录。画廊加载时会把 ./arrow.png 换成可访问的地址。
const ARROW = new URL("./arrow.png", window.location.origin).href;

// 围栏周长约 3.8 公里、墙高 200 米。贴图宽高比约 1.86，
// 沿墙长重复 10 次时，箭头在墙面上接近原图比例。
const PARAMS = {
  show: true,
  useImage: true,
  flowAxis: "horizontal",
  repeatX: 10,
  repeatY: 1,
  speed: 2,
  maximumHeight: 200,
  color: { r: 255, g: 255, b: 255 },
  alpha: 0.95,
  emission: 0.6,
  glowPower: 6,
  baseAlpha: 0.1
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
  emission: PARAMS.emission,
  glowPower: PARAMS.glowPower,
  baseAlpha: PARAMS.baseAlpha,
  image: ARROW,
  imageRepeat: { x: PARAMS.repeatX, y: PARAMS.repeatY },
  flowAxis: PARAMS.flowAxis
});

flyToTarget(viewer, {
  targetPosition: Cesium.Cartesian3.fromDegrees(LON + 0.006, LAT + 0.004, 0),
  heading: 30,
  pitch: -35,
  range: 2800,
  duration: 1.5
});

const pane = new Pane({ title: "发光墙" });

pane.addBinding(PARAMS, "show", { label: "显示" }).on("change", event => {
  fence.show = event.value;
});

pane.addBinding(PARAMS, "speed", { label: "流动速度", min: -8, max: 12, step: 0.1 }).on("change", event => {
  fence.setSpeed(event.value);
});

pane.addBinding(PARAMS, "maximumHeight", { label: "墙高（米）", min: 40, max: 800, step: 10 }).on("change", event => {
  fence.setMaximumHeight(event.value);
});

pane.addBinding(PARAMS, "color", { label: "颜色" }).on("change", () => {
  fence.setColor(toColor());
});

pane.addBinding(PARAMS, "alpha", { label: "透明度", min: 0, max: 1, step: 0.05 }).on("change", () => {
  fence.setColor(toColor());
});

pane.addBinding(PARAMS, "emission", { label: "自发光", min: 0, max: 2, step: 0.05 }).on("change", event => {
  fence.setEmission(event.value);
});

const imageFolder = pane.addFolder({ title: "箭头贴图", expanded: true });

imageFolder.addBinding(PARAMS, "useImage", { label: "启用贴图" }).on("change", event => {
  fence.setImage(event.value ? ARROW : undefined);
  syncMode();
});

const flowAxisBinding = imageFolder
  .addBinding(PARAMS, "flowAxis", {
    label: "流动方向",
    options: {
      沿墙长: "horizontal",
      沿墙高: "vertical"
    }
  })
  .on("change", event => {
    fence.setFlowAxis(event.value);
  });

const repeatXBinding = imageFolder
  .addBinding(PARAMS, "repeatX", { label: "沿墙长重复", min: 1, max: 24, step: 1 })
  .on("change", event => {
    fence.setImageRepeat({ x: event.value });
  });

const repeatYBinding = imageFolder
  .addBinding(PARAMS, "repeatY", { label: "沿墙高重复", min: 1, max: 8, step: 1 })
  .on("change", event => {
    fence.setImageRepeat({ y: event.value });
  });

const glowFolder = pane.addFolder({ title: "程序化光带", expanded: false });

const glowPowerBinding = glowFolder
  .addBinding(PARAMS, "glowPower", { label: "光带锐度", min: 1, max: 16, step: 0.5 })
  .on("change", event => {
    fence.setGlowPower(event.value);
  });

const baseAlphaBinding = glowFolder
  .addBinding(PARAMS, "baseAlpha", { label: "底色透明度", min: 0, max: 1, step: 0.05 })
  .on("change", event => {
    fence.setBaseAlpha(event.value);
  });

/** 贴图开启时锁住光带参数；关掉贴图时锁住方向和重复次数。 */
function syncMode() {
  const imageOn = PARAMS.useImage;
  flowAxisBinding.disabled = !imageOn;
  repeatXBinding.disabled = !imageOn;
  repeatYBinding.disabled = !imageOn;
  glowPowerBinding.disabled = imageOn;
  baseAlphaBinding.disabled = imageOn;
}

syncMode();
