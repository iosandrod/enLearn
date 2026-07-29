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
  extend: [];
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
        @click.stop="emit('extend')"
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
  width: 236px;
  min-height: 86px;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  border: 1px solid var(--approval-node-border);
  border-radius: 8px;
  background:
    linear-gradient(90deg, var(--approval-node-soft) 0, #ffffff 42%),
    #ffffff;
  box-shadow: 0 10px 26px rgba(15, 23, 42, 0.12);
  color: #0f172a;
  padding: 12px 12px 12px 14px;
}

.approval-flow-card::before {
  position: absolute;
  inset: 10px auto 10px 0;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: var(--approval-node-accent);
  content: '';
}

.approval-flow-card--event {
  width: 236px;
  min-height: 86px;
  grid-template-columns: 36px minmax(0, 1fr);
  padding: 11px 12px;
}

.approval-flow-card--selected {
  border-color: var(--approval-node-accent);
  box-shadow:
    0 0 0 4px color-mix(in srgb, var(--approval-node-accent) 16%, transparent),
    0 14px 30px rgba(15, 23, 42, 0.16);
}

.approval-flow-card__icon {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid var(--approval-node-border);
  border-radius: 8px;
  background: var(--approval-node-soft);
  color: var(--approval-node-accent);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
}

.approval-flow-card--event .approval-flow-card__icon {
  width: 34px;
  height: 34px;
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
  gap: 8px;
}

.approval-flow-card__title {
  overflow: hidden;
  color: #111827;
  font-size: 14px;
  font-weight: 800;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-flow-card__badge {
  flex: 0 0 auto;
  border: 1px solid var(--approval-node-border);
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  font-size: 11px;
  font-weight: 700;
  line-height: 18px;
  padding: 0 7px;
}

.approval-flow-card__summary {
  display: -webkit-box;
  overflow: hidden;
  margin: 4px 0 0;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: #64748b;
  font-size: 12px;
  line-height: 18px;
}

.approval-flow-card__category {
  position: absolute;
  right: 10px;
  bottom: 7px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  text-transform: uppercase;
}

.approval-flow-card--event .approval-flow-card__category {
  display: none;
}

.approval-flow-card__quick-actions {
  position: absolute;
  right: -16px;
  bottom: -19px;
  display: flex;
  gap: 6px;
  align-items: center;
}

.approval-flow-card__quick-actions button {
  display: grid;
  min-width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--approval-node-accent);
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 10px 22px rgba(15, 23, 42, 0.16);
  color: var(--approval-node-accent);
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
  line-height: 1;
  padding: 0 8px;
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
