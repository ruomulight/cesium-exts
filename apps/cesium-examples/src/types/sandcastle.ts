/**
 * Sandcastle 相关的类型定义
 */

/**
 * Sandcastle示例的YAML配置结构
 */
export interface SandcastleYamlConfig {
  /** 旧版ID（用于兼容） */
  legacyId?: string;
  /** 示例标题 */
  title: string;
  /** 示例描述 */
  description: string;
  /** 分类标签 */
  labels?: string[];
  /** 缩略图文件名 */
  thumbnail?: string;
}

/** 与 gallery 下的分类目录对应。 */
export type GalleryCategory = "cesium" | "openlayers";

/** Gallery 示例项的完整数据结构。 */
export interface GalleryItem {
  /** 示例所属画廊，与 gallery 下的目录对应 */
  category: GalleryCategory;
  /** URL 示例标识；OpenLayers 示例带分类前缀 */
  name: string;
  /** 示例标题 */
  title: string;
  /** 示例描述 */
  description: string;
  /** 分类标签 */
  labels: string[];
  /** JavaScript代码内容 */
  code: string;
  /** HTML内容 */
  html: string;
  /** 缩略图URL */
  thumbnailUrl: string;
}
