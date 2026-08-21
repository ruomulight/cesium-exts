import { parse } from "yaml";

import type { GalleryItem, SandcastleYamlConfig } from "@/types/sandcastle";

import placeholderThumb from "../../gallery/cesium/placeholder-thumbnail.jpg";

const yamlModules = import.meta.glob("/gallery/**/sandcastle.yaml", { eager: true, query: "?raw", import: "default" });
const codeModules = import.meta.glob("/gallery/**/main.js", { eager: true, query: "?raw", import: "default" });
const htmlModules = import.meta.glob("/gallery/**/index.html", { eager: true, query: "?raw", import: "default" });
const thumbModules = import.meta.glob("/gallery/**/thumbnail.jpg", { eager: true, import: "default" });

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
      const code = codeModules[`${dir}main.js`];
      const html = htmlModules[`${dir}index.html`];
      const thumbnailUrl = thumbModules[`${dir}thumbnail.jpg`] ?? placeholderThumb;

      const config = parse(text) as Partial<SandcastleYamlConfig>;
      if (!code || !html || typeof config.title !== "string" || typeof config.description !== "string") {
        console.warn(`[gallery] 跳过不完整的示例: ${name}`);
        return null;
      }

      return {
        name,
        title: config.title,
        description: config.description,
        labels: config.labels ?? [],
        code,
        html,
        thumbnailUrl
      };
    })
    .filter((item): item is GalleryItem => item !== null);
}
