/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL_BACKEND: string
  readonly VITE_PS_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
