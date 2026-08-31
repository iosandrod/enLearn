import {
  markRaw,
  reactive,
  shallowReactive,
  type VNodeChild,
} from 'vue';

export type GlobalDrawerAction = 'close' | 'mask' | 'escape' | string;

export type GlobalDrawerResult = {
  id: string;
  action: GlobalDrawerAction;
};

export type GlobalDrawerContext = {
  id: string;
  close: (action?: GlobalDrawerAction) => Promise<void>;
};

export type GlobalDrawerConfig = {
  id?: string;
  title?: string;
  width?: string | number;
  height?: string | number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  props?: Record<string, unknown>;
  body: (context: GlobalDrawerContext) => VNodeChild;
  onClose?: (
    result: GlobalDrawerResult,
    context: GlobalDrawerContext,
  ) => Promise<void> | void;
};

export type GlobalDrawerInstance = {
  id: string;
  visible: boolean;
  config: GlobalDrawerConfig;
  resolve: (result: GlobalDrawerResult) => void;
};

export type GlobalDrawerHandle = {
  id: string;
  closed: Promise<GlobalDrawerResult>;
  close: (action?: GlobalDrawerAction) => Promise<void>;
};

export const globalDrawerInstances = shallowReactive<GlobalDrawerInstance[]>([]);
export const globalDrawerHostStack = shallowReactive<string[]>([]);

let globalDrawerSeed = 0;
let globalDrawerHostSeed = 0;

function createDrawerId(id?: string) {
  if (id && !globalDrawerInstances.some((drawer) => drawer.id === id)) return id;
  globalDrawerSeed += 1;
  return `lc-global-drawer-${Date.now().toString(36)}-${globalDrawerSeed}`;
}

export function findGlobalDrawer(id: string) {
  return globalDrawerInstances.find((drawer) => drawer.id === id);
}

export function createGlobalDrawerContext(
  instance: GlobalDrawerInstance,
): GlobalDrawerContext {
  return {
    id: instance.id,
    close: (action) => closeGlobalDrawer(instance.id, action),
  };
}

export function openGlobalDrawer(config: GlobalDrawerConfig): GlobalDrawerHandle {
  const id = createDrawerId(config.id);
  let resolveClosed!: (result: GlobalDrawerResult) => void;
  const closed = new Promise<GlobalDrawerResult>((resolve) => {
    resolveClosed = resolve;
  });
  const instance = reactive({
    id,
    visible: true,
    config: markRaw({ ...config, id }),
    resolve: resolveClosed,
  }) as GlobalDrawerInstance;

  globalDrawerInstances.push(instance);

  return {
    id,
    closed,
    close: (action) => closeGlobalDrawer(id, action),
  };
}

export async function closeGlobalDrawer(
  id: string,
  action: GlobalDrawerAction = 'close',
) {
  const index = globalDrawerInstances.findIndex((drawer) => drawer.id === id);
  if (index < 0) return;

  const [instance] = globalDrawerInstances.splice(index, 1);
  instance.visible = false;
  const result = { id, action } satisfies GlobalDrawerResult;
  const context = createGlobalDrawerContext(instance);
  try {
    await instance.config.onClose?.(result, context);
  } finally {
    instance.resolve(result);
  }
}

export function closeAllGlobalDrawers(action: GlobalDrawerAction = 'close') {
  return Promise.all(
    [...globalDrawerInstances].map((drawer) =>
      closeGlobalDrawer(drawer.id, action),
    ),
  );
}

export function registerGlobalDrawerHost() {
  globalDrawerHostSeed += 1;
  const hostId = `lc-global-drawer-host-${globalDrawerHostSeed}`;
  globalDrawerHostStack.push(hostId);

  return {
    hostId,
    unregister() {
      const index = globalDrawerHostStack.indexOf(hostId);
      if (index >= 0) globalDrawerHostStack.splice(index, 1);
    },
  };
}

export function isActiveGlobalDrawerHost(hostId: string) {
  return globalDrawerHostStack[globalDrawerHostStack.length - 1] === hostId;
}
