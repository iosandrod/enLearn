<template>
  <div class="mobile-action-group">
    <div v-if="block.title || block.description" class="action-header">
      <span v-if="block.title" class="action-title">{{ block.title }}</span>
      <span v-if="block.description" class="action-description">{{ block.description }}</span>
    </div>
    <div class="action-list">
      <button
        v-for="action in block.actions ?? []"
        :key="action.code"
        :class="[
          'action-button',
          `is-${action.status ?? 'default'}`,
          { 'is-active': activeCode === action.code },
        ]"
        :disabled="action.disabled === true"
        @click="publishAction(action)"
      >
        <span class="action-button-text">{{ action.label ?? action.content ?? action.title }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from '@vue/runtime-core';
import type { MobileMaterialEmits, MobileMaterialProps, SharedLowCodeAction } from '../types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
const activeCode = computed(() => props.activeActionCodes[props.block.id]
  || props.block.actions?.find((action: SharedLowCodeAction) => action.status === 'primary')?.code
  || '');

function publishAction(action: SharedLowCodeAction) {
  emit('runtimeEvent', {
    name: action.eventName ?? 'toolbar.action',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      action,
      actionCode: action.code,
      directives: action.directives ?? (action.route ? [{ type: 'navigate', route: action.route }] : []),
    },
  });
}
</script>

<style scoped>
.mobile-action-group {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.action-header {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
}

.action-title {
  color: #17212b;
  font-size: 15px;
  line-height: 22px;
  font-weight: bold;
}

.action-description {
  margin-top: 3px;
  color: #68737d;
  font-size: 12px;
  line-height: 18px;
}

.action-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}

.action-button {
  min-height: 40px;
  margin-right: 8px;
  margin-bottom: 8px;
  padding-right: 14px;
  padding-left: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f0f3f5;
  border-radius: 5px;
}

.action-button.is-primary {
  background-color: #1e67d6;
}

.action-button.is-active {
  background-color: #1e67d6;
}

.action-button.is-success {
  background-color: #0b7957;
}

.action-button.is-warning {
  background-color: #ad7200;
}

.action-button.is-danger {
  background-color: #b63b36;
}

.action-button-text {
  color: #17212b;
  font-size: 13px;
}

.action-button.is-primary .action-button-text,
.action-button.is-active .action-button-text,
.action-button.is-success .action-button-text,
.action-button.is-warning .action-button-text,
.action-button.is-danger .action-button-text {
  color: #ffffff;
}
</style>
