<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type HandleConnectable } from '@vue-flow/core';
import type { ApprovalFlowNodeData } from '../flow-adapter';

const props = withDefaults(
  defineProps<{
    data?: ApprovalFlowNodeData;
    selected?: boolean;
    connectable?: HandleConnectable;
    extendable?: boolean;
    branchable?: boolean;
  }>(),
  {
    selected: false,
    connectable: true,
    extendable: false,
    branchable: false
  }
);

const emit = defineEmits<{
  extend: [event: MouseEvent];
  branch: [];
}>();

const node = computed<ApprovalFlowNodeData>(() => ({
  workflowType: props.data?.workflowType ?? 'approval',
  label: props.data?.label ?? '审批',
  typeLabel: props.data?.typeLabel ?? '审批',
  categoryLabel: props.data?.categoryLabel ?? '人工审批',
  description: props.data?.description,
  icon: props.data?.icon ?? 'A',
  accent: props.data?.accent ?? '#2563eb',
  accentSoft: props.data?.accentSoft ?? '#eff6ff',
  accentBorder: props.data?.accentBorder ?? '#bfdbfe',
  summary: props.data?.summary ?? '待配置处理人',
  isStart: props.data?.isStart ?? false,
  isEnd: props.data?.isEnd ?? false
}));

const isEventNode = computed(() => node.value.isStart || node.value.isEnd);
const badgeText = computed(() => {
  if (node.value.label !== node.value.typeLabel) return node.value.typeLabel;
  if (isEventNode.value) return node.value.categoryLabel;

  return '';
});
</script>

<template>
  <article
    class="approval-flow-card"
    :class="{
      'approval-flow-card--selected': selected,
      'approval-flow-card--event': isEventNode
    }"
    :style="{
      '--approval-node-accent': node.accent,
      '--approval-node-soft': node.accentSoft,
      '--approval-node-border': node.accentBorder
    }"
  >
    <Handle
      v-if="!node.isStart"
      id="in"
      type="target"
      :position="Position.Top"
      :connectable="connectable"
      class="approval-flow-card__handle approval-flow-card__handle--target"
    />

    <div class="approval-flow-card__icon" aria-hidden="true">
      {{ node.icon }}
    </div>

    <div class="approval-flow-card__content">
      <div class="approval-flow-card__topline">
        <strong class="approval-flow-card__title">{{ node.label }}</strong>
        <span
          v-if="badgeText"
          class="approval-flow-card__badge"
        >
          {{ badgeText }}
        </span>
      </div>
      <p class="approval-flow-card__summary">
        {{ node.description || node.summary }}
      </p>
    </div>

    <span class="approval-flow-card__category">{{ node.categoryLabel }}</span>

    <div
      v-if="selected && (extendable || branchable)"
      class="approval-flow-card__quick-actions"
    >
      <button
        v-if="extendable"
        type="button"
        title="延伸节点"
        @pointerdown.stop
        @click.stop="emit('extend', $event)"
      >
        +
      </button>
      <button
        v-if="branchable"
        type="button"
        title="生成分支"
        @pointerdown.stop
        @click.stop="emit('branch')"
      >
        IF
      </button>
    </div>

    <Handle
      v-if="!node.isEnd"
      id="out"
      type="source"
      :position="Position.Bottom"
      :connectable="connectable"
      class="approval-flow-card__handle approval-flow-card__handle--source"
    />
  </article>
</template>

<style scoped>
.approval-flow-card {
  position: relative;
  display: grid;
  width: 224px;
  min-height: 76px;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  border: 1px solid var(--approval-node-border);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.06);
  color: #0f172a;
  padding: 9px 10px 9px 12px;
}

.approval-flow-card::before {
  position: absolute;
  inset: 8px auto 8px 0;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: var(--approval-node-accent);
  content: '';
}

.approval-flow-card--event {
  width: 224px;
  min-height: 76px;
  grid-template-columns: 32px minmax(0, 1fr);
  padding: 8px 10px 8px 12px;
}

.approval-flow-card--selected {
  border-color: var(--approval-node-accent);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--approval-node-accent) 14%, transparent),
    0 10px 20px rgba(15, 23, 42, 0.1);
}

.approval-flow-card__icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--approval-node-border);
  border-radius: 6px;
  background: var(--approval-node-soft);
  color: var(--approval-node-accent);
  font-size: 11px;
  font-weight: 800;
  line-height: 1;
}

.approval-flow-card--event .approval-flow-card__icon {
  width: 30px;
  height: 30px;
  border-radius: 999px;
}

.approval-flow-card__content {
  min-width: 0;
}

.approval-flow-card__topline {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.approval-flow-card__title {
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  font-weight: 800;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-flow-card__badge {
  flex: 0 0 auto;
  border: 1px solid var(--approval-node-border);
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  padding: 0 6px;
}

.approval-flow-card__summary {
  display: -webkit-box;
  overflow: hidden;
  margin: 3px 0 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
}

.approval-flow-card__category {
  position: absolute;
  right: 8px;
  bottom: 6px;
  color: #94a3b8;
  font-size: 9px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.approval-flow-card--event .approval-flow-card__category {
  display: none;
}

.approval-flow-card__quick-actions {
  position: absolute;
  right: -14px;
  bottom: -16px;
  display: flex;
  gap: 6px;
  align-items: center;
}

.approval-flow-card__quick-actions button {
  display: grid;
  min-width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--approval-node-accent);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);
  color: var(--approval-node-accent);
  cursor: pointer;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  padding: 0 7px;
}

.approval-flow-card__quick-actions button:hover {
  background: var(--approval-node-soft);
}

.approval-flow-card :deep(.vue-flow__handle) {
  width: 10px;
  height: 10px;
  border: 2px solid #ffffff;
  background: var(--approval-node-accent);
  box-shadow: 0 0 0 1px var(--approval-node-accent);
}

.approval-flow-card :deep(.vue-flow__handle-top) {
  top: -6px;
}

.approval-flow-card :deep(.vue-flow__handle-bottom) {
  bottom: -6px;
}
</style>
