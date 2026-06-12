/**
 * Sandcastle相关的类型声明
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

/**
 * Sandcastle下拉菜单选项
 */
export interface SandcastleSelectOption {
  /** 选项显示文本 */
  text: string;
  /** 选项值 */
  value: string;
  /** 选中该选项时的回调 */
  onselect: () => void;
}

/**
 * Sandcastle辅助工具API
 */
export interface SandcastleAPI {
  /** 重置Sandcastle状态 */
  reset(): void;
  /** 声明代码书签 */
  declare(key: unknown): void;
  /** 高亮指定的代码书签 */
  highlight(key: unknown): void;
  /** 标记Sandcastle加载完成 */
  finishedLoading(): void;
  /** 添加切换按钮 */
  addToggleButton(text: string, checked: boolean, onchange: (newValue: boolean) => void, toolbarId?: string): void;
  /** 添加普通按钮 */
  addToolbarButton(text: string, onclick: () => void, toolbarId?: string): void;
  /** 添加默认按钮 */
  addDefaultToolbarButton(text: string, onclick: () => void, toolbarId?: string): void;
  /** 添加下拉菜单 */
  addToolbarMenu(options: SandcastleSelectOption[], toolbarId?: string): void;
  /** 添加默认下拉菜单 */
  addDefaultToolbarMenu(options: SandcastleSelectOption[], toolbarId?: string): void;
}
