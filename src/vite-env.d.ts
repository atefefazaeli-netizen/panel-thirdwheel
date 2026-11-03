/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the API including /api/v1. Empty = `/api/v1` on this origin (dev proxy). */
  readonly VITE_API_URL?: string;
  /** Dev server proxy target for /api. */
  readonly VITE_API_PROXY_TARGET?: string;
  /** "1" forces the in-browser mock API on, "0" forces it off. */
  readonly VITE_API_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
