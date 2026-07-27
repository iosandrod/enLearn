<script setup lang="ts">
import type { ApprovalTask } from '../types/task';

defineProps<{
  tasks?: ApprovalTask[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  approve: [task: ApprovalTask];
  reject: [task: ApprovalTask];
  open: [task: ApprovalTask];
}>();
</script>

<template>
  <section class="approval-task-panel" aria-label="审批任务">
    <div v-if="loading" class="approval-task-panel__empty">Loading</div>
    <div v-else-if="!tasks?.length" class="approval-task-panel__empty">暂无待办</div>
    <article v-for="task in tasks" v-else :key="task.id" class="approval-task-panel__item">
      <button type="button" class="approval-task-panel__title" @click="emit('open', task)">
        {{ task.title }}
      </button>
      <div class="approval-task-panel__meta">
        <span>{{ task.nodeName }}</span>
        <span>{{ task.status }}</span>
      </div>
      <div class="approval-task-panel__actions">
        <button type="button" @click="emit('reject', task)">驳回</button>
        <button type="button" class="approval-task-panel__primary" @click="emit('approve', task)">
          通过
        </button>
      </div>
    </article>
  </section>
</template>

<style scoped>
.approval-task-panel {
  display: grid;
  gap: 10px;
}

.approval-task-panel__empty,
.approval-task-panel__item {
  border: 1px solid #d9dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2937;
  padding: 12px;
}

.approval-task-panel__title {
  width: 100%;
  border: 0;
  background: transparent;
  color: #111827;
  cursor: pointer;
  font-size: 15px;
  font-weight: 700;
  padding: 0;
  text-align: left;
}

.approval-task-panel__meta,
.approval-task-panel__actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 10px;
}

.approval-task-panel__meta {
  color: #64748b;
  font-size: 13px;
}

.approval-task-panel__actions button {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2937;
  cursor: pointer;
  padding: 7px 11px;
}

.approval-task-panel__actions .approval-task-panel__primary {
  border-color: #0f766e;
  background: #0f766e;
  color: #ffffff;
}
</style>
