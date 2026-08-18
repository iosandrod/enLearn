declare module '@hippy/web-renderer' {
  export const NodeProps: {
    ON_CLICK: 'onClick';
  };

  export class HippyWebView {
    constructor(context: unknown, id: number, pId: number);

    protected dom: HTMLElement;
    protected id: number;

    dispatchEvent(eventName: string, params: unknown): void;
    beforeRemove(): Promise<void>;
    destroy(): void;
  }

  export class View extends HippyWebView {
    get onClick(): unknown;
    set onClick(value: unknown);
  }

  export const HippyWebEngine: {
    create(options: Record<string, unknown>): {
      start(options: Record<string, unknown>): void;
    };
  };
}
