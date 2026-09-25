/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override only when the API is not served from the same origin. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
