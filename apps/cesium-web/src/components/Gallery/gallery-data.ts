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

  for (const line of lines) {
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
      const value = line.slice(colonIndex + 1).trim();

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
// ?raw 后缀以原始文本形式导入，?url 后缀以 URL 形式导入
const yamlModules = import.meta.glob<{ default: string }>("../../../gallery/*/sandcastle.yaml", {
  query: "?raw",
  eager: true
});

const codeModules = import.meta.glob<{ default: string }>("../../../gallery/*/main.js", {
  query: "?raw",
  eager: true
});

const htmlModules = import.meta.glob<{ default: string }>("../../../gallery/*/index.html", {
  query: "?raw",
  eager: true
});

const thumbnailModules = import.meta.glob<{ default: string }>("../../../gallery/*/thumbnail.jpg", {
  query: "?url",
  eager: true
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

/** 所有已加载的 gallery 示例项，按目录名字母排序 */
export const galleryItems: GalleryItem[] = (() => {
  const items: GalleryItem[] = [];

  // 以 yamlModules 的键为基础遍历所有示例目录
  for (const path of Object.keys(yamlModules)) {
    const name = extractName(path);
    const yamlText = yamlModules[path]?.default ?? "";
    const metadata = parseSimpleYaml(yamlText);

    // 匹配对应的代码和 HTML 模块
    const codeKey = Object.keys(codeModules).find(k => extractName(k) === name);
    const htmlKey = Object.keys(htmlModules).find(k => extractName(k) === name);
    const thumbKey = Object.keys(thumbnailModules).find(k => extractName(k) === name);

    items.push({
      name,
      title: (metadata.title as string) ?? name,
      description: (metadata.description as string) ?? "",
      labels: Array.isArray(metadata.labels) ? (metadata.labels as string[]) : [],
      code: codeKey ? (codeModules[codeKey]?.default ?? "") : "",
      html: htmlKey ? stripBucketCssImport(htmlModules[htmlKey]?.default ?? "") : "",
      thumbnailUrl: thumbKey ? (thumbnailModules[thumbKey]?.default ?? "") : ""
    });
  }

  return items.sort((a, b) => a.title.localeCompare(b.title));
})();

/** 所有示例的分类标签集合（去重排序） */
export const allLabels: string[] = [...new Set(galleryItems.flatMap(item => item.labels))].sort();
