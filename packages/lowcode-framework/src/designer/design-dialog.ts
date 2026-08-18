import { h, markRaw, ref, type Component } from 'vue';
import type {
  LowCodeHostRouter,
  LowCodeHostServiceApi,
  LowCodeMessages,
  LowCodeTheme,
} from '../core/host';
import LowCodeVisualDesigner from '../components/LowCodeVisualDesigner.vue';
import {
  findGlobalDialog,
  openGlobalDialog,
  type GlobalDialogConfig,
  type GlobalDialogResult,
} from '../runtime/global-dialog';

export type DesignDialogController = {
  save(): Promise<unknown>;
  publish(): Promise<unknown>;
  reload(): Promise<void>;
};

export type DesignDialogComponentProps = {
  code: string;
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  embedded?: boolean;
};

export type DesignDialogConfig = Omit<
  GlobalDialogConfig,
  'body' | 'content' | 'form' | 'grid' | 'footer' | 'actions' | 'onConfirm'
> & {
  code: string;
  component?: Component;
  componentProps?: Record<string, unknown>;
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: (controller: DesignDialogController) => Promise<unknown> | unknown;
};

const DEFAULT_DIALOG_ID = 'lowcode-visual-design-dialog';

function mergeClassName(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    return `lowcode-design-dialog ${value.trim()}`;
  }
  return 'lowcode-design-dialog';
}

export function openDesignDialog(
  config: DesignDialogConfig,
): Promise<GlobalDialogResult> {
  const id = config.id ?? DEFAULT_DIALOG_ID;
  const activeDialog = findGlobalDialog(id);
  if (activeDialog) {
    return Promise.resolve({
      id: activeDialog.id,
      action: 'active',
      values: activeDialog.model,
    });
  }

  const designerRef = ref<DesignDialogController | null>(null);
  const DesignerComponent = markRaw(config.component ?? LowCodeVisualDesigner);
  const {
    code,
    component: _component,
    componentProps,
    serviceApi,
    router,
    locale,
    messages,
    theme,
    confirmLabel = '确定',
    cancelLabel = '取消',
    onConfirm,
    className,
    props,
    ...dialogConfig
  } = config;

  return openGlobalDialog({
    ...dialogConfig,
    id,
    title: config.title ?? '可视化设计',
    width: config.width ?? 'min(1540px, calc(100vw - 32px))',
    height: config.height ?? 'min(900px, calc(100vh - 32px))',
    className: mergeClassName(className),
    props: {
      top: '1vh',
      destroyOnClose: true,
      showZoom: true,
      resize: true,
      ...(props ?? {}),
    },
    showFooter: true,
    body: () => h(DesignerComponent, {
      ref: designerRef,
      code,
      serviceApi,
      router,
      locale,
      messages,
      theme,
      embedded: true,
      ...(componentProps ?? {}),
    }),
    actions: [
      {
        code: 'cancel',
        label: cancelLabel,
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: confirmLabel,
        role: 'confirm',
        status: 'primary',
      },
    ],
    onConfirm: async () => {
      const controller = designerRef.value;
      if (!controller) return false;
      const payload = onConfirm
        ? await onConfirm(controller)
        : await controller.save();
      if (payload === false) return false;
      return { payload };
    },
  });
}
