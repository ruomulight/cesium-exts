import { parse } from "yaml";

import type { GalleryItem, SandcastleYamlConfig } from "@/types/sandcastle";

import cesiumPlaceholderThumb from "../../gallery/cesium/placeholder-thumbnail.jpg";
import openLayersPlaceholderThumb from "../../gallery/openlayers/placeholder-thumbnail.jpg";

const yamlModules = import.meta.glob("/gallery/**/sandcastle.yaml", { eager: true, query: "?raw", import: "default" });
const codeModules = import.meta.glob("/gallery/**/main.js", { eager: true, query: "?raw", import: "default" });
const htmlModules = import.meta.glob("/gallery/**/index.html", { eager: true, query: "?raw", import: "default" });
const thumbModules = import.meta.glob("/gallery/**/thumbnail.jpg", { eager: true, import: "default" });
const exampleAssetModules = import.meta.glob("/gallery/**/*.{png,jpg,jpeg,gif,webp,svg}", {
  eager: true,
  import: "default"
});

/**
 * 把示例源码里的 `./文件名` 换成 Vite 处理后的资源地址。
 *
 * 示例脚本在 bucket iframe 中执行，相对路径会落到 `/templates/`，到不了示例目录。
 * 缩略图 `thumbnail.jpg` 只给画廊卡片用，不参与替换。
 *
 * @param dir 示例目录，以 `/` 结尾，例如 `/gallery/cesium/glow-wall/`
 * @param code 示例 `main.js` 原文
 * @returns 资源路径已替换的代码
 */
function inlineExampleAssets(dir: string, code: string): string {
  let resolved = code;
  for (const [assetPath, assetUrl] of Object.entries(exampleAssetModules)) {
    if (!assetPath.startsWith(dir) || assetPath.endsWith("/thumbnail.jpg") || typeof assetUrl !== "string") continue;
    const filename = assetPath.slice(dir.length);
    resolved = resolved.replaceAll(`./${filename}`, assetUrl);
  }
  return resolved;
}

/**
 * 扫描 gallery 目录下的 Sandcastle 示例，解析 sandcastle.yaml 并组装示例列表。
 * 仅收集 code 与 html 均存在的完整示例；顺序保持 glob 的字典序（按目录名）。
 */
export function getGalleryItems(): GalleryItem[] {
  return Object.entries(yamlModules)
    .map(([yamlPath, text]) => {
      const dir = yamlPath.slice(0, yamlPath.length - "sandcastle.yaml".length);
      const segments = yamlPath.split("/");
      const name = segments[segments.length - 2];
      const category = segments[2];
      if (category !== "cesium" && category !== "openlayers") return null;
      const code = codeModules[`${dir}main.js`];
      const html = htmlModules[`${dir}index.html`];
      const thumbnailUrl =
        thumbModules[`${dir}thumbnail.jpg`] ??
        (category === "openlayers" ? openLayersPlaceholderThumb : cesiumPlaceholderThumb);

      const config = parse(text) as Partial<SandcastleYamlConfig>;
      if (!code || !html || typeof config.title !== "string" || typeof config.description !== "string") {
        console.warn(`[gallery] 跳过不完整的示例: ${name}`);
        return null;
      }

      return {
        // 保留既有 Cesium 链接；其他画廊加前缀以避免目录名冲突。
        name: category === "openlayers" ? `openlayers/${name}` : name,
        category,
        title: config.title,
        description: config.description,
        labels: config.labels ?? [],
        code: inlineExampleAssets(dir, code),
        html,
        thumbnailUrl
      };
    })
    .filter((item): item is GalleryItem => item !== null);
}
