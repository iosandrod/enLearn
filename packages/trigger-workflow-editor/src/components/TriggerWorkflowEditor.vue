<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import VxeUI from 'vxe-pc-ui';
import {
  VueFlow,
  useVueFlow,
  type Connection,
  type EdgeMouseEvent,
  type NodeMouseEvent
} from '@vue-flow/core';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import TriggerFlowNode from './TriggerFlowNode.vue';
import {
  autoLayoutTriggerFlowNodes,
  connectionToTriggerFlowEdge,
  flowToTriggerWorkflow,
  triggerWorkflowToFlowEdges,
  triggerWorkflowToFlowNodes,
  type TriggerFlowEdge,
  type TriggerFlowNode as TriggerCanvasNode
} from '../flow-adapter';
import { compileTriggerWorkflow } from '../compiler/trigger';
import { cloneTriggerWorkflow, normalizeTriggerWorkflow } from '../schema/normalize';
import {
  getTriggerNodeDefinition,
  getTriggerNodeDefinitionsForKind
} from '../schema/registry';
import { validateTriggerWorkflow } from '../schema/validate';
import type {
  TriggerEdgeCondition,
  TriggerNodeType,
  TriggerWorkflowIssue,
  TriggerWorkflowKind,
  TriggerWorkflowModel,
  TriggerWorkflowNode
} from '../schema/types';
import {
  createAiAgentTriggerWorkflow,
  createApprovalTriggerWorkflow,
  createDataSyncTriggerWorkflow
} from '../templates';

const props = withDefaults(
  defineProps<{
    modelValue?: TriggerWorkflowModel;
    readonly?: boolean;
    height?: string;
  }>(),
  {
    readonly: false,
    height: '760px'
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: TriggerWorkflowModel];
  change: [value: TriggerWorkflowModel];
  validation: [issues: TriggerWorkflowIssue[]];
  compile: [value: ReturnType<typeof compileTriggerWorkflow>];
  export: [value: TriggerWorkflowModel];
}>();

const kindOptions: Array<{ value: TriggerWorkflowKind; label: string }> = [
  { value: 'approval', label: '审批流' },
  { value: 'dataSync', label: '数据同步' },
  { value: 'aiAgent', label: 'AI Agent' },
  { value: 'custom', label: '自定义' }
];

const flowId = `trigger-workflow-editor-${Math.random().toString(36).slice(2)}`;
const { fitView, screenToFlowCoordinate } = useVueFlow(flowId);
const fallbackModel = createApprovalTriggerWorkflow();
const currentModel = ref(normalizeTriggerWorkflow(props.modelValue ?? fallbackModel));
const flowNodes = ref<TriggerCanvasNode[]>(triggerWorkflowToFlowNodes(currentModel.value));
const flowEdges = ref<TriggerFlowEdge[]>(triggerWorkflowToFlowEdges(currentModel.value));
const selectedNodeId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);
const activeInspectorTab = ref<'config' | 'compiled'>('config');
const configDraft = ref('{}');
const configError = ref('');
const syncing = ref(false);
let sequence = 0;

const palette = computed(() => getTriggerNodeDefinitionsForKind(currentModel.value.kind));
const selectedNode = computed(() => currentModel.value.nodes.find((node) => node.id === selectedNodeId.value));
const selectedEdge = computed(() => currentModel.value.edges.find((edge) => edge.id === selectedEdgeId.value));
const issues = computed(() => validateTriggerWorkflow(currentModel.value));
const errorCount = computed(() => issues.value.filter((issue) => issue.level === 'error').length);
const compiledPlan = computed(() => {
  if (errorCount.value) return undefined;
  try {
    return compileTriggerWorkflow(currentModel.value);
  } catch {
    return undefined;
  }
});
const compiledText = computed(() =>
  JSON.stringify(compiledPlan.value ?? { errors: issues.value }, null, 2)
);
const selectedDefinition = computed(() =>
  selectedNode.value ? getTriggerNodeDefinition(selectedNode.value.type) : undefined
);
const rootStyle = computed(() => ({ '--trigger-editor-height': props.height }));
const selectedEdgeConditionType = computed({
  get: () => selectedEdge.value?.condition?.type ?? 'always',
  set: (value: TriggerEdgeCondition['type']) => updateSelectedEdgeConditionType(value)
});

watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;
    syncFromModel(value);
  },
  { deep: true }
);

watch(
  [flowNodes, flowEdges],
  () => {
    if (syncing.value) return;
    const next = flowToTriggerWorkflow(currentModel.value, flowNodes.value, flowEdges.value);
    currentModel.value = next;
    emitModel(next);
  },
  { deep: true }
);

watch(
  selectedNode,
  (node) => {
    configDraft.value = JSON.stringify(node?.config ?? {}, null, 2);
    configError.value = '';
  },
  { immediate: true }
);

function emitModel(model: TriggerWorkflowModel) {
  emit('update:modelValue', model);
  emit('change', model);
  emit('validation', validateTriggerWorkflow(model));
}

function syncFromModel(model: TriggerWorkflowModel) {
  syncing.value = true;
  currentModel.value = normalizeTriggerWorkflow(model);
  flowNodes.value = triggerWorkflowToFlowNodes(currentModel.value);
  flowEdges.value = triggerWorkflowToFlowEdges(currentModel.value);
  void nextTick(() => {
    syncing.value = false;
  });
}

function replaceModel(model: TriggerWorkflowModel) {
  syncFromModel(model);
  emitModel(currentModel.value);
  void nextTick(() => fitView({ padding: 0.18, duration: 180 }));
}

function setKind(kind: TriggerWorkflowKind) {
  if (props.readonly) return;
  currentModel.value = { ...currentModel.value, kind };
  emitModel(currentModel.value);
}

function loadTemplate(kind: Exclude<TriggerWorkflowKind, 'custom'>) {
  if (props.readonly) return;
  const factory =
    kind === 'approval'
      ? createApprovalTriggerWorkflow
      : kind === 'dataSync'
        ? createDataSyncTriggerWorkflow
        : createAiAgentTriggerWorkflow;
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
  replaceModel(factory());
}

function onNodeClick(event: NodeMouseEvent) {
  closeNodeContextMenu();
  selectedNodeId.value = event.node.id;
  selectedEdgeId.value = null;
  activeInspectorTab.value = 'config';
}

function onEdgeClick(event: EdgeMouseEvent) {
  closeNodeContextMenu();
  selectedEdgeId.value = event.edge.id;
  selectedNodeId.value = null;
  activeInspectorTab.value = 'config';
}

function onPaneClick() {
  closeNodeContextMenu();
  selectedNodeId.value = null;
  selectedEdgeId.value = null;
}

function onNodeContextMenu(event: NodeMouseEvent) {
  event.event.preventDefault();
  event.event.stopPropagation();
  const point = getClientPoint(event.event);
  const node = currentModel.value.nodes.find((item) => item.id === event.node.id);
  if (!node) return;

  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;
  activeInspectorTab.value = 'config';
  VxeUI.contextMenu.open({
    x: point.x,
    y: point.y,
    className: 'enlearn-context-menu',
    options: [
      [
        {
          code: 'node-summary',
          name: `${node.name} · ${node.type}`,
          disabled: true
        }
      ],
      [
        {
          code: 'inspect',
          name: '打开配置',
          prefixIcon: 'ri-settings-3-line'
        },
        {
          code: 'duplicate',
          name: '复制节点',
          prefixIcon: 'ri-file-copy-line',
          disabled: props.readonly
        },
        {
          code: 'copy-id',
          name: '复制节点 ID',
          prefixIcon: 'ri-clipboard-line'
        },
        {
          code: 'delete',
          name: '删除节点',
          prefixIcon: 'ri-delete-bin-line',
          className: 'enlearn-context-menu-option--danger',
          disabled: props.readonly || !canDeleteNode(node)
        }
      ]
    ],
    events: {
      optionClick({ option }) {
        if (option.code === 'inspect') inspectContextNode(node);
        if (option.code === 'duplicate') duplicateContextNode(node);
        if (option.code === 'copy-id') void copyContextNodeId(node);
        if (option.code === 'delete') deleteContextNode(node);
      }
    }
  });
}

function closeNodeContextMenu() {
  VxeUI.contextMenu.close();
}

function addNode(type: TriggerNodeType) {
  addNodeAt(type);
}

function addNodeAt(type: TriggerNodeType, position?: { x: number; y: number }) {
  if (props.readonly) return;
  const definition = getTriggerNodeDefinition(type);
  if (!definition) return;

  sequence += 1;
  const id = `${type}_${Date.now().toString(36)}_${sequence}`;
  const selected = selectedNode.value;
  const sourceFlowNode = flowNodes.value.find((node) => node.id === selected?.id);
  const nextNode = createConfiguredNode(type, id, definition.label, {
    x: position?.x ?? sourceFlowNode?.position.x ?? 380,
    y: position?.y ?? (sourceFlowNode?.position.y ?? 40) + 160
  });

  const nextNodes = [...currentModel.value.nodes, nextNode];
  let nextEdges = [...currentModel.value.edges];
  if (definition.allowIncoming && selected && selected.type !== 'end') {
    const outgoing = nextEdges.filter((edge) => edge.source === selected.id);
    const canBranch = selected.type === 'condition' || selected.type === 'parallel';
    if (outgoing.length && !canBranch) {
      const first = outgoing[0];
      nextEdges = nextEdges.filter((edge) => edge.id !== first.id);
      nextEdges.push(
        { id: createEdgeId(selected.id, id), source: selected.id, target: id },
        { ...first, id: createEdgeId(id, first.target), source: id }
      );
    } else {
      nextEdges.push({ id: createEdgeId(selected.id, id), source: selected.id, target: id });
    }
  }

  selectedNodeId.value = id;
  replaceModel({
    ...currentModel.value,
    nodes: nextNodes,
    edges: nextEdges
  });
}

function onPaletteDragStart(event: DragEvent, type: TriggerNodeType) {
  if (props.readonly || !event.dataTransfer) return;
  const target = event.currentTarget as HTMLElement | null;
  const bounds = target?.getBoundingClientRect();
  const offsetX = bounds ? event.clientX - bounds.left : 119;
  const offsetY = bounds ? event.clientY - bounds.top : 24;
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.setData('application/x-trigger-node', type);
  event.dataTransfer.setData('text/plain', type);
  event.dataTransfer.setData('application/x-trigger-node-offset', JSON.stringify({ x: offsetX, y: offsetY }));
}

function onCanvasDragOver(event: DragEvent) {
  if (props.readonly) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
}

function onCanvasDrop(event: DragEvent) {
  if (props.readonly) return;
  const type = event.dataTransfer?.getData('application/x-trigger-node') as TriggerNodeType | undefined;
  if (!type) return;
  event.preventDefault();
  const position = screenToFlowCoordinate({ x: event.clientX, y: event.clientY });
  const offset = readDragOffset(event.dataTransfer?.getData('application/x-trigger-node-offset'));
  addNodeAt(type, { x: position.x - offset.x, y: position.y - offset.y });
}

function onConnect(connection: Connection) {
  if (props.readonly || !connection.source || !connection.target) return;
  if (flowEdges.value.some((edge) => edge.source === connection.source && edge.target === connection.target)) return;
  flowEdges.value = [
    ...flowEdges.value,
    connectionToTriggerFlowEdge(connection, createEdgeId(connection.source, connection.target))
  ];
}

function deleteSelection() {
  if (props.readonly) return;
  if (selectedEdge.value) {
    replaceModel({
      ...currentModel.value,
      edges: currentModel.value.edges.filter((edge) => edge.id !== selectedEdge.value?.id)
    });
    selectedEdgeId.value = null;
    return;
  }
  const node = selectedNode.value;
  if (!node || !canDeleteNode(node)) return;
  deleteNodeById(node.id);
}

function inspectContextNode(node: TriggerWorkflowNode) {
  selectedNodeId.value = node.id;
  selectedEdgeId.value = null;
  activeInspectorTab.value = 'config';
  closeNodeContextMenu();
}

function duplicateContextNode(node: TriggerWorkflowNode) {
  if (props.readonly) return;
  const definition = getTriggerNodeDefinition(node.type);
  if (!definition) return;

  sequence += 1;
  const id = `${node.type}_${Date.now().toString(36)}_${sequence}`;
  const nextNode: TriggerWorkflowNode = {
    ...cloneTriggerWorkflowNode(node),
    id,
    name: `${node.name} Copy`,
    position: {
      x: (node.position?.x ?? 380) + 36,
      y: (node.position?.y ?? 40) + 36
    }
  };

  selectedNodeId.value = id;
  selectedEdgeId.value = null;
  closeNodeContextMenu();
  replaceModel({
    ...currentModel.value,
    nodes: [...currentModel.value.nodes, nextNode]
  });
}

async function copyContextNodeId(node: TriggerWorkflowNode) {
  await navigator.clipboard?.writeText(node.id);
  closeNodeContextMenu();
}

function deleteContextNode(node: TriggerWorkflowNode) {
  if (props.readonly || !canDeleteNode(node)) return;
  closeNodeContextMenu();
  deleteNodeById(node.id);
}

function deleteNodeById(nodeId: string) {
  replaceModel({
    ...currentModel.value,
    nodes: currentModel.value.nodes.filter((item) => item.id !== nodeId),
    edges: currentModel.value.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
  });
  selectedNodeId.value = null;
}

function canDeleteNode(node: TriggerWorkflowNode) {
  return !['start', 'schedule', 'webhook', 'end'].includes(node.type);
}

function updateWorkflowField(field: 'code' | 'name', event: Event) {
  if (props.readonly) return;
  const value = (event.target as HTMLInputElement).value;
  currentModel.value = { ...currentModel.value, [field]: value };
  emitModel(currentModel.value);
}

function updateSelectedNodeField(field: 'name' | 'description', event: Event) {
  const node = selectedNode.value;
  if (!node || props.readonly) return;
  const value = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  replaceNode({ ...node, [field]: value });
}

function updateNodeConfig(path: string[], value: unknown) {
  const node = selectedNode.value;
  if (!node || props.readonly) return;
  const config = cloneRecord(node.config ?? {});
  let target: Record<string, unknown> = config;
  path.forEach((segment, index) => {
    if (index === path.length - 1) {
      target[segment] = value;
      return;
    }
    const current = target[segment];
    if (!isObject(current)) target[segment] = {};
    target = target[segment] as Record<string, unknown>;
  });
  replaceNode({ ...node, config });
}

function applyConfigJson() {
  const node = selectedNode.value;
  if (!node || props.readonly) return;
  try {
    const config = JSON.parse(configDraft.value) as unknown;
    if (!isObject(config)) throw new Error('Config must be a JSON object.');
    configError.value = '';
    replaceNode({ ...node, config });
  } catch (error) {
    configError.value = error instanceof Error ? error.message : String(error);
  }
}

function replaceNode(node: TriggerWorkflowNode) {
  replaceModel({
    ...currentModel.value,
    nodes: currentModel.value.nodes.map((item) => (item.id === node.id ? node : item))
  });
}

function updateSelectedEdgeName(event: Event) {
  const edge = selectedEdge.value;
  if (!edge || props.readonly) return;
  const name = (event.target as HTMLInputElement).value;
  replaceEdge({ ...edge, name });
}

function updateSelectedEdgeConditionType(type: TriggerEdgeCondition['type']) {
  const edge = selectedEdge.value;
  if (!edge || props.readonly) return;
  const condition: TriggerEdgeCondition =
    type === 'field'
      ? { type: 'field', field: '', operator: 'eq', value: '' }
      : type === 'expression'
        ? { type: 'expression', expression: '' }
        : { type: 'always' };
  replaceEdge(type === 'always' ? { ...edge, condition: undefined } : { ...edge, condition });
}

function updateSelectedEdgeConditionField(field: string, value: unknown) {
  const edge = selectedEdge.value;
  if (!edge || props.readonly) return;
  const condition = edge.condition ?? { type: 'always' as const };
  replaceEdge({
    ...edge,
    condition: {
      ...condition,
      [field]: value
    } as TriggerEdgeCondition
  });
}

function replaceEdge(edge: TriggerWorkflowModel['edges'][number]) {
  replaceModel({
    ...currentModel.value,
    edges: currentModel.value.edges.map((item) => (item.id === edge.id ? edge : item))
  });
}

function layout() {
  flowNodes.value = autoLayoutTriggerFlowNodes(flowNodes.value, flowEdges.value);
  void nextTick(() => fitView({ padding: 0.18, duration: 220 }));
}

function compile() {
  if (!compiledPlan.value) return;
  emit('compile', compiledPlan.value);
  activeInspectorTab.value = 'compiled';
}

function exportModel() {
  emit('export', cloneTriggerWorkflow(currentModel.value));
}

function createConfiguredNode(
  type: TriggerNodeType,
  id: string,
  name: string,
  position: { x: number; y: number }
): TriggerWorkflowNode {
  const taskId = `${currentModel.value.code}.${id}`;
  const base = { id, type, name, position };
  if (type === 'task' || type === 'triggerAndWait' || type === 'batchTrigger' || type === 'tool') {
    return { ...base, config: { task: { id: taskId, retry: { maxAttempts: 3 } } } };
  }
  if (type === 'manualApproval' || type === 'humanReview') {
    return {
      ...base,
      config: {
        task: { id: taskId },
        approval: { assigneeType: 'role', assigneeIds: [], timeoutSeconds: 86400, onTimeout: 'fail' }
      }
    };
  }
  if (type === 'wait') return { ...base, config: { wait: { mode: 'duration', duration: 'PT1H' } } };
  if (type === 'dataSource' || type === 'dataSink') return { ...base, config: { task: { id: taskId }, data: { connector: 'http', operation: 'sync' } } };
  if (type === 'transform' || type === 'memory') return { ...base, config: { task: { id: taskId }, expression: '' } };
  if (type === 'agent') return { ...base, config: { task: { id: taskId }, ai: { provider: 'openai', model: 'gpt-4.1', prompt: '', maxTurns: 6 } } };
  if (type === 'schedule') return { ...base, config: { schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai' } } };
  if (type === 'webhook') return { ...base, config: { webhook: { path: '/', method: 'POST' } } };
  return base;
}

function createEdgeId(source: string, target: string) {
  sequence += 1;
  return `edge_${source}_${target}_${sequence}`;
}

function cloneRecord(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function cloneTriggerWorkflowNode(node: TriggerWorkflowNode) {
  return JSON.parse(JSON.stringify(node)) as TriggerWorkflowNode;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDragOffset(value: string | undefined) {
  if (!value) return { x: 119, y: 41 };
  try {
    const parsed = JSON.parse(value) as { x?: unknown; y?: unknown };
    return {
      x: typeof parsed.x === 'number' ? parsed.x : 119,
      y: typeof parsed.y === 'number' ? parsed.y : 41
    };
  } catch {
    return { x: 119, y: 41 };
  }
}

function getClientPoint(event: MouseEvent | TouchEvent) {
  if ('clientX' in event) return { x: event.clientX, y: event.clientY };
  const touch = event.touches[0] ?? event.changedTouches[0];
  return {
    x: touch?.clientX ?? 0,
    y: touch?.clientY ?? 0
  };
}
</script>

<template>
  <section class="trigger-editor" :style="rootStyle">
    <header class="trigger-editor__header">
      <div class="trigger-editor__identity">
        <input
          class="trigger-editor__title"
          :value="currentModel.name"
          :disabled="readonly"
          aria-label="Workflow name"
          @input="updateWorkflowField('name', $event)"
        />
        <input
          class="trigger-editor__code"
          :value="currentModel.code"
          :disabled="readonly"
          aria-label="Workflow code"
          @input="updateWorkflowField('code', $event)"
        />
      </div>

      <div class="trigger-editor__kind" role="tablist" aria-label="Workflow type">
        <button
          v-for="option in kindOptions"
          :key="option.value"
          type="button"
          :class="{ 'trigger-editor__kind-button--active': currentModel.kind === option.value }"
          :disabled="readonly"
          @click="setKind(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="trigger-editor__actions">
        <button type="button" title="Auto layout" @click="layout">Layout</button>
        <button type="button" title="Fit workflow" @click="fitView({ padding: 0.18, duration: 180 })">Fit</button>
        <button type="button" title="Export workflow" @click="exportModel">Export</button>
        <button type="button" class="trigger-editor__primary" :disabled="Boolean(errorCount)" @click="compile">
          Compile
        </button>
      </div>
    </header>

    <div class="trigger-editor__workspace">
      <aside class="trigger-editor__palette">
        <div class="trigger-editor__side-head">
          <strong>Templates</strong>
          <span>{{ currentModel.kind }}</span>
        </div>
        <div class="trigger-editor__templates">
          <button type="button" :disabled="readonly" @click="loadTemplate('approval')">审批</button>
          <button type="button" :disabled="readonly" @click="loadTemplate('dataSync')">同步</button>
          <button type="button" :disabled="readonly" @click="loadTemplate('aiAgent')">Agent</button>
        </div>

        <div class="trigger-editor__side-head trigger-editor__side-head--nodes">
          <strong>Nodes</strong>
          <span>{{ palette.length }}</span>
        </div>
        <div class="trigger-editor__palette-list">
          <button
            v-for="item in palette"
            :key="item.type"
            type="button"
            class="trigger-editor__palette-item"
            :data-node-type="item.type"
            :style="{
              '--palette-accent': item.accent,
              '--palette-soft': item.accentSoft,
              '--palette-border': item.accentBorder
            }"
            :disabled="readonly"
            draggable="true"
            :title="item.description"
            @dragstart="onPaletteDragStart($event, item.type)"
            @click="addNode(item.type)"
          >
            <span>{{ item.icon }}</span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.category }}</small>
          </button>
        </div>
      </aside>

      <main class="trigger-editor__canvas" @dragover="onCanvasDragOver" @drop="onCanvasDrop">
        <div class="trigger-editor__canvas-status">
          <span :class="{ 'trigger-editor__status-dot--error': errorCount }" class="trigger-editor__status-dot" />
          <strong>{{ errorCount ? `${errorCount} errors` : 'Ready' }}</strong>
          <span>{{ currentModel.nodes.length }} nodes · {{ currentModel.edges.length }} edges</span>
        </div>

        <VueFlow
          :id="flowId"
          v-model:nodes="flowNodes"
          v-model:edges="flowEdges"
          class="trigger-editor__flow"
          :nodes-draggable="!readonly"
          :nodes-connectable="!readonly"
          :elements-selectable="true"
          :delete-key-code="null"
          fit-view-on-init
          @connect="onConnect"
          @node-click="onNodeClick"
          @node-context-menu="onNodeContextMenu"
          @edge-click="onEdgeClick"
          @pane-click="onPaneClick"
        >
          <template #node-trigger-workflow-node="nodeProps">
            <TriggerFlowNode v-bind="nodeProps" />
          </template>
        </VueFlow>

      </main>

      <aside class="trigger-editor__inspector">
        <div class="trigger-editor__tabs">
          <button
            type="button"
            :class="{ 'trigger-editor__tab--active': activeInspectorTab === 'config' }"
            @click="activeInspectorTab = 'config'"
          >
            Config
          </button>
          <button
            type="button"
            :class="{ 'trigger-editor__tab--active': activeInspectorTab === 'compiled' }"
            @click="activeInspectorTab = 'compiled'"
          >
            Plan
          </button>
        </div>

        <div v-if="activeInspectorTab === 'compiled'" class="trigger-editor__compiled">
          <textarea readonly :value="compiledText" />
        </div>

        <div v-else-if="selectedNode" class="trigger-editor__form">
          <div class="trigger-editor__selected">
            <span
              :style="{
                '--selected-accent': selectedDefinition?.accent,
                '--selected-soft': selectedDefinition?.accentSoft,
                '--selected-border': selectedDefinition?.accentBorder
              }"
            >
              {{ selectedDefinition?.icon }}
            </span>
            <div>
              <strong>{{ selectedNode.name }}</strong>
              <small>{{ selectedDefinition?.category }}</small>
            </div>
          </div>

          <label>
            <span>Name</span>
            <input :value="selectedNode.name" :disabled="readonly" @input="updateSelectedNodeField('name', $event)" />
          </label>
          <label>
            <span>Description</span>
            <textarea :value="selectedNode.description" :disabled="readonly" @input="updateSelectedNodeField('description', $event)" />
          </label>

          <template v-if="selectedNode.type === 'schedule'">
            <label><span>Cron</span><input :value="selectedNode.config?.schedule?.cron" :disabled="readonly" @input="updateNodeConfig(['schedule', 'cron'], ($event.target as HTMLInputElement).value)" /></label>
            <label><span>Timezone</span><input :value="selectedNode.config?.schedule?.timezone" :disabled="readonly" @input="updateNodeConfig(['schedule', 'timezone'], ($event.target as HTMLInputElement).value)" /></label>
          </template>

          <template v-if="selectedNode.type === 'webhook'">
            <label><span>Path</span><input :value="selectedNode.config?.webhook?.path" :disabled="readonly" @input="updateNodeConfig(['webhook', 'path'], ($event.target as HTMLInputElement).value)" /></label>
            <label><span>Method</span><select :value="selectedNode.config?.webhook?.method ?? 'POST'" :disabled="readonly" @change="updateNodeConfig(['webhook', 'method'], ($event.target as HTMLSelectElement).value)"><option v-for="method in ['GET','POST','PUT','PATCH','DELETE']" :key="method">{{ method }}</option></select></label>
          </template>

          <template v-if="['task','triggerAndWait','batchTrigger','tool','agent','dataSource','dataSink','manualApproval','humanReview','transform','memory'].includes(selectedNode.type)">
            <label><span>Task ID</span><input :value="selectedNode.config?.task?.id" :disabled="readonly" @input="updateNodeConfig(['task', 'id'], ($event.target as HTMLInputElement).value)" /></label>
            <label><span>Queue</span><input :value="selectedNode.config?.task?.queue?.name" :disabled="readonly" @input="updateNodeConfig(['task', 'queue', 'name'], ($event.target as HTMLInputElement).value)" /></label>
            <div class="trigger-editor__field-grid">
              <label><span>Concurrency</span><input type="number" min="1" :value="selectedNode.config?.task?.queue?.concurrencyLimit" :disabled="readonly" @input="updateNodeConfig(['task', 'queue', 'concurrencyLimit'], Number(($event.target as HTMLInputElement).value) || undefined)" /></label>
              <label><span>Attempts</span><input type="number" min="0" :value="selectedNode.config?.task?.retry?.maxAttempts" :disabled="readonly" @input="updateNodeConfig(['task', 'retry', 'maxAttempts'], Number(($event.target as HTMLInputElement).value) || 0)" /></label>
            </div>
            <label><span>Idempotency key</span><input :value="selectedNode.config?.task?.idempotencyKey" :disabled="readonly" @input="updateNodeConfig(['task', 'idempotencyKey'], ($event.target as HTMLInputElement).value)" /></label>
          </template>

          <template v-if="selectedNode.type === 'manualApproval' || selectedNode.type === 'humanReview'">
            <label><span>Assignee type</span><select :value="selectedNode.config?.approval?.assigneeType ?? 'role'" :disabled="readonly" @change="updateNodeConfig(['approval', 'assigneeType'], ($event.target as HTMLSelectElement).value)"><option value="user">User</option><option value="role">Role</option><option value="team">Team</option><option value="expression">Expression</option></select></label>
            <label><span>Assignee IDs</span><input :value="selectedNode.config?.approval?.assigneeIds?.join(', ')" :disabled="readonly" @input="updateNodeConfig(['approval', 'assigneeIds'], ($event.target as HTMLInputElement).value.split(',').map((item) => item.trim()).filter(Boolean))" /></label>
            <label><span>On timeout</span><select :value="selectedNode.config?.approval?.onTimeout ?? 'fail'" :disabled="readonly" @change="updateNodeConfig(['approval', 'onTimeout'], ($event.target as HTMLSelectElement).value)"><option value="fail">Fail</option><option value="autoApprove">Auto approve</option><option value="autoReject">Auto reject</option><option value="continue">Continue</option></select></label>
          </template>

          <template v-if="selectedNode.type === 'wait'">
            <label><span>Mode</span><select :value="selectedNode.config?.wait?.mode ?? 'duration'" :disabled="readonly" @change="updateNodeConfig(['wait', 'mode'], ($event.target as HTMLSelectElement).value)"><option value="duration">Duration</option><option value="until">Until</option><option value="token">Token</option></select></label>
            <label v-if="selectedNode.config?.wait?.mode !== 'token' && selectedNode.config?.wait?.mode !== 'until'"><span>Duration</span><input :value="selectedNode.config?.wait?.duration" :disabled="readonly" @input="updateNodeConfig(['wait', 'duration'], ($event.target as HTMLInputElement).value)" /></label>
            <label v-if="selectedNode.config?.wait?.mode === 'until'"><span>Until</span><input type="datetime-local" :value="selectedNode.config?.wait?.until" :disabled="readonly" @input="updateNodeConfig(['wait', 'until'], ($event.target as HTMLInputElement).value)" /></label>
            <label v-if="selectedNode.config?.wait?.mode === 'token'"><span>Token key</span><input :value="selectedNode.config?.wait?.tokenKey" :disabled="readonly" @input="updateNodeConfig(['wait', 'tokenKey'], ($event.target as HTMLInputElement).value)" /></label>
          </template>

          <template v-if="selectedNode.type === 'dataSource' || selectedNode.type === 'dataSink' || selectedNode.type === 'batchTrigger'">
            <label><span>Connector</span><input :value="selectedNode.config?.data?.connector" :disabled="readonly" @input="updateNodeConfig(['data', 'connector'], ($event.target as HTMLInputElement).value)" /></label>
            <label><span>Operation</span><select :value="selectedNode.config?.data?.operation ?? 'sync'" :disabled="readonly" @change="updateNodeConfig(['data', 'operation'], ($event.target as HTMLSelectElement).value)"><option value="extract">Extract</option><option value="load">Load</option><option value="sync">Sync</option><option value="query">Query</option><option value="upsert">Upsert</option></select></label>
            <label><span>Source</span><input :value="selectedNode.config?.data?.source" :disabled="readonly" @input="updateNodeConfig(['data', 'source'], ($event.target as HTMLInputElement).value)" /></label>
            <label><span>Target</span><input :value="selectedNode.config?.data?.target" :disabled="readonly" @input="updateNodeConfig(['data', 'target'], ($event.target as HTMLInputElement).value)" /></label>
          </template>

          <template v-if="selectedNode.type === 'agent'">
            <div class="trigger-editor__field-grid">
              <label><span>Provider</span><select :value="selectedNode.config?.ai?.provider ?? 'openai'" :disabled="readonly" @change="updateNodeConfig(['ai', 'provider'], ($event.target as HTMLSelectElement).value)"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="custom">Custom</option></select></label>
              <label><span>Model</span><input :value="selectedNode.config?.ai?.model" :disabled="readonly" @input="updateNodeConfig(['ai', 'model'], ($event.target as HTMLInputElement).value)" /></label>
            </div>
            <label><span>System prompt</span><textarea :value="selectedNode.config?.ai?.prompt" :disabled="readonly" @input="updateNodeConfig(['ai', 'prompt'], ($event.target as HTMLTextAreaElement).value)" /></label>
          </template>

          <label>
            <span>Raw config</span>
            <textarea v-model="configDraft" class="trigger-editor__json" :disabled="readonly" />
          </label>
          <p v-if="configError" class="trigger-editor__error">{{ configError }}</p>
          <div class="trigger-editor__form-actions">
            <button type="button" :disabled="readonly" @click="applyConfigJson">Apply JSON</button>
            <button type="button" class="trigger-editor__danger" :disabled="readonly" @click="deleteSelection">Delete</button>
          </div>
        </div>

        <div v-else-if="selectedEdge" class="trigger-editor__form">
          <div class="trigger-editor__selected trigger-editor__selected--edge">
            <span>→</span>
            <div><strong>Edge</strong><small>{{ selectedEdge.source }} → {{ selectedEdge.target }}</small></div>
          </div>
          <label><span>Label</span><input :value="selectedEdge.name" :disabled="readonly" @input="updateSelectedEdgeName" /></label>
          <label><span>Condition</span><select v-model="selectedEdgeConditionType" :disabled="readonly"><option value="always">Always</option><option value="field">Field</option><option value="expression">Expression</option></select></label>
          <template v-if="selectedEdge.condition?.type === 'field'">
            <label><span>Field</span><input :value="selectedEdge.condition.field" :disabled="readonly" @input="updateSelectedEdgeConditionField('field', ($event.target as HTMLInputElement).value)" /></label>
            <label><span>Operator</span><select :value="selectedEdge.condition.operator" :disabled="readonly" @change="updateSelectedEdgeConditionField('operator', ($event.target as HTMLSelectElement).value)"><option v-for="operator in ['eq','ne','gt','gte','lt','lte','contains','in']" :key="operator">{{ operator }}</option></select></label>
            <label><span>Value</span><input :value="selectedEdge.condition.value" :disabled="readonly" @input="updateSelectedEdgeConditionField('value', ($event.target as HTMLInputElement).value)" /></label>
          </template>
          <label v-if="selectedEdge.condition?.type === 'expression'"><span>Expression</span><textarea :value="selectedEdge.condition.expression" :disabled="readonly" @input="updateSelectedEdgeConditionField('expression', ($event.target as HTMLTextAreaElement).value)" /></label>
          <button type="button" class="trigger-editor__danger" :disabled="readonly" @click="deleteSelection">Delete edge</button>
        </div>

        <div v-else class="trigger-editor__issues">
          <div class="trigger-editor__side-head">
            <strong>Validation</strong>
            <span>{{ issues.length }}</span>
          </div>
          <ul>
            <li v-for="issue in issues" :key="`${issue.path}-${issue.message}`" :class="{ 'trigger-editor__issue--error': issue.level === 'error' }">
              <span>{{ issue.path }}</span>
              <strong>{{ issue.message }}</strong>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.trigger-editor {
  --trigger-editor-height: 760px;
  display: grid;
  height: var(--trigger-editor-height);
  min-height: 620px;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #f7f9fc;
  color: #172033;
}

.trigger-editor__header {
  display: grid;
  grid-template-columns: minmax(230px, 1fr) auto auto;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid #d8dee8;
  background: #fff;
  padding: 12px 14px;
}

.trigger-editor__identity {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.trigger-editor__title,
.trigger-editor__code {
  width: 100%;
  border: 0;
  background: transparent;
  outline: 0;
}

.trigger-editor__title {
  color: #111827;
  font-size: 18px;
  font-weight: 800;
  line-height: 25px;
}

.trigger-editor__code {
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 16px;
}

.trigger-editor__kind,
.trigger-editor__tabs {
  display: inline-flex;
  border: 1px solid #d5dce7;
  border-radius: 7px;
  background: #f5f7fa;
  padding: 3px;
}

.trigger-editor__kind button,
.trigger-editor__tabs button {
  min-height: 30px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 5px 9px;
}

.trigger-editor__kind-button--active,
.trigger-editor__tab--active {
  background: #fff !important;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  color: #111827 !important;
}

.trigger-editor__actions,
.trigger-editor__form-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}

.trigger-editor__actions button,
.trigger-editor__form-actions button,
.trigger-editor__templates button,
.trigger-editor__danger {
  min-height: 32px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
  font-weight: 750;
  padding: 6px 10px;
}

.trigger-editor__actions button:disabled,
.trigger-editor button:disabled {
  cursor: not-allowed;
  opacity: 0.48;
}

.trigger-editor__primary {
  border-color: #2563eb !important;
  background: #2563eb !important;
  color: #fff !important;
}

.trigger-editor__danger {
  border-color: #fecaca !important;
  color: #b91c1c !important;
}

.trigger-editor__workspace {
  display: grid;
  min-height: 0;
  grid-template-columns: 220px minmax(520px, 1fr) 330px;
}

.trigger-editor__palette,
.trigger-editor__inspector {
  min-height: 0;
  overflow: auto;
  background: #fff;
  padding: 12px;
}

.trigger-editor__palette {
  border-right: 1px solid #d8dee8;
}

.trigger-editor__inspector {
  border-left: 1px solid #d8dee8;
}

.trigger-editor__side-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.trigger-editor__side-head strong {
  color: #111827;
  font-size: 13px;
}

.trigger-editor__side-head span {
  color: #64748b;
  font-size: 11px;
  font-weight: 750;
}

.trigger-editor__side-head--nodes {
  margin-top: 18px;
}

.trigger-editor__templates {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-top: 9px;
}

.trigger-editor__templates button {
  min-width: 0;
  padding: 5px 3px;
}

.trigger-editor__palette-list {
  display: grid;
  gap: 7px;
  margin-top: 9px;
}

.trigger-editor__palette-item {
  position: relative;
  display: grid;
  min-height: 48px;
  grid-template-columns: 36px minmax(0, 1fr) auto 10px;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--palette-border);
  border-radius: 7px;
  background: linear-gradient(90deg, var(--palette-soft), #fff 58%);
  color: #1f2937;
  cursor: pointer;
  padding: 7px 8px;
  text-align: left;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.trigger-editor__palette-item::after {
  width: 8px;
  height: 24px;
  border-right: 2px dotted color-mix(in srgb, var(--palette-accent) 46%, #cbd5e1);
  border-left: 2px dotted color-mix(in srgb, var(--palette-accent) 46%, #cbd5e1);
  content: '';
  opacity: 0.65;
}

.trigger-editor__palette-item:hover {
  border-color: var(--palette-accent);
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.1);
  transform: translateY(-1px);
}

.trigger-editor__palette-item:active {
  cursor: grabbing;
  transform: translateY(0);
}

.trigger-editor__palette-item > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--palette-border);
  border-radius: 6px;
  background: #fff;
  color: var(--palette-accent);
  font-size: 9px;
  font-weight: 900;
}

.trigger-editor__palette-item strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-editor__palette-item small {
  color: #94a3b8;
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
}

.trigger-editor__canvas {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background-color: #f8fafc;
  background-image: radial-gradient(circle, rgba(100, 116, 139, 0.22) 1px, transparent 1px);
  background-size: 20px 20px;
}

.trigger-editor__canvas-status {
  position: absolute;
  top: 10px;
  left: 12px;
  z-index: 5;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.08);
  color: #64748b;
  font-size: 11px;
  padding: 6px 8px;
}

.trigger-editor__canvas-status strong {
  color: #172033;
}

.trigger-editor__status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #16a34a;
}

.trigger-editor__status-dot--error {
  background: #dc2626;
}

.trigger-editor__flow {
  width: 100%;
  height: 100%;
}

.trigger-editor__tabs {
  display: flex;
  width: 100%;
  margin-bottom: 13px;
}

.trigger-editor__tabs button {
  flex: 1;
}

.trigger-editor__form {
  display: grid;
  gap: 11px;
}

.trigger-editor__selected {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid #e8edf4;
  padding-bottom: 11px;
}

.trigger-editor__selected > span {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--selected-border, #cbd5e1);
  border-radius: 7px;
  background: var(--selected-soft, #f8fafc);
  color: var(--selected-accent, #334155);
  font-size: 10px;
  font-weight: 900;
}

.trigger-editor__selected div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.trigger-editor__selected strong,
.trigger-editor__selected small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-editor__selected strong {
  font-size: 13px;
}

.trigger-editor__selected small {
  color: #64748b;
  font-size: 11px;
}

.trigger-editor__selected--edge > span {
  color: #2563eb;
}

.trigger-editor__form label {
  display: grid;
  gap: 5px;
}

.trigger-editor__form label > span {
  color: #475569;
  font-size: 11px;
  font-weight: 800;
}

.trigger-editor__form input,
.trigger-editor__form textarea,
.trigger-editor__form select,
.trigger-editor__compiled textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #111827;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  outline: 0;
  padding: 7px 8px;
}

.trigger-editor__form textarea {
  min-height: 62px;
  resize: vertical;
}

.trigger-editor__form input:focus,
.trigger-editor__form textarea:focus,
.trigger-editor__form select:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.trigger-editor__field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.trigger-editor__json {
  min-height: 160px !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 11px !important;
}

.trigger-editor__error {
  margin: -4px 0 0;
  color: #dc2626;
  font-size: 11px;
}

.trigger-editor__form-actions {
  justify-content: space-between;
}

.trigger-editor__compiled {
  height: calc(100% - 46px);
}

.trigger-editor__compiled textarea {
  height: 100%;
  min-height: 420px;
  resize: none;
  background: #0f172a;
  color: #dbeafe;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 17px;
}

.trigger-editor__issues ul {
  display: grid;
  gap: 7px;
  margin: 11px 0 0;
  padding: 0;
}

.trigger-editor__issues li {
  display: grid;
  gap: 3px;
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  list-style: none;
  padding: 7px 8px;
}

.trigger-editor__issues li span {
  font-size: 9px;
  font-weight: 850;
}

.trigger-editor__issues li strong {
  font-size: 11px;
  line-height: 16px;
}

.trigger-editor__issue--error {
  border-left-color: #dc2626 !important;
  background: #fef2f2 !important;
  color: #991b1b !important;
}

:deep(.vue-flow__node-trigger-workflow-node) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}

@media (max-width: 1100px) {
  .trigger-editor__workspace {
    grid-template-columns: 190px minmax(420px, 1fr) 300px;
  }
}

@media (max-width: 840px) {
  .trigger-editor {
    height: auto;
  }

  .trigger-editor__header {
    grid-template-columns: 1fr;
  }

  .trigger-editor__workspace {
    grid-template-columns: 1fr;
  }

  .trigger-editor__palette,
  .trigger-editor__inspector {
    max-height: 380px;
    border: 0;
    border-bottom: 1px solid #d8dee8;
  }

  .trigger-editor__canvas {
    min-height: 620px;
  }
}
</style>
