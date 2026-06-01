interface ImportMetaEnv {
  // 通用配置
  readonly VITE_APP_TITLE: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_NODE_MODE: string;
  readonly VITE_BASE_URL: string;

  // 开发环境配置
  readonly VITE_HOST: string;

  // 生产环境配置
  readonly VITE_API_PROXY_PORT: string;
  readonly VITE_API_PROXY_TARGET: string;
  readonly VITE_API_PROXY_PREFIX: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
