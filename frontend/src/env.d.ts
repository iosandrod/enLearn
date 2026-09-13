/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LOWCODE_SCRIPT_RUNTIME?: 'browser' | 'quickjs';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface ImportMeta {
  readonly server: boolean;
  readonly client: boolean;
  readonly dev: boolean;
}

interface Window {
  $$refs: Record<string, unknown>;
}

declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}
