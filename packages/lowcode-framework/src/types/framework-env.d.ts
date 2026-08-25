import type { RouteLocationNormalizedLoaded, Router } from 'vue-router';

type LowCodeHostServiceApi = {
  invoke<T = unknown>(
    serviceName: string,
    serviceMethod: string,
    payload?: Record<string, unknown>,
    options?: { requestId?: string }
  ): Promise<T>;
};

declare global {
  const useRoute: () => RouteLocationNormalizedLoaded;
  const useRouter: () => Router;
  const useServiceApi: () => LowCodeHostServiceApi;
}

declare module '*.module.scss' {
  const classes: Record<string, string>;
  export default classes;
}

declare module '*.scss' {
  const content: string;
  export default content;
}

declare module '*?worker' {
  const WorkerFactory: {
    new (options?: WorkerOptions): Worker;
  };
  export default WorkerFactory;
}

declare module '*?worker&inline' {
  const WorkerFactory: {
    new (options?: WorkerOptions): Worker;
  };
  export default WorkerFactory;
}

export {};
