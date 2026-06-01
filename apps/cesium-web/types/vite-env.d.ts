// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface ViteTypeOptions {}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
