/// <reference types="vite/client" />

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
