<script setup lang="ts">
import { computed } from 'vue';
import {
  ConnectionLineType,
  VueFlow,
  useVueFlow
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import type { WorkflowModel } from '@enlearn/workflow-schema';
import ApprovalFlowNodeCard from './ApprovalFlowNode.vue';
import {
  autoLayoutFlowNodes,
  workflowToFlowEdges,
  workflowToFlowNodes,
  type ApprovalFlowEdge,
  type ApprovalFlowNode
} from '../flow-adapter';

export type ApprovalRuntimeNodeStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'rejected'
  | 'skipped'
  | 'failed';

export type ApprovalRuntimeNodeState = {
  nodeId: string;
  status: ApprovalRuntimeNodeStatus;
  executionCount?: number;
  taskCount?: number;
  completedTaskCount?: number;
  activeTaskCount?: number;
  assigneeIds?: string[];
  startedAt?: string;
  endedAt?: string;
};

const props = withDefaults(
  defineProps<{
    model: WorkflowModel;
    nodeStates?: ApprovalRuntimeNodeState[];
    selectedNodeId?: string;
    fitViewOnInit?: boolean;
  }>(),
  {
    nodeStates: () => [],
    selectedNodeId: '',
    fitViewOnInit: true
  }
);

const emit = defineEmits<{
  nodeSelect: [nodeId: string];
}>();

const flowId = `approval-runtime-${Math.random().toString(36).slice(2)}`;
const { fitView, zoomIn, zoomOut } = useVueFlow(flowId);

const statusByNode = computed(
  () => new Map(props.nodeStates.map((state) => [state.nodeId, state]))
);
const flowNodes = computed<ApprovalFlowNode[]>(() => {
  const nodes = workflowToFlowNodes(props.model).map((node) => {
    const state = statusByNode.value.get(node.id);
    const status = state?.status ?? 'pending';
    return {
      ...node,
      class: `${node.class ?? ''} approval-runtime-node approval-runtime-node--${status}`,
      draggable: false,
      deletable: false,
      connectable: false,
      selectable: true,
      data: {
        ...node.data,
        runtimeStatus: status,
        runtimeStatusLabel: nodeStatusLabel(status),
        executionCount: state?.executionCount ?? 0,
        taskCount: state?.taskCount ?? 0,
        activeTaskCount: state?.activeTaskCount ?? 0
      }
    };
  });
  const edges = workflowToFlowEdges(props.model);
  return autoLayoutFlowNodes(nodes, edges).map((node) => ({ ...node, draggable: false }));
});
const flowEdges = computed<ApprovalFlowEdge[]>(() =>
  workflowToFlowEdges(props.model).map((edge) => {
    const source = statusByNode.value.get(edge.source)?.status ?? 'pending';
    const target = statusByNode.value.get(edge.target)?.status ?? 'pending';
    const completed = isVisitedStatus(source) && isVisitedStatus(target);
    const active = ['running', 'waiting'].includes(target);
    const danger = ['rejected', 'failed'].includes(target);
    const skipped = target === 'skipped';
    const stroke = danger
      ? '#dc2626'
      : active
        ? '#2563eb'
        : completed
          ? '#16a34a'
          : skipped
            ? '#94a3b8'
            : '#cbd5e1';

    return {
      ...edge,
      animated: active,
      class: [
        edge.class,
        'approval-runtime-edge',
        `approval-runtime-edge--${danger ? 'danger' : active ? 'active' : completed ? 'completed' : skipped ? 'skipped' : 'pending'}`
      ].filter(Boolean).join(' '),
      style: {
        stroke,
        strokeWidth: active ? 3 : completed ? 2.6 : 2.1,
        ...(skipped ? { strokeDasharray: '6 5' } : {})
      }
    };
  })
);

function nodeStatusLabel(status: ApprovalRuntimeNodeStatus) {
  const labels: Record<ApprovalRuntimeNodeStatus, string> = {
    pending: '未执行',
    running: '执行中',
    waiting: '待审批',
    completed: '已完成',
    rejected: '已驳回',
    skipped: '已跳过',
    failed: '失败'
  };
  return labels[status];
}

function isVisitedStatus(status: ApprovalRuntimeNodeStatus) {
  return ['running', 'waiting', 'completed', 'rejected', 'failed'].includes(status);
}

function handleNodeClick(event: { node?: { id?: string } }) {
  const nodeId = event.node?.id;
  if (nodeId) emit('nodeSelect', nodeId);
}

function fitCanvas() {
  void fitView({ padding: 0.18, duration: 220 });
}
</script>

<template>
  <section class="approval-runtime-viewer" aria-label="审批实例流程图">
    <header class="approval-runtime-viewer__toolbar">
      <div class="approval-runtime-viewer__legend" aria-label="节点状态图例">
        <span v-for="status in ['completed', 'waiting', 'rejected', 'failed', 'skipped', 'pending']" :key="status">
          <i :class="`is-${status}`" />
          {{ nodeStatusLabel(status as ApprovalRuntimeNodeStatus) }}
        </span>
      </div>
      <div class="approval-runtime-viewer__actions">
        <button type="button" title="居中显示" aria-label="居中显示" @click="fitCanvas">
          <i class="ri-focus-3-line" aria-hidden="true" />
        </button>
        <button type="button" title="放大" aria-label="放大" @click="zoomIn()">
          <i class="ri-zoom-in-line" aria-hidden="true" />
        </button>
        <button type="button" title="缩小" aria-label="缩小" @click="zoomOut()">
          <i class="ri-zoom-out-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="approval-runtime-viewer__canvas">
      <VueFlow
        :id="flowId"
        :nodes="flowNodes"
        :edges="flowEdges"
        :connection-line-type="ConnectionLineType.SmoothStep"
        :fit-view-on-init="fitViewOnInit"
        :nodes-draggable="false"
        :nodes-connectable="false"
        :edges-updatable="false"
        :elements-selectable="true"
        :min-zoom="0.25"
        :max-zoom="1.6"
        @node-click="handleNodeClick"
      >
        <template #node-approval-card="{ id, data, selected }">
          <div
            class="approval-runtime-viewer__node"
            :class="[
              `approval-runtime-viewer__node--${data.runtimeStatus ?? 'pending'}`,
              { 'is-selected': selectedNodeId === id || selected }
            ]"
          >
            <ApprovalFlowNodeCard
              :data="data"
              :selected="Boolean(selectedNodeId === id || selected)"
              :connectable="false"
            />
            <span class="approval-runtime-viewer__node-status">
              <i />
              {{ data.runtimeStatusLabel }}
              <small v-if="data.executionCount > 1">{{ data.executionCount }} 次</small>
            </span>
          </div>
        </template>
      </VueFlow>
    </div>
  </section>
</template>

<style scoped>
.approval-runtime-viewer {
  display: grid;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: #f8fafc;
}

.approval-runtime-viewer__toolbar {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid #d9e1ea;
  background: #ffffff;
  padding: 5px 9px;
}

.approval-runtime-viewer__legend,
.approval-runtime-viewer__actions {
  display: flex;
  align-items: center;
  gap: 9px;
}

.approval-runtime-viewer__legend {
  overflow-x: auto;
  color: #526072;
  font-size: 10px;
  white-space: nowrap;
}

.approval-runtime-viewer__legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.approval-runtime-viewer__legend i,
.approval-runtime-viewer__node-status i {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #cbd5e1;
}

.approval-runtime-viewer__legend .is-completed { background: #16a34a; }
.approval-runtime-viewer__legend .is-waiting { background: #2563eb; }
.approval-runtime-viewer__legend .is-rejected,
.approval-runtime-viewer__legend .is-failed { background: #dc2626; }
.approval-runtime-viewer__legend .is-skipped { background: #94a3b8; }

.approval-runtime-viewer__actions {
  flex: 0 0 auto;
  gap: 4px;
}

.approval-runtime-viewer__actions button {
  display: grid;
  width: 27px;
  height: 27px;
  place-items: center;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 14px;
}

.approval-runtime-viewer__actions button:hover {
  background: #f1f5f9;
}

.approval-runtime-viewer__canvas {
  min-height: 0;
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgba(100, 116, 139, 0.18) 1px, transparent 1px);
  background-size: 20px 20px;
}

.approval-runtime-viewer__canvas :deep(.vue-flow) {
  width: 100%;
  height: 100%;
}

.approval-runtime-viewer__canvas :deep(.vue-flow__edge-path) {
  transition: stroke 160ms ease, stroke-width 160ms ease;
}

.approval-runtime-viewer__node {
  position: relative;
  border-radius: 7px;
}

.approval-runtime-viewer__node :deep(.approval-flow-card) {
  border-color: #cbd5e1;
  box-shadow: 0 3px 9px rgba(15, 23, 42, 0.07);
}

.approval-runtime-viewer__node--completed :deep(.approval-flow-card) {
  border-color: #22c55e;
  background: #f0fdf4;
  box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.12);
}

.approval-runtime-viewer__node--running :deep(.approval-flow-card),
.approval-runtime-viewer__node--waiting :deep(.approval-flow-card) {
  border-color: #3b82f6;
  background: #eff6ff;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16), 0 7px 15px rgba(37, 99, 235, 0.11);
}

.approval-runtime-viewer__node--rejected :deep(.approval-flow-card),
.approval-runtime-viewer__node--failed :deep(.approval-flow-card) {
  border-color: #ef4444;
  background: #fef2f2;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.13);
}

.approval-runtime-viewer__node--skipped :deep(.approval-flow-card) {
  border-style: dashed;
  background: #f8fafc;
  opacity: 0.7;
}

.approval-runtime-viewer__node.is-selected :deep(.approval-flow-card) {
  box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.2), 0 8px 18px rgba(15, 23, 42, 0.11);
}

.approval-runtime-viewer__node-status {
  position: absolute;
  top: -11px;
  right: 8px;
  display: inline-flex;
  min-height: 21px;
  align-items: center;
  gap: 4px;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #475569;
  font-size: 10px;
  font-weight: 800;
  line-height: 15px;
  padding: 2px 7px;
  white-space: nowrap;
}

.approval-runtime-viewer__node-status small {
  color: #64748b;
  font-size: 9px;
}

.approval-runtime-viewer__node--completed .approval-runtime-viewer__node-status {
  border-color: #86efac;
  color: #15803d;
}

.approval-runtime-viewer__node--completed .approval-runtime-viewer__node-status i { background: #16a34a; }
.approval-runtime-viewer__node--running .approval-runtime-viewer__node-status,
.approval-runtime-viewer__node--waiting .approval-runtime-viewer__node-status {
  border-color: #93c5fd;
  color: #1d4ed8;
}
.approval-runtime-viewer__node--running .approval-runtime-viewer__node-status i,
.approval-runtime-viewer__node--waiting .approval-runtime-viewer__node-status i { background: #2563eb; }
.approval-runtime-viewer__node--rejected .approval-runtime-viewer__node-status,
.approval-runtime-viewer__node--failed .approval-runtime-viewer__node-status {
  border-color: #fca5a5;
  color: #b91c1c;
}
.approval-runtime-viewer__node--rejected .approval-runtime-viewer__node-status i,
.approval-runtime-viewer__node--failed .approval-runtime-viewer__node-status i { background: #dc2626; }

@media (max-width: 700px) {
  .approval-runtime-viewer__toolbar {
    align-items: flex-start;
  }

  .approval-runtime-viewer__legend {
    max-width: calc(100vw - 150px);
  }
}
</style>
