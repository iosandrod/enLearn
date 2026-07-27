<template>
  <section class="content-panel lc-node-button-group">
    <div v-if="block.title || block.description" class="lc-button-group__header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </div>

    <div class="lc-button-group" :style="groupStyle">
      <template v-for="action in block.actions" :key="action.code">
        <details
          v-if="hasChildren(action)"
          class="lc-button-group__dropdown"
          :class="{ 'is-disabled': action.disabled }"
        >
          <summary :class="buttonClass(action)" @click="guardDisabled(action, $event)">
            <i v-if="action.icon" :class="action.icon" aria-hidden="true" />
            <span>{{ action.label }}</span>
            <i class="ri-arrow-down-s-line" aria-hidden="true" />
          </summary>
          <div class="lc-button-group__menu">
            <button
              v-for="child in action.children"
              :key="child.code"
              type="button"
              class="lc-button-group__menu-item"
              :disabled="child.disabled"
              @click="handleAction(child)"
            >
              <i v-if="child.icon" :class="child.icon" aria-hidden="true" />
              <span>{{ child.label }}</span>
            </button>
          </div>
        </details>

        <button
          v-else
          type="button"
          :class="buttonClass(action)"
          :disabled="action.disabled"
          @click="handleAction(action)"
        >
          <i v-if="action.icon" :class="action.icon" aria-hidden="true" />
          <span>{{ action.label }}</span>
        </button>
      </template>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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

function buttonClass(action: LowCodeButtonGroupAction) {
  return [
    'lc-button',
    action.status ? `lc-button--${action.status}` : '',
    {
      'is-plain': action.plain,
      'is-text': action.text,
    },
  ];
}

function guardDisabled(action: LowCodeButtonGroupAction, event: MouseEvent) {
  if (!action.disabled) return;
  event.preventDefault();
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

.lc-button-group__header {
  display: grid;
  gap: 4px;
}

.lc-button-group__header h2 {
  margin: 0;
  color: #111827;
  font-size: 16px;
  line-height: 1.2;
}

.lc-button-group__header p {
  margin: 0;
  color: #667085;
  font-size: 12px;
}

.lc-button-group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
}

.lc-button-group__dropdown {
  position: relative;
}

.lc-button-group__dropdown summary {
  list-style: none;
}

.lc-button-group__dropdown summary::-webkit-details-marker {
  display: none;
}

.lc-button-group__dropdown.is-disabled {
  pointer-events: none;
}

.lc-button-group__dropdown.is-disabled .lc-button {
  cursor: not-allowed;
  opacity: 0.5;
}

.lc-button-group__menu {
  position: absolute;
  z-index: 20;
  top: calc(100% + 6px);
  left: 0;
  min-width: 132px;
  padding: 6px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 12px 28px rgb(15 23 42 / 14%);
}

.lc-button-group__menu-item {
  display: flex;
  width: 100%;
  min-height: 30px;
  padding: 0 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #334155;
  cursor: pointer;
  align-items: center;
  gap: 6px;
  text-align: left;
}

.lc-button-group__menu-item:hover:not(:disabled) {
  background: #eff6ff;
  color: #1d73d8;
}

.lc-button-group__menu-item:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.lc-button--success {
  border-color: #16a34a;
  background: #16a34a;
  color: #fff;
}

.lc-button--info {
  border-color: #64748b;
  background: #64748b;
  color: #fff;
}
</style>
