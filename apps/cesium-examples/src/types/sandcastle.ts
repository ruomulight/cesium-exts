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

/**
 * Gallery示例项的完整数据结构
 */
export interface GalleryItem {
  /** 目录名，作为唯一标识 */
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
