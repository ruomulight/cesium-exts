import * as Cesium from "cesium";
import { createWebGpuTerrainHeightMap } from "cesium-exts";
import { Pane } from "tweakpane";

const TERRAIN_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";
const RECTANGLE = Cesium.Rectangle.fromDegrees(101.82, 29.54, 101.94, 29.66);
const SIZE = 128;
const STEPS_PER_PREVIEW = 8;
const WORKGROUP_SIZE = 8;

const RUNOFF_WGSL = `
  @group(0) @binding(0) var terrain: texture_2d<f32>;
  @group(0) @binding(1) var<storage, read> currentDepth: array<f32>;
  @group(0) @binding(2) var<storage, read_write> nextDepth: array<f32>;
  @group(0) @binding(3) var<uniform> settings: vec4f;

  fn indexOf(cell: vec2i, size: vec2i) -> u32 {
    return u32(cell.y * size.x + cell.x);
  }

  fn outflow(drop: f32, donorDepth: f32, spacing: f32) -> f32 {
    return min(donorDepth * 0.24, min(drop * 0.2, 8.0 * drop / spacing));
  }

  @compute @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
  fn step(@builtin(global_invocation_id) invocation: vec3u) {
    let size = vec2i(textureDimensions(terrain));
    let cell = vec2i(invocation.xy);
    if (any(cell >= size)) { return; }

    let index = indexOf(cell, size);
    let bed = textureLoad(terrain, cell, 0);
    if (bed.a < 0.5) {
      nextDepth[index] = 0.0;
      return;
    }

    let depth = currentDepth[index];
    let directions = array<vec2i, 4>(vec2i(1, 0), vec2i(-1, 0), vec2i(0, 1), vec2i(0, -1));
    var net = 0.0;
    for (var direction = 0u; direction < 4u; direction++) {
      let neighbor = cell + directions[direction];
      if (any(neighbor < vec2i(0)) || any(neighbor >= size)) { continue; }
      let neighborBed = textureLoad(terrain, neighbor, 0);
      if (neighborBed.a < 0.5) { continue; }

      let neighborDepth = currentDepth[indexOf(neighbor, size)];
      let drop = (bed.r - neighborBed.r) + (depth - neighborDepth);
      let spacing = select(settings.y, settings.x, direction < 2u);
      if (drop > 0.0) {
        net -= outflow(drop, depth, spacing);
      } else {
        net += outflow(-drop, neighborDepth, spacing);
      }
    }

    let rainOffset = (vec2f(cell) + 0.5) / vec2f(size) - vec2f(0.53, 0.46);
    let rain = settings.z * exp(-22.0 * dot(rainOffset, rainOffset));
    nextDepth[index] = max(0.0, depth + net + rain);
  }
`;

const viewer = new Cesium.Viewer("cesiumContainer", {
  animation: false,
  // timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  baseLayer: Cesium.ImageryLayer.fromProviderAsync(
    Cesium.TileMapServiceImageryProvider.fromUrl(Cesium.buildModuleUrl("Assets/Textures/NaturalEarthII"))
  )
});
viewer.camera.setView({ destination: Cesium.Rectangle.fromDegrees(101.76, 29.5, 102.0, 29.7) });

const water = viewer.entities.add({
  show: false,
  rectangle: { coordinates: RECTANGLE, classificationType: Cesium.ClassificationType.TERRAIN }
});
const material = new Cesium.ImageMaterialProperty({ transparent: true });
water.rectangle.material = material;

const params = { rain: 0.08 };
const pane = new Pane({ title: "WebGPU 地形径流" });
pane.addBinding(params, "rain", { label: "降雨（米/步）", min: 0, max: 0.2, step: 0.01 });
const runButton = pane.addButton({ title: "开始模拟" });
const resetButton = pane.addButton({ title: "清空积水" });
const status = document.getElementById("runoffStatus");

let device;
let heightMap;
let simulation;
let running = false;
let processing = false;
let disposed = false;
let timer;
let steps = 0;
let maxDepth = 0;

runButton.on("click", () => {
  running = !running;
  refresh();
  if (running && !processing) void advance();
  if (!running) clearTimeout(timer);
});
resetButton.on("click", () => {
  simulation.reset();
  steps = 0;
  maxDepth = 0;
  water.show = false;
  refresh();
});
window.addEventListener("pagehide", event => {
  if (event.persisted) return;
  disposed = true;
  releaseResources();
});

refresh("正在初始化 WebGPU…");
void initialize();

async function initialize() {
  try {
    const adapter = await navigator.gpu?.requestAdapter();
    if (disposed) return;
    if (!adapter) throw new Error("WebGPU 不可用，请用支持 WebGPU 的浏览器通过 HTTPS 或 localhost 打开。");
    device = await adapter.requestDevice();
    if (disposed) {
      device.destroy();
      return;
    }
    refresh("正在加载贡嘎山地形并生成高度图…");
    const provider = await Cesium.ArcGISTiledElevationTerrainProvider.fromUrl(TERRAIN_URL);
    if (disposed) return;
    viewer.terrainProvider = provider;
    heightMap = await createWebGpuTerrainHeightMap(device, provider, {
      rectangle: RECTANGLE,
      width: SIZE,
      height: SIZE,
      maxTiles: 16
    });
    if (disposed) {
      heightMap.destroy();
      return;
    }
    simulation = await createSimulation(device, heightMap);
    if (!disposed) refresh();
  } catch (error) {
    if (disposed) return;
    releaseResources();
    refresh(`初始化失败：${error.message ?? error}`);
  }
}

async function advance() {
  processing = true;
  try {
    const depths = await simulation.advance(params.rain);
    if (disposed) return;
    steps += STEPS_PER_PREVIEW;
    maxDepth = updateWaterPreview(depths);
  } catch (error) {
    if (disposed) return;
    releaseResources();
    refresh(`模拟失败：${error.message ?? error}`);
    return;
  } finally {
    processing = false;
  }
  if (disposed) return;
  refresh();
  if (running) timer = setTimeout(advance, 120);
}

function refresh(message) {
  runButton.disabled = !simulation;
  runButton.title = running ? "暂停模拟" : "开始模拟";
  resetButton.disabled = !simulation || running || processing;
  if (message) {
    status.textContent = message;
    return;
  }
  const missing = heightMap.missingTiles.length;
  status.textContent =
    `${steps} 步 · 最大水深 ${maxDepth.toFixed(2)} 米 · 地形 L${heightMap.level}` +
    (missing ? ` · ${missing} 块瓦片缺失` : "");
}

function releaseResources() {
  clearTimeout(timer);
  running = false;
  simulation = undefined;
  heightMap?.destroy();
  device?.destroy();
}

function getCellSpacing(rectangle, width, height) {
  const center = Cesium.Rectangle.center(rectangle);
  const east = Cesium.Cartographic.fromRadians(center.longitude + rectangle.width / width, center.latitude);
  const north = Cesium.Cartographic.fromRadians(center.longitude, center.latitude + rectangle.height / height);
  return [
    new Cesium.EllipsoidGeodesic(center, east).surfaceDistance,
    new Cesium.EllipsoidGeodesic(center, north).surfaceDistance
  ];
}

/**
 * 高度图留在 GPU 上，只读回用于 Cesium 预览的水深。
 * 教学模型：四邻域按水面坡降交换水量，使用中心处的米制格距近似；边界和无数据格均不透水。
 */
async function createSimulation(gpu, map) {
  const { texture, rectangle, width, height } = map;
  const layout = gpu.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: "unfilterable-float" } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "read-only-storage" } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } }
    ]
  });
  const pipeline = await gpu.createComputePipelineAsync({
    layout: gpu.createPipelineLayout({ bindGroupLayouts: [layout] }),
    compute: { module: gpu.createShaderModule({ code: RUNOFF_WGSL }), entryPoint: "step" }
  });
  const size = width * height * Float32Array.BYTES_PER_ELEMENT;
  const depths = Array.from({ length: 2 }, () =>
    gpu.createBuffer({
      size,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
    })
  );
  const readback = gpu.createBuffer({ size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
  const uniforms = gpu.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  const terrainView = texture.createView();
  const bindings = depths.map((buffer, index) =>
    gpu.createBindGroup({
      layout,
      entries: [
        { binding: 0, resource: terrainView },
        { binding: 1, resource: { buffer } },
        { binding: 2, resource: { buffer: depths[1 - index] } },
        { binding: 3, resource: { buffer: uniforms } }
      ]
    })
  );
  const settings = new Float32Array([...getCellSpacing(rectangle, width, height), 0, 0]);
  let current = 0;

  return {
    reset() {
      const encoder = gpu.createCommandEncoder();
      for (const buffer of depths) encoder.clearBuffer(buffer);
      gpu.queue.submit([encoder.finish()]);
      current = 0;
    },
    async advance(rain) {
      settings[2] = rain;
      gpu.queue.writeBuffer(uniforms, 0, settings);
      const encoder = gpu.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      for (let step = 0; step < STEPS_PER_PREVIEW; step++) {
        pass.setBindGroup(0, bindings[current]);
        pass.dispatchWorkgroups(Math.ceil(width / WORKGROUP_SIZE), Math.ceil(height / WORKGROUP_SIZE));
        current = 1 - current;
      }
      pass.end();
      encoder.copyBufferToBuffer(depths[current], 0, readback, 0, size);
      gpu.queue.submit([encoder.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      try {
        return new Float32Array(readback.getMappedRange()).slice();
      } finally {
        readback.unmap();
      }
    }
  };
}

/** GPU 行 0 对应南边；Cesium 的图像顶部对应北边。 */
function updateWaterPreview(depths) {
  const { width, height } = heightMap;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const image = context.createImageData(width, height);
  let maximum = 0;
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const depth = depths[(height - 1 - row) * width + column];
      maximum = Math.max(maximum, depth);
      const offset = (row * width + column) * 4;
      image.data[offset] = 18;
      image.data[offset + 1] = 154;
      image.data[offset + 2] = 255;
      image.data[offset + 3] = 225 * Math.min(1, depth / 1.5);
    }
  }
  context.putImageData(image, 0, 0);
  material.image = canvas;
  water.show = true;
  viewer.scene.requestRender();
  return maximum;
}
