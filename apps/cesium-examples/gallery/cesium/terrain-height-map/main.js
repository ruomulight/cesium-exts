/**
 * 地形高度图示例。
 *
 * 默认展示横断山一段，也可以拖拽框选其他地形范围。
 * WebGL 和 WebGPU 均使用 ArcGIS World Elevation 地形，不需要 Cesium ion token。
 * 预览把高度画成亮度：越高越亮，没覆盖到的像素保持黑色。
 */
import * as Cesium from "cesium";
import { createTerrainHeightMap, createWebGpuTerrainHeightMap, flyToTarget } from "cesium-exts";
import { Pane } from "tweakpane";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

// 贡嘎山附近，约 1.8° × 1.4°，会跨多块地形瓦片。
// 高度图瓦片是 257×257，瓦片数限制小一点，避免一次解码太多顶点。
const DEFAULT_RECTANGLE = Cesium.Rectangle.fromDegrees(100.6, 28.8, 102.4, 30.2);
const MAX_TILES = 16;
const SELECTION_COLOR = Cesium.Color.CYAN;
const SELECTION_FILL = SELECTION_COLOR.withAlpha(0.2);

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

// 帧率节点在首帧渲染时才插入，默认在右上角，会挡到参数面板。
viewer.scene.debugShowFramesPerSecond = true;
const placeFramesPerSecond = () => {
  const fpsContainer = viewer.cesiumWidget.container.querySelector(".cesium-performanceDisplay-defaultContainer");
  if (!fpsContainer) return;
  fpsContainer.style.top = "12px";
  fpsContainer.style.right = "auto";
  fpsContainer.style.left = "12px";
  fpsContainer.style.textAlign = "left";
  viewer.scene.postRender.removeEventListener(placeFramesPerSecond);
};
viewer.scene.postRender.addEventListener(placeFramesPerSecond);

const notice = document.getElementById("terrainNotice");

function showNotice(message) {
  if (!notice) return;
  notice.textContent = message;
  notice.style.display = message ? "block" : "none";
}

const PARAMS = {
  backend: "WebGL",
  level: "-",
  tileCount: "-",
  missing: "-",
  elapsed: "-"
};

function createOverlay(show) {
  return viewer.entities.add({
    show,
    rectangle: {
      material: SELECTION_FILL,
      classificationType: Cesium.ClassificationType.TERRAIN
    },
    polyline: {
      arcType: Cesium.ArcType.RHUMB,
      width: 2,
      material: SELECTION_COLOR,
      clampToGround: true,
      classificationType: Cesium.ClassificationType.TERRAIN
    }
  });
}

function getRectangleOutline(rectangle) {
  const { west, south, east, north } = rectangle;
  return Cesium.Cartesian3.fromRadiansArray([west, south, east, south, east, north, west, north, west, south]);
}

let selectedRectangle = DEFAULT_RECTANGLE;
let draftRectangle;
let draftOutline;
const preview = createOverlay(true);
preview.rectangle.coordinates = selectedRectangle;
preview.polyline.positions = getRectangleOutline(selectedRectangle);
const selection = createOverlay(false);
selection.rectangle.coordinates = new Cesium.CallbackProperty(() => draftRectangle, false);
selection.polyline.positions = new Cesium.CallbackProperty(() => draftOutline, false);

const center = Cesium.Rectangle.center(selectedRectangle);
flyToTarget(viewer, {
  targetPosition: Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, 0),
  heading: 0,
  pitch: -45,
  range: 180000,
  duration: 1.5
});

const pane = new Pane({ title: "地形高度图" });
const backendBinding = pane.addBinding(PARAMS, "backend", {
  label: "后端",
  options: { WebGL: "WebGL", WebGPU: "WebGPU" }
});
const selectionButton = pane.addButton({ title: "框选范围" });
const generateButton = pane.addButton({ title: "生成高度图" });
pane.addBinding(PARAMS, "level", { label: "级别", readonly: true });
pane.addBinding(PARAMS, "tileCount", { label: "瓦片数", readonly: true });
pane.addBinding(PARAMS, "missing", { label: "缺失瓦片", readonly: true });
pane.addBinding(PARAMS, "elapsed", { label: "耗时", readonly: true });

const canvas = viewer.scene.canvas;
const cameraController = viewer.scene.screenSpaceCameraController;
let selecting = false;
let cameraInputsEnabled;
let drag;
let generating = false;
let terrainProvider;

backendBinding.on("change", () => {
  resetPreview();
  showNotice(`已切换至 ${PARAMS.backend}，点击“生成高度图”查看结果。`);
});
selectionButton.on("click", () => {
  if (selecting) {
    finishSelection();
    return;
  }

  viewer.camera.cancelFlight();
  cameraInputsEnabled = cameraController.enableInputs;
  cameraController.enableInputs = false;
  selecting = true;
  canvas.classList.add("selecting-terrain");
  refreshControls();
  showNotice("在地图上按住左键拖拽框选，松开确认；按 Esc 取消。");
});
generateButton.on("click", () => {
  void generate();
});

canvas.addEventListener("pointerdown", event => {
  if (!selecting || drag || event.button !== 0) return;
  const position = getCanvasPosition(event);
  const point = pickGround(position);
  if (!point) return;

  drag = { pointerId: event.pointerId, position, point };
  canvas.setPointerCapture(event.pointerId);
  preview.show = false;
});
canvas.addEventListener("pointermove", event => {
  if (event.pointerId !== drag?.pointerId) return;
  draftRectangle = getDragRectangle(event);
  draftOutline = draftRectangle && getRectangleOutline(draftRectangle);
  selection.show = Boolean(draftRectangle);
});
canvas.addEventListener("pointerup", event => {
  if (event.pointerId !== drag?.pointerId || event.button !== 0) return;
  const rectangle = getDragRectangle(event);
  if (rectangle) {
    selectedRectangle = rectangle;
    preview.rectangle.coordinates = rectangle;
    preview.polyline.positions = getRectangleOutline(rectangle);
    resetPreview();
  }
  finishSelection(
    rectangle ? "范围已更新，点击“生成高度图”查看结果。" : "未选中有效范围，请在地球表面拖拽，且不要跨越日期变更线。"
  );
});
canvas.addEventListener("lostpointercapture", event => {
  if (event.pointerId === drag?.pointerId) finishSelection();
});
window.addEventListener("keydown", event => {
  if (event.key === "Escape" && selecting) finishSelection();
});

refreshControls();
void setupTerrain();

function getCanvasPosition(event) {
  const bounds = canvas.getBoundingClientRect();
  return new Cesium.Cartesian2(event.clientX - bounds.left, event.clientY - bounds.top);
}

function pickGround(position) {
  if (position.x < 0 || position.y < 0 || position.x >= canvas.clientWidth || position.y >= canvas.clientHeight) {
    return undefined;
  }
  const { scene, camera } = viewer;
  const { globe } = scene;
  const ray = camera.getPickRay(position);
  const point = (ray && globe.pick(ray, scene)) ?? camera.pickEllipsoid(position, globe.ellipsoid);
  return point && globe.ellipsoid.cartesianToCartographic(point);
}

function getDragRectangle(event) {
  const position = getCanvasPosition(event);
  if (Cesium.Cartesian2.distance(drag.position, position) < 4) return undefined;

  const end = pickGround(position);
  if (!end) return undefined;
  const rectangle = Cesium.Rectangle.fromCartographicArray([drag.point, end]);
  return rectangle.east > rectangle.west && rectangle.north > rectangle.south ? rectangle : undefined;
}

function finishSelection(message = "已取消框选。") {
  const pointerId = drag?.pointerId;
  drag = undefined;
  if (pointerId !== undefined && canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
  selection.show = false;
  draftRectangle = undefined;
  draftOutline = undefined;
  preview.show = true;
  selecting = false;
  cameraController.enableInputs = cameraInputsEnabled;
  canvas.classList.remove("selecting-terrain");
  refreshControls();
  showNotice(message);
}

function refreshControls() {
  backendBinding.disabled = generating || selecting;
  selectionButton.disabled = generating;
  selectionButton.title = selecting ? "取消框选" : "框选范围";
  generateButton.disabled = !terrainProvider?.availability || generating || selecting;
}

function resetPreview() {
  preview.rectangle.material = SELECTION_FILL;
  PARAMS.level = "-";
  PARAMS.tileCount = "-";
  PARAMS.missing = "-";
  PARAMS.elapsed = "-";
  pane.refresh();
}

async function setupTerrain() {
  showNotice("正在加载 ArcGIS World Elevation…");
  try {
    terrainProvider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL);
    viewer.terrainProvider = terrainProvider;
    if (!selecting) showNotice(terrainProvider.availability ? "" : "这份地形没有 availability，无法生成高度图。");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showNotice(`地形加载失败：${message}`);
  } finally {
    refreshControls();
  }
}

async function generate() {
  if (generating || selecting || !terrainProvider?.availability) return;

  const backend = PARAMS.backend;
  generating = true;
  refreshControls();
  const started = performance.now();
  showNotice(`正在使用 ${backend} 生成地形高度图…`);
  let device;
  let heightMap;
  try {
    const options = {
      rectangle: selectedRectangle,
      maxTiles: MAX_TILES,
      width: 512,
      height: 512
    };
    let heights;
    if (backend === "WebGPU") {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) {
        throw new Error(
          "当前环境没有可用的 WebGPU。请使用支持 WebGPU 的浏览器通过 HTTPS 或 localhost 打开，或切换到 WebGL。"
        );
      }
      device = await adapter.requestDevice();
      heightMap = await createWebGpuTerrainHeightMap(device, terrainProvider, options);
      heights = await heightMap.readHeightsAsync();
    } else {
      heightMap = await createTerrainHeightMap(viewer, options);
      heights = heightMap.readHeights();
    }

    preview.rectangle.material = new Cesium.ImageMaterialProperty({
      image: heightsToCanvas(heights, heightMap.width, heightMap.height, heightMap.minHeight, heightMap.maxHeight)
    });

    PARAMS.level = String(heightMap.level);
    PARAMS.tileCount = String(heightMap.tileCount);
    PARAMS.missing = String(heightMap.missingTiles.length);
    PARAMS.elapsed = `${Math.round(performance.now() - started)} ms`;
    pane.refresh();
    showNotice(
      heightMap.missingTiles.length > 0
        ? `有 ${heightMap.missingTiles.length} 块瓦片在重试后仍然失败，对应区域会保持黑色。`
        : ""
    );
    viewer.scene.requestRender();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    showNotice(`${backend} 生成失败：${message}`);
  } finally {
    heightMap?.destroy();
    device?.destroy();
    generating = false;
    refreshControls();
  }
}

/**
 * 两种后端读回的第 0 行都对应南边，翻转后才能和地图对齐。
 * NaN（没被地形覆盖）保持黑色。
 */
function heightsToCanvas(heights, width, height, minHeight, maxHeight) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context2d = canvas.getContext("2d");
  const image = context2d.createImageData(width, height);
  const range = maxHeight - minHeight || 1;

  for (let y = 0; y < height; y++) {
    const sourceY = height - 1 - y;
    for (let x = 0; x < width; x++) {
      const value = heights[sourceY * width + x];
      const offset = (y * width + x) * 4;
      const gray = Number.isNaN(value) ? 0 : Math.round(((value - minHeight) / range) * 255);
      image.data[offset] = gray;
      image.data[offset + 1] = gray;
      image.data[offset + 2] = gray;
      image.data[offset + 3] = 255;
    }
  }

  context2d.putImageData(image, 0, 0);
  return canvas;
}
