<template>
  <section
    class="content-panel lc-node-button-group"
    @contextmenu.stop.prevent="openButtonGroupContextMenu"
  >
    <div class="lc-button-group" :style="groupStyle">
      <vxe-button
        v-for="action in block.actions"
        :key="action.code"
        v-bind="resolveButtonProps(action)"
        @click="() => handleRootClick(action)"
        @dropdown-click="handleDropdownClick"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import type { VxeButtonProps } from 'vxe-pc-ui';
import type {
  LowCodeButtonGroupAction,
  LowCodePageButtonGroupBlock,
  LowCodeRuntimeDirective,
} from '../../../types/lowcode';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import type {
  ButtonGroupDesignerButton,
  ButtonGroupDesignerResult,
} from '../../../visual-editor/components/button-group-designer/button-group-designer.service';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

type RuntimeDesignerButton = Omit<LowCodeButtonGroupAction, 'children'> & {
  directivesJson: string;
  children?: RuntimeDesignerButton[];
};

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageButtonGroupBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtimeBlockEditor = inject(lowCodeRuntimeBlockEditorKey, null);

const justifyContentMap: Record<string, string> = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
  'space-between': 'space-between',
};

const groupStyle = computed(() => ({
  justifyContent: justifyContentMap[props.block.align || 'left'] ?? 'flex-start',
  gap: toCssGap(props.block.gap),
}));

function toCssGap(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
  }
  return '8px';
}

function hasChildren(action: LowCodeButtonGroupAction) {
  return Array.isArray(action.children) && action.children.length > 0;
}

function readButtonContent(action: LowCodeButtonGroupAction) {
  return action.content ?? action.label ?? action.code;
}

function resolveDropdownOptions(actions: LowCodeButtonGroupAction[]) {
  return actions.map((action, index) => ({
    ...resolveButtonProps(action),
    name: action.name ?? action.code ?? index,
    content: readButtonContent(action),
    action,
  }));
}

function resolveButtonProps(action: LowCodeButtonGroupAction): VxeButtonProps {
  const buttonProps: VxeButtonProps = {
    size: action.size,
    type: action.type,
    mode: action.mode ?? (action.text ? 'text' : 'button'),
    className: action.className,
    name: action.name ?? action.code,
    routerLink: action.routerLink,
    permissionCode: action.permissionCode,
    title: action.title,
    content: readButtonContent(action),
    placement: action.placement,
    status: action.status,
    icon: action.icon,
    prefixIcon: action.prefixIcon ?? action.icon,
    suffixIcon: action.suffixIcon,
    round: action.round,
    circle: action.circle,
    disabled: action.disabled,
    loading: action.loading,
    trigger: action.trigger,
    align: action.align,
    showDropdownIcon: action.showDropdownIcon,
    destroyOnClose: action.destroyOnClose,
    transfer: action.transfer,
    popupConfig: action.popupConfig,
  };

  if (hasChildren(action)) {
    buttonProps.options = resolveDropdownOptions(action.children ?? []);
    buttonProps.showDropdownIcon = action.showDropdownIcon ?? true;
  }

  return Object.fromEntries(
    Object.entries(buttonProps).filter(([, value]) => typeof value !== 'undefined' && value !== ''),
  ) as VxeButtonProps;
}

function handleRootClick(action: LowCodeButtonGroupAction) {
  if (hasChildren(action)) return;
  handleAction(action);
}

function handleDropdownClick(params: { option?: Record<string, unknown> }) {
  const action = (params.option as { action?: LowCodeButtonGroupAction } | undefined)?.action;
  if (action) handleAction(action);
}

function toDesignerButton(action: LowCodeButtonGroupAction): RuntimeDesignerButton {
  const { children, content: _content, directives, ...button } = action;

  return {
    ...button,
    label: String(readButtonContent(action)),
    directivesJson: JSON.stringify(directives ?? []),
    ...(children?.length
      ? { children: children.map((child) => toDesignerButton(child)) }
      : {}),
  };
}

function readDesignerDirectives(value: unknown): LowCodeRuntimeDirective[] {
  if (Array.isArray(value)) return value as LowCodeRuntimeDirective[];
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as LowCodeRuntimeDirective[]) : [];
  } catch {
    return [];
  }
}

function toRuntimeButton(button: ButtonGroupDesignerButton): LowCodeButtonGroupAction {
  const {
    __id: _id,
    children: designerChildren,
    directives: _directives,
    directivesJson,
    ...preservedProps
  } = button;
  const code = typeof button.code === 'string' && button.code.trim()
    ? button.code.trim()
    : 'button';
  const label = typeof button.label === 'string' && button.label.trim()
    ? button.label.trim()
    : code;
  const type = button.type === 'submit' || button.type === 'reset' ? button.type : 'button';
  const status = typeof button.status === 'string' && button.status.trim()
    ? button.status as LowCodeButtonGroupAction['status']
    : undefined;
  const route = typeof button.route === 'string' ? button.route.trim() : '';
  const eventName = typeof button.eventName === 'string' ? button.eventName.trim() : '';
  const directives = readDesignerDirectives(directivesJson);
  const children = Array.isArray(designerChildren)
    ? designerChildren.map((child) => toRuntimeButton(child))
    : [];

  const next: Record<string, unknown> = {
    ...preservedProps,
    code,
    label,
    type,
    disabled: Boolean(button.disabled),
  };

  if (status) next.status = status;
  else delete next.status;
  if (route) next.route = route;
  else delete next.route;
  if (eventName) next.eventName = eventName;
  else delete next.eventName;
  if (directives.length) next.directives = directives;
  else delete next.directives;
  if (children.length) next.children = children;
  else delete next.children;

  return next as LowCodeButtonGroupAction;
}

function createRuntimeBlockChanges(result: ButtonGroupDesignerResult) {
  const align = ['left', 'center', 'right', 'space-between'].includes(result.business.align)
    ? result.business.align as LowCodePageButtonGroupBlock['align']
    : 'left';

  return {
    id: result.business.blockId,
    title: result.business.title,
    description: result.business.description,
    align,
    gap: result.business.gap,
    actions: result.buttons.map((button) => toRuntimeButton(button)),
  };
}

async function openButtonDesigner() {
  const { $$buttonGroupDesigner } = await import(
    '../../../visual-editor/components/button-group-designer/button-group-designer.service'
  );

  void $$buttonGroupDesigner({
    title: '设计按钮',
    business: {
      blockId: props.block.id,
      title: props.block.title ?? '按钮组',
      description: props.block.description ?? '',
      align: props.block.align ?? 'left',
      gap: props.block.gap ?? 8,
    },
    buttons: props.block.actions.map((action) => toDesignerButton(action)),
    scriptContext: runtimeBlockEditor?.getScriptContextSource?.(),
    onConfirm: async (result) => {
      if (!runtimeBlockEditor) {
        throw new Error('当前页面不支持保存按钮配置');
      }

      await runtimeBlockEditor.updateBlock({
        blockId: props.block.id,
        changes: createRuntimeBlockChanges(result),
      });
    },
  });
}

function openButtonGroupContextMenu(event: MouseEvent) {
  VxeUI.contextMenu.openByEvent(event, {
    className: 'enlearn-context-menu',
    options: [
      [
        {
          code: 'design-buttons',
          name: '设计按钮',
          prefixIcon: 'ri-settings-3-line',
        },
      ],
    ],
    events: {
      optionClick({ option }) {
        if (option.code === 'design-buttons') {
          void openButtonDesigner();
        }
      },
    },
  });
}

function handleAction(action: LowCodeButtonGroupAction) {
  if (action.disabled) return;

  emit('runtimeEvent', {
    name: action.eventName ?? 'buttonGroup.click',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      action,
      actionCode: action.code,
      script: action.script ?? '',
      directives: action.directives ?? [],
    },
  });
  emit('toolbarAction', { block: props.block, action });
}
</script>

<style scoped>
.lc-node-button-group {
  display: grid;
  gap: 8px;
}

.lc-button-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}
</style>
