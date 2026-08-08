declare module '*.jpg';
declare module '*.png';
declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare global {
  const __PLATFORM__: 'android' | 'ios' | 'web' | null;

  interface Window {
    __localStorage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
      length?: number;
      key?: (index: number) => string | null;
    };
  }

  interface HippyGlobal {
    on(event: string, handler: (...args: any[]) => void): void;
  }

  var Hippy: HippyGlobal;
}

export {};
