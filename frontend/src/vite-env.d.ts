/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Optional API origin, e.g. "https://api.example.com". Leave empty (the default)
   * to call the API with relative URLs on the same origin.
   */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
