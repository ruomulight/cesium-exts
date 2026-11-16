/**
 * 地形高度图示例。
 *
 * 框选横断山一段，大于单块瓦片。地形用 ArcGIS World Elevation，
 * 它自带 availability，不需要 Cesium ion token。
 * 预览把高度画成亮度：越高越亮，没覆盖到的像素保持黑色。
 */
import * as Cesium from "cesium";
import { createTerrainHeightMap, flyToTarget } from "cesium-exts";
import { Pane } from "tweakpane";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

// 贡嘎山附近，约 1.8° × 1.4°，会跨多块地形瓦片。
// 高度图瓦片是 257×257，瓦片数限制小一点，避免一次解码太多顶点。
const RECTANGLE = Cesium.Rectangle.fromDegrees(100.6, 28.8, 102.4, 30.2);
const MAX_TILES = 16;

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
  level: "-",
  tileCount: "-",
  missing: "-",
  elapsed: "-"
};

const preview = viewer.entities.add({
  rectangle: {
    coordinates: RECTANGLE,
    material: Cesium.Color.WHITE.withAlpha(0.2),
    classificationType: Cesium.ClassificationType.TERRAIN
  }
});

const center = Cesium.Rectangle.center(RECTANGLE);
flyToTarget(viewer, {
  targetPosition: Cesium.Cartesian3.fromRadians(center.longitude, center.latitude, 0),
  heading: 0,
  pitch: -45,
  range: 180000,
  duration: 1.5
});

const pane = new Pane({ title: "地形高度图" });
pane.addBinding(PARAMS, "level", { label: "级别", readonly: true });
pane.addBinding(PARAMS, "tileCount", { label: "瓦片数", readonly: true });
pane.addBinding(PARAMS, "missing", { label: "缺失瓦片", readonly: true });
pane.addBinding(PARAMS, "elapsed", { label: "耗时", readonly: true });

let heightMap = null;
let generating = false;
let terrainProviderPromise = null;

pane.addButton({ title: "生成高度图" }).on("click", () => {
  void generate();
});

setupTerrain();

function setupTerrain() {
  showNotice("正在加载 ArcGIS World Elevation…");
  terrainProviderPromise = Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL)
    .then(provider => {
      viewer.terrainProvider = provider;
      if (!provider.availability) {
        showNotice("这份地形没有 availability，无法生成高度图。");
        return provider;
      }
      showNotice("");
      return provider;
    })
    .catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      showNotice(`地形加载失败：${message}`);
      throw error;
    });
}

async function generate() {
  if (generating) return;

  generating = true;
  const started = performance.now();
  showNotice("正在根据地形瓦片生成高度图…");
  try {
    const provider = await terrainProviderPromise;
    if (!provider?.availability) {
      showNotice("这份地形没有 availability，无法生成高度图。");
      return;
    }

    const next = await createTerrainHeightMap(viewer, {
      rectangle: RECTANGLE,
      maxTiles: MAX_TILES,
      width: 512,
      height: 512
    });
    heightMap?.destroy();
    heightMap = next;
    const heights = heightMap.readHeights();
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
    showNotice(message);
  } finally {
    generating = false;
  }
}

/**
 * 把 readHeights 的南边在前的行序翻成图片顶部为北，贴到矩形上才和地形对齐。
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
