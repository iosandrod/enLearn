import {
  reactive,
  shallowReactive,
  type Component,
  type Ref,
  type VNodeChild,
} from 'vue';
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormSchema,
  LowCodeGridSchema,
  LowCodePageBlock,
  LowCodePageGridBlock,
  LowCodePageSearchFormBlock,
  LowCodeRuntimeEvent,
} from '../types/lowcode';

export type GlobalDialogMaybeRef<T> = T | Ref<T>;
export type GlobalDialogActionRole = 'confirm' | 'cancel' | 'close' | 'custom';
export type GlobalDialogButtonStatus = 'primary' | 'success' | 'warning' | 'danger' | 'info';

export type GlobalDialogResult<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  action: string;
  values: TValues;
  payload?: unknown;
};

export type GlobalDialogContext<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  model: TValues;
  config: GlobalDialogConfig<TValues>;
  close: (result?: Partial<GlobalDialogResult<TValues>>) => Promise<void>;
  updateModel: (value: Partial<TValues> | Record<string, unknown>) => void;
  setModel: (value: Partial<TValues> | Record<string, unknown>) => void;
};

export type GlobalDialogRender<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = (context: GlobalDialogContext<TValues>) => VNodeChild;

export type GlobalDialogActionClickResult<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> =
  | void
  | false
  | Partial<GlobalDialogResult<TValues>>
  | {
      close?: boolean;
      action?: string;
      values?: TValues;
      payload?: unknown;
    };

export type GlobalDialogActionConfig<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  code: string;
  label: GlobalDialogMaybeRef<string>;
  role?: GlobalDialogActionRole;
  status?: GlobalDialogButtonStatus;
  icon?: string;
  disabled?: GlobalDialogMaybeRef<boolean>;
  loading?: GlobalDialogMaybeRef<boolean>;
  props?: Record<string, unknown>;
  closeOnClick?: boolean;
  onClick?: (
    context: GlobalDialogContext<TValues>,
    action: GlobalDialogActionConfig<TValues>,
  ) => Promise<GlobalDialogActionClickResult<TValues>> | GlobalDialogActionClickResult<TValues>;
};

export type GlobalDialogFormConfig<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  schema: GlobalDialogMaybeRef<LowCodeFormSchema>;
  model?: GlobalDialogMaybeRef<Record<string, unknown>>;
  optionSources?: GlobalDialogMaybeRef<Record<string, unknown>>;
  loading?: GlobalDialogMaybeRef<boolean>;
  props?: Record<string, unknown>;
  onUpdateModel?: (
    values: Record<string, unknown>,
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onSubmit?: (
    values: Record<string, unknown>,
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onAction?: (
    action: LowCodeAction,
    values: Record<string, unknown>,
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onFieldChange?: (
    payload: {
      field: LowCodeField;
      value: unknown;
      previousValue: unknown;
      values: TValues;
    },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
};

export type GlobalDialogGridConfig = {
  schema?: GlobalDialogMaybeRef<LowCodeGridSchema>;
  rows?: GlobalDialogMaybeRef<Record<string, unknown>[]>;
  columns?: GlobalDialogMaybeRef<Record<string, unknown>[]>;
  loading?: GlobalDialogMaybeRef<boolean>;
  props?: Record<string, unknown>;
  events?: Record<string, (...args: unknown[]) => void>;
};

export type GlobalDialogLowCodeBlocksConfig<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  blocks: GlobalDialogMaybeRef<LowCodePageBlock[]>;
  resolvedData?: GlobalDialogMaybeRef<Record<string, unknown>>;
  formModels?: GlobalDialogMaybeRef<Record<string, Record<string, unknown>>>;
  searchFilters?: GlobalDialogMaybeRef<Record<string, Record<string, unknown>>>;
  loadingBlockId?: GlobalDialogMaybeRef<string>;
  loadingGridId?: GlobalDialogMaybeRef<string>;
  props?: Record<string, unknown>;
  onFormSubmit?: (
    payload: { block: LowCodePageBlock; values: Record<string, unknown> },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onFormAction?: (
    payload: {
      block: LowCodePageBlock;
      action: LowCodeAction;
      values: Record<string, unknown>;
    },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onGridEdit?: (
    payload: { block: LowCodePageGridBlock; row: Record<string, unknown> },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onGridDelete?: (
    payload: { block: LowCodePageGridBlock; row: Record<string, unknown> },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onToolbarAction?: (
    payload: { block: LowCodePageBlock; action: LowCodeAction },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onSearchSubmit?: (
    payload: { block: LowCodePageSearchFormBlock; values: Record<string, unknown> },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onSearchAction?: (
    payload: {
      block: LowCodePageSearchFormBlock;
      action: LowCodeAction;
      values: Record<string, unknown>;
    },
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onRuntimeEvent?: (
    event: LowCodeRuntimeEvent,
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
};

export type GlobalDialogTabsPane<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  key?: string;
  name: string | number;
  label: GlobalDialogMaybeRef<string>;
  className?: unknown;
  style?: unknown;
  props?: Record<string, unknown>;
  children?: GlobalDialogContentNode<TValues>[];
};

export type GlobalDialogContentNode<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> =
  | {
      type?: 'container';
      key?: string;
      tag?: string | Component;
      className?: unknown;
      style?: unknown;
      props?: Record<string, unknown>;
      children?: GlobalDialogContentNode<TValues>[];
    }
  | {
      type: 'toolbar';
      key?: string;
      className?: unknown;
      style?: unknown;
      actions: GlobalDialogActionConfig<TValues>[];
    }
  | {
      type: 'tabs';
      key?: string;
      className?: unknown;
      style?: unknown;
      activeName?: GlobalDialogMaybeRef<string | number>;
      props?: Record<string, unknown>;
      panes: GlobalDialogTabsPane<TValues>[];
      onChange?: (
        name: string | number,
        context: GlobalDialogContext<TValues>,
      ) => Promise<void> | void;
    }
  | {
      type: 'form';
      key?: string;
      className?: unknown;
      style?: unknown;
      form: GlobalDialogFormConfig<TValues>;
    }
  | {
      type: 'grid';
      key?: string;
      className?: unknown;
      style?: unknown;
      grid: GlobalDialogGridConfig;
    }
  | {
      type: 'lowcodeBlocks';
      key?: string;
      className?: unknown;
      style?: unknown;
      lowcode: GlobalDialogLowCodeBlocksConfig<TValues>;
    }
  | {
      type: 'render';
      key?: string;
      render: GlobalDialogRender<TValues>;
    };

export type GlobalDialogConfig<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  id?: string;
  title?: GlobalDialogMaybeRef<string>;
  width?: GlobalDialogMaybeRef<string | number>;
  height?: GlobalDialogMaybeRef<string | number>;
  className?: unknown;
  props?: Record<string, unknown>;
  showFooter?: boolean;
  model?: TValues;
  form?: GlobalDialogFormConfig<TValues>;
  grid?: GlobalDialogGridConfig;
  content?: GlobalDialogContentNode<TValues> | GlobalDialogContentNode<TValues>[];
  body?: GlobalDialogRender<TValues>;
  footer?: GlobalDialogRender<TValues>;
  actions?: GlobalDialogActionConfig<TValues>[];
  onConfirm?: (
    context: GlobalDialogContext<TValues>,
  ) => Promise<GlobalDialogActionClickResult<TValues>> | GlobalDialogActionClickResult<TValues>;
  onCancel?: (context: GlobalDialogContext<TValues>) => Promise<void> | void;
  onClose?: (
    result: GlobalDialogResult<TValues>,
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
  onAction?: (
    action: GlobalDialogActionConfig<TValues>,
    context: GlobalDialogContext<TValues>,
  ) => Promise<void> | void;
};

export type GlobalDialogInstance<
  TValues extends Record<string, unknown> = Record<string, unknown>,
> = {
  id: string;
  visible: boolean;
  config: GlobalDialogConfig<TValues>;
  model: TValues;
  busyAction: string;
  createdAt: number;
  resolve: (result: GlobalDialogResult<TValues>) => void;
};

export const globalDialogInstances = shallowReactive<GlobalDialogInstance[]>([]);
export const globalDialogHostStack = shallowReactive<string[]>([]);

let globalDialogSeed = 0;
let globalDialogHostSeed = 0;

function createDialogId(id?: string) {
  if (id && !globalDialogInstances.some((dialog) => dialog.id === id)) {
    return id;
  }

  globalDialogSeed += 1;
  return `lc-global-dialog-${Date.now().toString(36)}-${globalDialogSeed}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (!isRecord(value) && !Array.isArray(value)) return value;

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function createInitialModel<TValues extends Record<string, unknown>>(
  config: GlobalDialogConfig<TValues>,
) {
  const model = config.model ?? config.form?.model ?? ({} as TValues);
  return reactive(cloneValue(model)) as TValues;
}

function assignModel(
  target: Record<string, unknown>,
  value: Record<string, unknown>,
  replace = false,
) {
  if (replace) {
    Object.keys(target).forEach((key) => delete target[key]);
  }

  Object.assign(target, value);
}

export function findGlobalDialog(id: string) {
  return globalDialogInstances.find((dialog) => dialog.id === id);
}

export function createGlobalDialogContext<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(instance: GlobalDialogInstance<TValues>): GlobalDialogContext<TValues> {
  return {
    id: instance.id,
    model: instance.model,
    config: instance.config,
    close: (result) => closeGlobalDialog(instance.id, result),
    updateModel: (value) => assignModel(instance.model, value),
    setModel: (value) => assignModel(instance.model, value, true),
  };
}

export function openGlobalDialog<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(config: GlobalDialogConfig<TValues>) {
  const id = createDialogId(config.id);

  return new Promise<GlobalDialogResult<TValues>>((resolve) => {
    const instance = reactive({
      id,
      visible: true,
      config: {
        ...config,
        id,
      },
      model: createInitialModel(config),
      busyAction: '',
      createdAt: Date.now(),
      resolve,
    }) as GlobalDialogInstance<TValues>;

    globalDialogInstances.push(instance as GlobalDialogInstance);
  });
}

export function updateGlobalDialog<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(id: string, patch: Partial<GlobalDialogConfig<TValues>>) {
  const instance = findGlobalDialog(id) as GlobalDialogInstance<TValues> | undefined;
  if (!instance) return false;

  instance.config = {
    ...instance.config,
    ...patch,
    id,
  };
  return true;
}

export async function closeGlobalDialog<
  TValues extends Record<string, unknown> = Record<string, unknown>,
>(id: string, result: Partial<GlobalDialogResult<TValues>> = {}) {
  const index = globalDialogInstances.findIndex((dialog) => dialog.id === id);
  if (index < 0) return;

  const [instance] = globalDialogInstances.splice(index, 1) as GlobalDialogInstance<TValues>[];
  instance.visible = false;

  const finalResult: GlobalDialogResult<TValues> = {
    id,
    action: result.action ?? 'close',
    values: (result.values ?? cloneValue(instance.model)) as TValues,
    payload: result.payload,
  };
  const context = createGlobalDialogContext(instance);

  if (finalResult.action === 'cancel') {
    await instance.config.onCancel?.(context);
  }

  await instance.config.onClose?.(finalResult, context);
  instance.resolve(finalResult);
}

export function closeAllGlobalDialogs(action = 'close') {
  return Promise.all(
    [...globalDialogInstances].map((dialog) =>
      closeGlobalDialog(dialog.id, {
        action,
      }),
    ),
  );
}

export function registerGlobalDialogHost() {
  globalDialogHostSeed += 1;
  const hostId = `lc-global-dialog-host-${globalDialogHostSeed}`;
  globalDialogHostStack.push(hostId);

  return {
    hostId,
    unregister() {
      const index = globalDialogHostStack.indexOf(hostId);
      if (index >= 0) {
        globalDialogHostStack.splice(index, 1);
      }
    },
  };
}

export function isActiveGlobalDialogHost(hostId: string) {
  return globalDialogHostStack[globalDialogHostStack.length - 1] === hostId;
}
