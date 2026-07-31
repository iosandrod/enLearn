import {
  Fragment,
  defineComponent,
  h,
  isRef,
  resolveComponent,
  unref,
  type VNodeChild,
} from 'vue';
import LowCodeForm from './LowCodeForm.vue';
import LowCodeGrid from './LowCodeGrid.vue';
import LowCodeBlockRenderer from './LowCodeBlockRenderer.vue';
import {
  closeGlobalDialog,
  createGlobalDialogContext,
  globalDialogInstances,
  type GlobalDialogActionClickResult,
  type GlobalDialogActionConfig,
  type GlobalDialogConfig,
  type GlobalDialogContentNode,
  type GlobalDialogFormConfig,
  type GlobalDialogGridConfig,
  type GlobalDialogInstance,
  type GlobalDialogLowCodeBlocksConfig,
  type GlobalDialogMaybeRef,
  type GlobalDialogResult,
} from '../runtime/global-dialog';
import type { LowCodePageBlock, LowCodeRuntimeEvent } from '../types/lowcode';
import '../styles/global-dialog.scss';

function readValue<T>(value: GlobalDialogMaybeRef<T> | undefined, fallback?: T) {
  const resolved = unref(value);
  return typeof resolved === 'undefined' ? fallback : resolved;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveProps(props: Record<string, unknown> = {}) {
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => [key, unref(value)]),
  );
}

function assignRecord(
  target: Record<string, unknown>,
  value: Record<string, unknown>,
  replace = false,
) {
  if (replace) {
    Object.keys(target).forEach((key) => delete target[key]);
  }

  Object.assign(target, value);
}

function updateMaybeRef<T>(target: GlobalDialogMaybeRef<T> | undefined, value: T) {
  if (isRef(target)) {
    target.value = value;
  }
}

function resolveFormModel<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  form: GlobalDialogFormConfig<TValues>,
) {
  return (readValue(form.model) ?? instance.model) as Record<string, unknown>;
}

function toHandlerKey(eventName: string) {
  if (/^on[A-Z]/.test(eventName)) return eventName;

  const normalized = eventName.replace(/-([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );

  return `on${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}`;
}

function mapEvents(events: Record<string, (...args: unknown[]) => void> = {}) {
  return Object.fromEntries(
    Object.entries(events).map(([eventName, handler]) => [toHandlerKey(eventName), handler]),
  );
}

function isActionResultObject<TValues extends Record<string, unknown>>(
  result: GlobalDialogActionClickResult<TValues>,
): result is Partial<GlobalDialogResult<TValues>> & { close?: boolean } {
  return isRecord(result);
}

function shouldStayOpen<TValues extends Record<string, unknown>>(
  result: GlobalDialogActionClickResult<TValues>,
) {
  return result === false || (isActionResultObject(result) && result.close === false);
}

function buildCloseResult<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  action: GlobalDialogActionConfig<TValues>,
  result: GlobalDialogActionClickResult<TValues>,
) {
  return {
    id: instance.id,
    action: isActionResultObject(result) && result.action ? result.action : action.code,
    values:
      isActionResultObject(result) && result.values
        ? result.values
        : instance.model,
    payload: isActionResultObject(result) ? result.payload : undefined,
  };
}

async function handleDialogAction<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  action: GlobalDialogActionConfig<TValues>,
) {
  if (readValue(action.disabled, false)) return;

  instance.busyAction = action.code;

  try {
    const context = createGlobalDialogContext(instance);
    const actionResult = await action.onClick?.(context, action);
    if (shouldStayOpen(actionResult)) return;

    if (action.role === 'cancel' || action.code === 'cancel') {
      await closeGlobalDialog(instance.id, {
        action: action.code,
        values: instance.model,
        payload: isActionResultObject(actionResult) ? actionResult.payload : undefined,
      });
      return;
    }

    if (action.role === 'confirm' || action.code === 'confirm') {
      const confirmResult = await instance.config.onConfirm?.(context);
      if (shouldStayOpen(confirmResult)) return;

      await closeGlobalDialog(
        instance.id,
        buildCloseResult(instance, action, confirmResult ?? actionResult),
      );
      return;
    }

    await instance.config.onAction?.(action, context);

    if (
      action.closeOnClick ||
      (isActionResultObject(actionResult) && actionResult.close === true)
    ) {
      await closeGlobalDialog(instance.id, buildCloseResult(instance, action, actionResult));
    }
  } finally {
    instance.busyAction = '';
  }
}

function renderAction<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  action: GlobalDialogActionConfig<TValues>,
) {
  return h(
    resolveComponent('vxe-button') as any,
    {
      key: action.code,
      status: action.status,
      disabled: readValue(action.disabled, false),
      loading: readValue(action.loading, false) || instance.busyAction === action.code,
      ...(action.props ?? {}),
      onClick: () => handleDialogAction(instance, action),
    },
    {
      default: () => [
        action.icon ? h('i', { class: action.icon, 'aria-hidden': 'true' }) : null,
        readValue(action.label, ''),
      ],
    },
  );
}

function renderToolbar<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  node: Extract<GlobalDialogContentNode<TValues>, { type: 'toolbar' }>,
) {
  return h(
    'div',
    {
      key: node.key,
      class: ['lc-global-dialog__toolbar', node.className],
      style: node.style,
    },
    node.actions.map((action) => renderAction(instance, action)),
  );
}

function renderForm<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  form: GlobalDialogFormConfig<TValues>,
  node?: { key?: string; className?: unknown; style?: unknown },
) {
  const context = createGlobalDialogContext(instance);
  const formModel = resolveFormModel(instance, form);

  return h(LowCodeForm, {
    key: node?.key,
    class: node?.className,
    style: node?.style,
    schema: readValue(form.schema),
    modelValue: formModel,
    optionSources: readValue(form.optionSources),
    loading: readValue(form.loading, false),
    ...(form.props ?? {}),
    'onUpdate:modelValue': (value: Record<string, unknown>) => {
      if (form.model) {
        assignRecord(formModel, value, true);
        updateMaybeRef(form.model, formModel);
      } else {
        context.setModel(value);
      }

      void form.onUpdateModel?.(value, context);
    },
    onSubmit: (values: Record<string, unknown>) => form.onSubmit?.(values, context),
    onAction: (action, values: Record<string, unknown>) => form.onAction?.(action, values, context),
    onFieldChange: (payload: any) => form.onFieldChange?.(payload, context),
  });
}

function renderGrid(grid: GlobalDialogGridConfig, node?: { key?: string; className?: unknown; style?: unknown }) {
  const events = mapEvents(grid.events);

  if (grid.schema) {
    return h(LowCodeGrid, {
      key: node?.key,
      class: node?.className,
      style: node?.style,
      schema: readValue(grid.schema),
      rows: readValue(grid.rows, []),
      loading: readValue(grid.loading, false),
      ...(grid.props ?? {}),
      ...events,
    });
  }

  return h(resolveComponent('vxe-grid') as any, {
    key: node?.key,
    class: node?.className,
    style: node?.style,
    ...resolveProps(grid.props),
    data: readValue(grid.rows, resolveProps(grid.props).data as Record<string, unknown>[]),
    columns: readValue(
      grid.columns,
      resolveProps(grid.props).columns as Record<string, unknown>[],
    ),
    loading: readValue(grid.loading, Boolean(resolveProps(grid.props).loading)),
    ...events,
  });
}

function syncModelFromLowCodeEvent<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  lowcode: GlobalDialogLowCodeBlocksConfig<TValues>,
  event: LowCodeRuntimeEvent,
) {
  if (lowcode.formModels) return;
  if (event.name !== 'form.fieldChange') return;
  if (!isRecord(event.payload) || !isRecord(event.payload.values)) return;

  assignRecord(instance.model, event.payload.values, true);
}

function collectFormModels(
  blocks: LowCodePageBlock[],
  model: Record<string, unknown>,
) {
  const formModels: Record<string, Record<string, unknown>> = {};

  const visit = (block: LowCodePageBlock) => {
    if (block.kind === 'form' || block.kind === 'searchForm') {
      formModels[block.id] = model;
    }

    if ('blocks' in block && Array.isArray(block.blocks)) {
      block.blocks.forEach(visit);
    }

    if (block.kind === 'tabs') {
      block.tabs.forEach((tab) => tab.blocks.forEach(visit));
    }

    if ('overlays' in block && Array.isArray(block.overlays)) {
      block.overlays.forEach(visit);
    }
  };

  blocks.forEach(visit);
  return formModels;
}

function renderLowCodeBlocks<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  node: Extract<GlobalDialogContentNode<TValues>, { type: 'lowcodeBlocks' }>,
) {
  const context = createGlobalDialogContext(instance);
  const lowcode = node.lowcode;
  const blocks = readValue(lowcode.blocks, []);
  const formModels = readValue(lowcode.formModels) ?? collectFormModels(blocks, instance.model);
  const searchFilters = readValue(lowcode.searchFilters, {});
  const resolvedData = readValue(lowcode.resolvedData, {});

  const blockProps = {
    resolvedData,
    formModels,
    searchFilters,
    loadingBlockId: readValue(lowcode.loadingBlockId),
    loadingGridId: readValue(lowcode.loadingGridId),
    onFormSubmit: (payload: any) => lowcode.onFormSubmit?.(payload, context),
    onFormAction: (payload: any) => lowcode.onFormAction?.(payload, context),
    onGridEdit: (payload: any) => lowcode.onGridEdit?.(payload, context),
    onGridDelete: (payload: any) => lowcode.onGridDelete?.(payload, context),
    onToolbarAction: (payload: any) => lowcode.onToolbarAction?.(payload, context),
    onSearchSubmit: (payload: any) => lowcode.onSearchSubmit?.(payload, context),
    onSearchAction: (payload: any) => lowcode.onSearchAction?.(payload, context),
    onRuntimeEvent: (event: LowCodeRuntimeEvent) => {
      syncModelFromLowCodeEvent(instance, lowcode, event);
      void lowcode.onRuntimeEvent?.(event, context);
    },
  };

  return h(
    'div',
    {
      key: node.key,
      class: ['lc-global-dialog__lowcode', node.className],
      style: node.style,
      ...resolveProps(lowcode.props),
    },
    blocks.length
      ? blocks.map((block) =>
          h(LowCodeBlockRenderer, {
            key: block.id,
            block,
            ...blockProps,
          }),
        )
      : h('div', { class: 'lc-global-dialog__empty' }, '低代码弹框未配置 blocks'),
  );
}

function renderTabs<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  node: Extract<GlobalDialogContentNode<TValues>, { type: 'tabs' }>,
) {
  const context = createGlobalDialogContext(instance);
  const activeName = readValue(node.activeName, node.panes[0]?.name ?? '');

  return h(
    resolveComponent('vxe-tabs') as any,
    {
      key: node.key,
      class: node.className,
      style: node.style,
      modelValue: activeName,
      ...(node.props ?? {}),
      'onUpdate:modelValue': (name: string | number) => {
        updateMaybeRef(node.activeName, name);
        void node.onChange?.(name, context);
      },
    },
    {
      default: () =>
        node.panes.map((pane) =>
          h(
            resolveComponent('vxe-tab-pane') as any,
            {
              key: pane.key ?? pane.name,
              title: readValue(pane.label, ''),
              name: pane.name,
              class: pane.className,
              style: pane.style,
              ...(pane.props ?? {}),
            },
            {
              default: () =>
                (pane.children ?? []).map((child, childIndex) =>
                  renderContentNode(instance, child, childIndex),
                ),
            },
          ),
        ),
    },
  );
}

function normalizeContent<TValues extends Record<string, unknown>>(
  content: GlobalDialogConfig<TValues>['content'],
) {
  if (!content) return [];
  return Array.isArray(content) ? content : [content];
}

function renderContentNode<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
  node: GlobalDialogContentNode<TValues>,
  index: number,
): VNodeChild {
  if (node.type === 'render') {
    return node.render(createGlobalDialogContext(instance));
  }

  if (node.type === 'toolbar') {
    return renderToolbar(instance, node);
  }

  if (node.type === 'tabs') {
    return renderTabs(instance, node);
  }

  if (node.type === 'form') {
    return renderForm(instance, node.form, node);
  }

  if (node.type === 'grid') {
    return renderGrid(node.grid, node);
  }

  if (node.type === 'lowcodeBlocks') {
    return renderLowCodeBlocks(instance, node);
  }

  return h(
    node.tag ?? 'div',
    {
      key: node.key ?? index,
      class: node.className,
      style: node.style,
      ...(node.props ?? {}),
    },
    (node.children ?? []).map((child, childIndex) =>
      renderContentNode(instance, child, childIndex),
    ),
  );
}

function renderBody<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
) {
  const context = createGlobalDialogContext(instance);
  const config = instance.config;

  if (config.body) {
    return config.body(context);
  }

  if (config.content) {
    return normalizeContent(config.content).map((node, index) =>
      renderContentNode(instance, node, index),
    );
  }

  if (config.form) {
    return renderForm(instance, config.form);
  }

  if (config.grid) {
    return renderGrid(config.grid);
  }

  return null;
}

function getFooterActions<TValues extends Record<string, unknown>>(
  config: GlobalDialogConfig<TValues>,
) {
  if (config.actions) return config.actions;
  if (!config.showFooter && !config.form) return [];

  return [
    {
      code: 'cancel',
      label: '取消',
      role: 'cancel',
    },
    {
      code: 'confirm',
      label: '确定',
      role: 'confirm',
      status: 'primary',
    },
  ] satisfies GlobalDialogActionConfig<TValues>[];
}

function renderFooter<TValues extends Record<string, unknown>>(
  instance: GlobalDialogInstance<TValues>,
) {
  const config = instance.config;
  const context = createGlobalDialogContext(instance);

  if (config.footer) {
    return config.footer(context);
  }

  const actions = getFooterActions(config);
  if (!actions.length) return null;

  return h(
    'div',
    { class: 'lc-global-dialog__footer' },
    actions.map((action) => renderAction(instance, action)),
  );
}

function hasFooter<TValues extends Record<string, unknown>>(
  config: GlobalDialogConfig<TValues>,
) {
  return Boolean(config.footer || getFooterActions(config).length);
}

export default defineComponent({
  name: 'GlobalDialogHost',
  setup() {
    return () =>
      h(
        Fragment,
        null,
        globalDialogInstances.map((instance) => {
          const config = instance.config;
          const modalProps = {
            key: instance.id,
            modelValue: instance.visible,
            title: readValue(config.title, ''),
            width: readValue(config.width),
            height: readValue(config.height),
            className: config.className,
            showFooter: config.showFooter ?? hasFooter(config),
            showZoom: true,
            transfer: true,
            resize: true,
            ...(config.props ?? {}),
            'onUpdate:modelValue': (visible: boolean) => {
              if (!visible) {
                void closeGlobalDialog(instance.id, {
                  action: 'close',
                  values: instance.model,
                });
              } else {
                instance.visible = visible;
              }
            },
            onClose: () => {
              void closeGlobalDialog(instance.id, {
                action: 'close',
                values: instance.model,
              });
            },
          };

          return h(resolveComponent('vxe-modal') as any, modalProps, {
            default: () =>
              h('div', { class: 'lc-global-dialog__body' }, renderBody(instance) as any),
            footer: () => renderFooter(instance),
          });
        }),
      );
  },
});
