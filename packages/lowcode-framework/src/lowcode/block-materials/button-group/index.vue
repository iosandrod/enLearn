<template>
  <section class="content-panel lc-node-button-group">
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
import { computed } from 'vue';
import type { VxeButtonProps } from 'vxe-pc-ui';
import type {
  LowCodeButtonGroupAction,
  LowCodePageButtonGroupBlock,
} from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageButtonGroupBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();

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

function handleDropdownClick(params: { option?: { action?: LowCodeButtonGroupAction } }) {
  const action = params.option?.action;
  if (action) handleAction(action);
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
