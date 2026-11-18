import type { ResolvedTerrainTiles } from "./types";

import { HEIGHTMAP_WGSL } from "./shaders";

// 当前 TypeScript DOM 声明包含 WebGPU 对象类型，但缺少这些全局常量。
declare const GPUBufferUsage: {
  readonly COPY_DST: GPUBufferUsageFlags;
  readonly INDEX: GPUBufferUsageFlags;
  readonly MAP_READ: GPUBufferUsageFlags;
  readonly UNIFORM: GPUBufferUsageFlags;
  readonly VERTEX: GPUBufferUsageFlags;
};
declare const GPUTextureUsage: {
  readonly COPY_SRC: GPUTextureUsageFlags;
  readonly RENDER_ATTACHMENT: GPUTextureUsageFlags;
  readonly TEXTURE_BINDING: GPUTextureUsageFlags;
};
declare const GPUMapMode: { readonly READ: GPUMapModeFlags };

/** 每台设备共享一次管线编译，同一设备上的并发请求复用同一个 Promise。 */
const pipelines = new WeakMap<GPUDevice, Promise<GPURenderPipeline>>();

/**
 * 获取设备对应的渲染管线。编译失败后移除缓存，以便后续调用重试。
 *
 * @param device 拥有该管线的设备
 * @returns 与 Mesh 顶点布局及浮点附件格式匹配的管线
 */
function getPipeline(device: GPUDevice): Promise<GPURenderPipeline> {
  const cached = pipelines.get(device);
  if (cached) return cached;

  const shader = device.createShaderModule({ code: HEIGHTMAP_WGSL, label: "Terrain height map" });
  const pipeline = device.createRenderPipelineAsync({
    layout: "auto",
    vertex: {
      module: shader,
      entryPoint: "vertexMain",
      buffers: [{ arrayStride: 12, attributes: [{ format: "float32x3", offset: 0, shaderLocation: 0 }] }]
    },
    fragment: { module: shader, entryPoint: "fragmentMain", targets: [{ format: "rgba32float" }] },
    primitive: { topology: "triangle-list" },
    depthStencil: { format: "depth32float", depthWriteEnabled: true, depthCompare: "less" }
  });
  pipelines.set(device, pipeline);
  void pipeline.catch(() => pipelines.delete(device));
  return pipeline;
}

/**
 * 在单次离屏渲染通道中绘制瓦片。颜色附件清为透明黑色，写入的高程用 A 通道标记覆盖。
 * 共用的深度附件用于选取重叠区域的较高地形，提交后与临时上传缓冲一并释放。
 *
 * @param device 创建纹理并提交绘制的设备
 * @param resolved 瓦片网格以及深度比较使用的全局高程范围
 * @param width 输出纹理宽度（像素）
 * @param height 输出纹理高度（像素）
 * @returns 由调用方持有的 `rgba32float` 纹理，可用于采样或复制读回
 * @throws 着色器管线创建、GPU 资源分配或命令校验失败时拒绝
 */
export async function rasterizeWebGpuTerrainHeightMap(
  device: GPUDevice,
  resolved: ResolvedTerrainTiles,
  width: number,
  height: number
): Promise<GPUTexture> {
  const pipeline = await getPipeline(device);
  const buffers: GPUBuffer[] = [];
  let texture: GPUTexture | undefined;
  let depth: GPUTexture | undefined;

  device.pushErrorScope("out-of-memory");
  device.pushErrorScope("validation");
  try {
    let gpuError: GPUError | null;
    try {
      const size = { width, height };
      texture = device.createTexture({
        size,
        format: "rgba32float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC
      });
      depth = device.createTexture({
        size,
        format: "depth32float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT
      });
      const range = uploadBuffer(
        device,
        new Float32Array([resolved.minHeight, resolved.maxHeight]),
        GPUBufferUsage.UNIFORM
      );
      buffers.push(range);

      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{ view: texture.createView(), loadOp: "clear", clearValue: [0, 0, 0, 0], storeOp: "store" }],
        depthStencilAttachment: {
          view: depth.createView(),
          depthLoadOp: "clear",
          depthClearValue: 1,
          depthStoreOp: "discard"
        }
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(
        0,
        device.createBindGroup({
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: range } }]
        })
      );

      for (const mesh of resolved.meshes) {
        const vertices = uploadBuffer(device, mesh.positions, GPUBufferUsage.VERTEX);
        buffers.push(vertices);
        const indices = uploadBuffer(device, mesh.indices, GPUBufferUsage.INDEX);
        buffers.push(indices);
        pass.setVertexBuffer(0, vertices);
        pass.setIndexBuffer(indices, mesh.indices instanceof Uint32Array ? "uint32" : "uint16");
        pass.drawIndexed(mesh.indices.length);
      }

      pass.end();
      device.queue.submit([encoder.finish()]);
    } finally {
      // 两个作用域都在让出事件循环之前弹出，允许共享设备上的并发调用。
      const [validation, memory] = await Promise.all([device.popErrorScope(), device.popErrorScope()]);
      gpuError = validation ?? memory;
    }
    if (gpuError) throw new Error(`[createWebGpuTerrainHeightMap] ${gpuError.message}`);
    return texture;
  } catch (error) {
    texture?.destroy();
    throw error;
  } finally {
    depth?.destroy();
    for (const buffer of buffers) buffer.destroy();
  }
}

/**
 * 创建并填充一次性 GPU 缓冲。映射时按 4 字节对齐，支持奇数个 16 位索引及带偏移的数组视图。
 *
 * @param device 拥有该缓冲的设备
 * @param data 要上传的顶点、索引或 uniform 数据
 * @param usage 缓冲在渲染通道中的用途
 * @returns 已取消映射且可用于绘制的缓冲
 */
function uploadBuffer(
  device: GPUDevice,
  data: Float32Array | Uint16Array | Uint32Array,
  usage: GPUBufferUsageFlags
): GPUBuffer {
  const buffer = device.createBuffer({
    size: Math.ceil(data.byteLength / 4) * 4,
    usage,
    mappedAtCreation: true
  });
  try {
    new Uint8Array(buffer.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    buffer.unmap();
    return buffer;
  } catch (error) {
    buffer.destroy();
    throw error;
  }
}

/**
 * 将浮点纹理复制到可映射的临时缓冲。映射完成后跳过行对齐填充，
 * 根据 A 通道提取有效高程，最后销毁临时缓冲。
 *
 * @param device 创建纹理的设备
 * @param texture 可作为复制源的高度纹理
 * @returns 长度为 `width * height` 的高程数组，行 0 对应南边，未覆盖像素为 `NaN`
 * @throws 读回缓冲尺寸超出设备限制或映射失败时拒绝
 */
export async function readWebGpuHeightTexels(device: GPUDevice, texture: GPUTexture): Promise<Float32Array> {
  const { width, height } = texture;
  // rgba32float 每像素占 16 字节。每行起点按 256 字节对齐，末行只分配实际像素所需空间。
  const bytesPerRow = Math.ceil((width * 16) / 256) * 256;
  const size = (height - 1) * bytesPerRow + width * 16;
  if (size > device.limits.maxBufferSize) {
    throw new Error("[createWebGpuTerrainHeightMap] Readback exceeds the device buffer size limit.");
  }

  const buffer = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  try {
    const encoder = device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture }, { buffer, bytesPerRow }, { width, height });
    device.queue.submit([encoder.finish()]);
    await buffer.mapAsync(GPUMapMode.READ);

    const pixels = new Float32Array(buffer.getMappedRange());
    const heights = new Float32Array(width * height);
    const floatsPerRow = bytesPerRow / Float32Array.BYTES_PER_ELEMENT;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const offset = y * floatsPerRow + x * 4;
        heights[y * width + x] = (pixels[offset + 3] ?? 0) >= 0.5 ? (pixels[offset] ?? NaN) : NaN;
      }
    }
    return heights;
  } finally {
    buffer.destroy();
  }
}
