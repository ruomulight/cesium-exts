import packageJson from "../package.json";

declare global {
  /**
   * 平台的名称、版本、运行所需的`node`版本、依赖、构建时间的类型提示
   */
  declare const __APP_INFO__: typeof packageJson;
}

export {};
