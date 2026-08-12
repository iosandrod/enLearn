<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type HandleConnectable } from '@vue-flow/core';
import type { TriggerFlowNodeData } from '../flow-adapter';

const props = withDefaults(
  defineProps<{
    data?: TriggerFlowNodeData;
    selected?: boolean;
    connectable?: HandleConnectable;
  }>(),
  {
    selected: false,
    connectable: true
  }
);

const node = computed<TriggerFlowNodeData>(() => ({
  workflowType: props.data?.workflowType ?? 'task',
  label: props.data?.label ?? '执行任务',
  category: props.data?.category ?? '任务',
  description: props.data?.description ?? '',
  icon: props.data?.icon ?? 'ri-flashlight-line',
  accent: props.data?.accent ?? '#4f46e5',
  accentSoft: props.data?.accentSoft ?? '#eef2ff',
  accentBorder: props.data?.accentBorder ?? '#c7d2fe',
  summary: props.data?.summary ?? '未配置',
  isEntry: props.data?.isEntry ?? false,
  isEnd: props.data?.isEnd ?? false
}));
</script>

<template>
  <article
    class="trigger-flow-node"
    :class="{
      'trigger-flow-node--selected': selected,
      'trigger-flow-node--event': node.isEntry || node.isEnd
    }"
    :style="{
      '--node-accent': node.accent,
      '--node-soft': node.accentSoft,
      '--node-border': node.accentBorder
    }"
  >
    <Handle
      v-if="!node.isEntry"
      id="in"
      type="target"
      :position="Position.Top"
      :connectable="connectable"
    />
    <span class="trigger-flow-node__icon"><i :class="node.icon" aria-hidden="true" /></span>
    <span class="trigger-flow-node__copy">
      <strong>{{ node.label }}</strong>
      <small>{{ node.summary }}</small>
    </span>
    <span class="trigger-flow-node__category">{{ node.category }}</span>
    <Handle
      v-if="!node.isEnd"
      id="out"
      type="source"
      :position="Position.Bottom"
      :connectable="connectable"
    />
  </article>
</template>

<style scoped>
.trigger-flow-node {
  position: relative;
  display: grid;
  width: 224px;
  min-height: 76px;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 11px;
  border: 1px solid var(--node-border);
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 5px 16px rgba(15, 23, 42, 0.09);
  color: #111827;
  padding: 12px 13px;
}

.trigger-flow-node::before {
  position: absolute;
  inset: 10px auto 10px 0;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: var(--node-accent);
  content: '';
}

.trigger-flow-node--event {
  width: 196px;
  min-height: 68px;
}

.trigger-flow-node--selected {
  border-color: var(--node-accent);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--node-accent) 14%, transparent),
    0 12px 28px rgba(15, 23, 42, 0.15);
}

.trigger-flow-node__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--node-border);
  border-radius: 7px;
  background: #fff;
  color: var(--node-accent);
  font-size: 18px;
}

.trigger-flow-node__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.trigger-flow-node__copy strong,
.trigger-flow-node__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-flow-node__copy strong {
  font-size: 14px;
  line-height: 20px;
}

.trigger-flow-node__copy small {
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
}

.trigger-flow-node__category {
  position: absolute;
  right: 10px;
  bottom: 6px;
  color: #94a3b8;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0;
}

.trigger-flow-node :deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border: 2px solid #fff;
  background: var(--node-accent);
  box-shadow: 0 0 0 1px var(--node-accent);
}
</style>

