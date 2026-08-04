declare module '@hippy/web-renderer' {
  export const HippyWebEngine: {
    create(options: Record<string, unknown>): {
      start(options: Record<string, unknown>): void;
    };
  };
}
