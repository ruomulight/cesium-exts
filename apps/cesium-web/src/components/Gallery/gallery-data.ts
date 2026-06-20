/**
 * 简易 YAML 解析器，专门用于解析 sandcastle.yaml 格式。
 * 仅支持单层键值对和一级数组，满足当前 sandcastle.yaml 的结构需求。
 */
function parseSimpleYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = text.split("\n");
  let currentKey = "";
  let currentArray: string[] = [];
  let inArray = false;

  for (let line of lines) {
    // 去除行内注释（# 及之后的内容），但跳过引号内的 #
    const commentIndex = line.indexOf("#");
    if (commentIndex >= 0) {
      const beforeComment = line.substring(0, commentIndex);
      // 简单启发式：如果 # 前面有奇数个引号，说明 # 在引号内
      const doubleQuoteCount = (beforeComment.match(/"/g) || []).length;
      const singleQuoteCount = (beforeComment.match(/'/g) || []).length;
      if (doubleQuoteCount % 2 === 0 && singleQuoteCount % 2 === 0) {
        line = beforeComment;
      }
    }

    line = line.trim();
    if (!line) continue; // 跳过空行和纯注释行

    if (/^\s+-\s/.test(line)) {
      // 数组项，如 "  - Imagery"
      currentArray.push(line.replace(/^\s+-\s/, "").trim());
      inArray = true;
    } else if (line.includes(":")) {
      // 保存之前的数组（如果有）
      if (inArray && currentKey) {
        result[currentKey] = currentArray;
        currentArray = [];
        inArray = false;
      }

      const colonIndex = line.indexOf(":");
      currentKey = line.slice(0, colonIndex).trim();
      let value = line.slice(colonIndex + 1).trim();

      // 剥离首尾引号（单引号或双引号）
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      if (value) {
        result[currentKey] = value;
      }
    }
  }

  // 处理末尾的数组
  if (inArray && currentKey) {
    result[currentKey] = currentArray;
  }

  return result;
}

/** Gallery 示例项的类型定义 */
export type GalleryItem = {
  /** 目录名，作为唯一标识，如 "web-map-service-wms" */
  name: string;
  /** 示例标题，来自 sandcastle.yaml */
  title: string;
  /** 示例描述，来自 sandcastle.yaml */
  description: string;
  /** 分类标签，来自 sandcastle.yaml */
  labels: string[];
  /** JavaScript 代码内容，来自 main.js */
  code: string;
  /** HTML 内容，来自 index.html */
  html: string;
  /** 缩略图 URL */
  thumbnailUrl: string;
};

/**
 * 从 gallery HTML 内容中移除对 bucket.css 的 @import 引用。
 * 官方 Cesium Sandcastle 的 bucket.css 在我们的项目中不存在，
 * bucket.html 已内联了必要的样式。
 */
function stripBucketCssImport(html: string): string {
  return html.replace(/@import\s+url\([^)]*bucket\.css\)\s*;?\s*\n?/g, "");
}

// 使用 import.meta.glob 批量导入 gallery 目录下的所有资源
// eager: false 延迟加载，避免首屏加载所有示例的代码和 HTML 内容
// ?raw 后缀以原始文本形式导入，?url 后缀以 URL 形式导入
const yamlModules = import.meta.glob<{ default: string }>("../../../gallery/*/sandcastle.yaml", {
  query: "?raw",
  eager: false
});

const codeModules = import.meta.glob<{ default: string }>("../../../gallery/*/main.js", {
  query: "?raw",
  eager: false
});

const htmlModules = import.meta.glob<{ default: string }>("../../../gallery/*/index.html", {
  query: "?raw",
  eager: false
});

const thumbnailModules = import.meta.glob<{ default: string }>("../../../gallery/*/thumbnail.jpg", {
  query: "?url",
  eager: false
});

/**
 * 从 import.meta.glob 返回的模块路径中提取目录名。
 * 例如: "../../../gallery/web-map-service-wms/main.js" → "web-map-service-wms"
 */
function extractName(path: string): string {
  const segments = path.split("/");
  // 倒数第二个段即为目录名
  return segments[segments.length - 2];
}

/** 已加载的 gallery 示例项缓存 */
let _galleryItems: GalleryItem[] | null = null;
/** 已提取的分类标签缓存 */
let _allLabels: string[] | null = null;

/**
 * 异步加载所有 Gallery 示例项。
 * 首次调用时动态导入所有 sandcastle.yaml，并匹配对应的代码/HTML/缩略图模块。
 * 结果会缓存，后续调用直接返回缓存值。
 */
export async function loadGalleryItems(): Promise<GalleryItem[]> {
  if (_galleryItems) return _galleryItems;

  const items: GalleryItem[] = [];
  const yamlPaths = Object.keys(yamlModules);

  for (const path of yamlPaths) {
    const name = extractName(path);
    const yamlMod = await yamlModules[path]();
    const yamlText = yamlMod.default ?? "";
    const metadata = parseSimpleYaml(yamlText);

    // 匹配对应的代码和 HTML 模块
    const codeKey = Object.keys(codeModules).find(k => extractName(k) === name);
    const htmlKey = Object.keys(htmlModules).find(k => extractName(k) === name);
    const thumbKey = Object.keys(thumbnailModules).find(k => extractName(k) === name);

    let code = "";
    let html = "";
    let thumbnailUrl = "";

    if (codeKey) {
      const codeMod = await codeModules[codeKey]();
      code = codeMod.default ?? "";
    }
    if (htmlKey) {
      const htmlMod = await htmlModules[htmlKey]();
      html = stripBucketCssImport(htmlMod.default ?? "");
    }
    if (thumbKey) {
      const thumbMod = await thumbnailModules[thumbKey]();
      thumbnailUrl = thumbMod.default ?? "";
    }

    items.push({
      name,
      title: (metadata.title as string) ?? name,
      description: (metadata.description as string) ?? "",
      labels: Array.isArray(metadata.labels) ? (metadata.labels as string[]) : [],
      code,
      html,
      thumbnailUrl
    });
  }

  _galleryItems = items.sort((a, b) => a.title.localeCompare(b.title));
  _allLabels = [...new Set(_galleryItems.flatMap(item => item.labels))].sort();
  return _galleryItems;
}

/**
 * 异步获取所有分类标签（去重排序）。
 * 首次调用时会自动加载 gallery 数据。
 */
export async function loadAllLabels(): Promise<string[]> {
  if (!_allLabels) {
    await loadGalleryItems();
  }
  return _allLabels!;
}

/**
 * 按目录名异步加载单个 Gallery 示例项。
 * 用于通过 URL 的 `?id=<name>` 参数直接加载指定示例。
 *
 * @param name - 示例目录名，如 "web-map-service-wms"
 * @returns 匹配的 GalleryItem，若未找到则返回 null
 */
export async function loadGalleryItemByName(name: string): Promise<GalleryItem | null> {
  const items = await loadGalleryItems();
  return items.find(item => item.name === name) ?? null;
}
