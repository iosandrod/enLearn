<script setup lang="ts">
import { computed } from 'vue';
import { normalizeWorkflowModel, type WorkflowModel } from '@enlearn/workflow-schema';
import { createEmptyWorkflowModel } from '../utils';

const props = defineProps<{
  model?: WorkflowModel;
}>();

const workflow = computed(() => normalizeWorkflowModel(props.model ?? createEmptyWorkflowModel()));
</script>

<template>
  <section class="approval-viewer" aria-label="审批流程">
    <header class="approval-viewer__header">
      <strong>{{ workflow.name }}</strong>
      <span>{{ workflow.nodes.length }} 节点</span>
    </header>

    <ol class="approval-viewer__nodes">
      <li v-for="node in workflow.nodes" :key="node.id">
        <span>{{ node.name }}</span>
        <small>{{ node.type }}</small>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.approval-viewer {
  border: 1px solid #d9dee8;
  border-radius: 8px;
  background: #ffffff;
  color: #1f2937;
  overflow: hidden;
}

.approval-viewer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #e5e7eb;
  padding: 12px 14px;
}

.approval-viewer__header span {
  color: #64748b;
  font-size: 13px;
}

.approval-viewer__nodes {
  display: flex;
  gap: 12px;
  list-style: none;
  margin: 0;
  overflow-x: auto;
  padding: 16px;
}

.approval-viewer__nodes li {
  display: grid;
  min-width: 112px;
  min-height: 54px;
  place-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #f8fafc;
}

.approval-viewer__nodes small {
  color: #64748b;
  font-size: 12px;
}
</style>
