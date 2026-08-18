<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import LowCodeForm from '@enlearn/lowcode-framework/components/low-code-form';
import JsonDialogInput from '@enlearn/lowcode-framework/components/json-dialog-input';
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
  getTriggerNodeDefinitionsForKind,
  getTriggerNodeCategoryLabel
} from '../schema/registry';
import { validateTriggerWorkflow } from '../schema/validate';
import type {
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
import {
  createTriggerEdgeFormModel,
  createTriggerNodeFormModel,
  resolveTriggerEdgeFormSchema,
  resolveTriggerNodeFormSchema,
  type TriggerInspectorFormSchema,
  type TriggerNodeFormSchemaOverrides,
  updateTriggerEdgeFromFormField,
  updateTriggerNodeFromFormField
} from '../inspector-form';

const props = withDefaults(
  defineProps<{
    modelValue?: TriggerWorkflowModel;
    readonly?: boolean;
    height?: string;
    busy?: boolean;
    canRun?: boolean;
    nodeFormSchemas?: TriggerNodeFormSchemaOverrides;
    edgeFormSchema?: TriggerInspectorFormSchema;
    inspectorSchemasLoading?: boolean;
  }>(),
  {
    readonly: false,
    height: '760px',
    busy: false,
    canRun: false,
    inspectorSchemasLoading: false
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: TriggerWorkflowModel];
  change: [value: TriggerWorkflowModel];
  validation: [issues: TriggerWorkflowIssue[]];
  compile: [value: ReturnType<typeof compileTriggerWorkflow>];
  export: [value: TriggerWorkflowModel];
  'new-workflow': [];
  'save-workflow': [];
  'load-workflow': [];
  save: [];
  restore: [];
  copy: [];
  enable: [];
  run: [];
  refresh: [];
}>();

const kindOptions: Array<{ value: TriggerWorkflowKind; label: string }> = [
  { value: 'approval', label: '审批流' },
  { value: 'dataSync', label: '数据同步' },
  { value: 'aiAgent', label: 'AI 智能体' },
  { value: 'custom', label: '自定义' }
];

const flowId = `trigger-workflow-editor-${Math.random().toString(36).slice(2)}`;
const { fitView, screenToFlowCoordinate, setEdges, setNodes, zoomIn, zoomOut } = useVueFlow(flowId);
const fallbackModel = createApprovalTriggerWorkflow();
const currentModel = ref(prepareEditorModel(props.modelValue ?? fallbackModel));
const flowNodes = ref<TriggerCanvasNode[]>(triggerWorkflowToFlowNodes(currentModel.value));
const flowEdges = ref<TriggerFlowEdge[]>(triggerWorkflowToFlowEdges(currentModel.value));
const selectedNodeId = ref<string | null>(null);
const selectedEdgeId = ref<string | null>(null);
const activeInspectorTab = ref<'config' | 'compiled'>('config');
const syncing = ref(false);
const undoStack = ref<TriggerWorkflowModel[]>([]);
const redoStack = ref<TriggerWorkflowModel[]>([]);
const historyLimit = 50;
const historyDebounceMs = 500;
let dragStartSnapshot: TriggerWorkflowModel | undefined;
const pendingHistorySnapshot = ref<TriggerWorkflowModel>();
let pendingHistoryTimer: ReturnType<typeof setTimeout> | undefined;
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
const selectedCategoryLabel = computed(() =>
  selectedDefinition.value ? getTriggerNodeCategoryLabel(selectedDefinition.value.category) : '自定义节点'
);
const selectedNodeFormSchema = computed(() =>
  selectedNode.value
    ? resolveTriggerNodeFormSchema(selectedNode.value, props.nodeFormSchemas)
    : undefined
);
const selectedNodeFormModel = computed(() =>
  selectedNode.value ? createTriggerNodeFormModel(selectedNode.value) : {}
);
const selectedEdgeFormSchema = computed(() =>
  selectedEdge.value
    ? resolveTriggerEdgeFormSchema(selectedEdge.value, props.edgeFormSchema)
    : undefined
);
const selectedEdgeFormModel = computed(() =>
  selectedEdge.value ? createTriggerEdgeFormModel(selectedEdge.value) : {}
);
const selectedEdgeSummary = computed(() => {
  if (!selectedEdge.value) return '';
  const source = currentModel.value.nodes.find((node) => node.id === selectedEdge.value?.source)?.name;
  const target = currentModel.value.nodes.find((node) => node.id === selectedEdge.value?.target)?.name;
  return `${source ?? selectedEdge.value.source} → ${target ?? selectedEdge.value.target}`;
});
const canUndo = computed(
  () => !props.readonly && Boolean(undoStack.value.length || pendingHistorySnapshot.value)
);
const canRedo = computed(() => !props.readonly && redoStack.value.length > 0);
const canClearCanvas = computed(
  () => {
    if (props.readonly) return false;
    const startCount = currentModel.value.nodes.filter((node) => node.type === 'start').length;
    const endCount = currentModel.value.nodes.filter((node) => node.type === 'end').length;
    const hasWorkflowNodes = currentModel.value.nodes.some((node) => !isRequiredCanvasNode(node));
    return Boolean(currentModel.value.edges.length || hasWorkflowNodes || startCount !== 1 || endCount !== 1);
  }
);
const rootStyle = computed(() => ({ '--trigger-editor-height': props.height }));
if (currentModel.value.nodes.length) {
  selectedNodeId.value = currentModel.value.nodes[0].id;
}
if (props.modelValue && !modelsMatch(normalizeTriggerWorkflow(props.modelValue), currentModel.value)) {
  emitModel(currentModel.value);
}

watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;
    const normalized = normalizeTriggerWorkflow(value);
    const next = prepareEditorModel(normalized);
    const repairedRequiredNodes = !modelsMatch(normalized, next);
    if (modelsMatch(next, currentModel.value)) {
      if (repairedRequiredNodes) emitModel(next);
      return;
    }
    resetHistory();
    syncFromModel(next);
    if (repairedRequiredNodes) emitModel(currentModel.value);
  },
  { deep: true }
);

watch(
  [flowNodes, flowEdges],
  () => {
    if (syncing.value) return;
    const next = flowToTriggerWorkflow(currentModel.value, flowNodes.value, flowEdges.value);
    if (modelsMatch(next, currentModel.value)) return;
    currentModel.value = next;
    emitModel(next);
  },
  { deep: true }
);

function emitModel(model: TriggerWorkflowModel) {
  emit('update:modelValue', model);
  emit('change', model);
  emit('validation', validateTriggerWorkflow(model));
}

function syncFromModel(model: TriggerWorkflowModel) {
  syncing.value = true;
  currentModel.value = prepareEditorModel(model);
  if (!currentModel.value.edges.some((edge) => edge.id === selectedEdgeId.value)) {
    selectedEdgeId.value = null;
  }
  if (!currentModel.value.nodes.some((node) => node.id === selectedNodeId.value)) {
    selectedNodeId.value = null;
  }
  if (!selectedNodeId.value && !selectedEdgeId.value) {
    selectedNodeId.value = currentModel.value.nodes[0]?.id ?? null;
  }
  const nextFlowNodes = triggerWorkflowToFlowNodes(currentModel.value);
  const nextFlowEdges = triggerWorkflowToFlowEdges(currentModel.value);
  flowNodes.value = nextFlowNodes;
  flowEdges.value = nextFlowEdges;
  setNodes(nextFlowNodes);
  setEdges(nextFlowEdges);
  void nextTick(() => {
    syncing.value = false;
  });
}

function replaceModel(
  model: TriggerWorkflowModel,
  options: { recordHistory?: boolean; fitCanvas?: boolean; mergeHistory?: boolean } = {}
) {
  const next = prepareEditorModel(model);
  if (modelsMatch(next, currentModel.value)) return;
  if (options.recordHistory !== false) {
    if (options.mergeHistory) rememberMergedSnapshot(currentModel.value);
    else rememberSnapshot(currentModel.value);
  }
  syncFromModel(next);
  emitModel(currentModel.value);
  if (options.fitCanvas !== false) fitCanvas();
}

function setKind(kind: TriggerWorkflowKind) {
  if (props.readonly) return;
  replaceModel({ ...currentModel.value, kind }, { fitCanvas: false });
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
}

function onNodeDragStart(event: NodeMouseEvent) {
  if (props.readonly) return;
  const draggedNode = currentModel.value.nodes.find((node) => node.id === event.node.id);
  if (!draggedNode) return;
  dragStartSnapshot = cloneTriggerWorkflow({
    ...currentModel.value,
    nodes: currentModel.value.nodes.map((node) =>
      node.id === draggedNode.id
        ? { ...node, position: { ...event.node.position } }
        : node
    )
  });
}

function onNodeDragStop() {
  if (!dragStartSnapshot) return;
  const next = flowToTriggerWorkflow(currentModel.value, flowNodes.value, flowEdges.value);
  if (!modelsMatch(dragStartSnapshot, next)) {
    commitSnapshot(dragStartSnapshot);
    currentModel.value = next;
    emitModel(next);
  }
  dragStartSnapshot = undefined;
}

function onNodeContextMenu(event: NodeMouseEvent) {
  event.event.preventDefault();
  event.event.stopPropagation();
  const point = getClientPoint(event.event);
  const node = currentModel.value.nodes.find((item) => item.id === event.node.id);
  if (!node) return;
  const definition = getTriggerNodeDefinition(node.type);

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
          name: `${node.name} · ${definition?.label ?? '自定义节点'}`,
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
  const nextFlowEdges = [
    ...flowEdges.value,
    connectionToTriggerFlowEdge(connection, createEdgeId(connection.source, connection.target))
  ];
  replaceModel(
    flowToTriggerWorkflow(currentModel.value, flowNodes.value, nextFlowEdges),
    { fitCanvas: false }
  );
}

function deleteSelection() {
  if (props.readonly) return;
  if (selectedEdge.value) {
    replaceModel({
      ...currentModel.value,
      edges: currentModel.value.edges.filter((edge) => edge.id !== selectedEdge.value?.id)
    });
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
    name: `${node.name} 副本`,
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
}

function canDeleteNode(node: TriggerWorkflowNode) {
  return !['start', 'schedule', 'webhook', 'end'].includes(node.type);
}

function updateWorkflowField(field: 'code' | 'name', event: Event) {
  if (props.readonly) return;
  const value = (event.target as HTMLInputElement).value;
  replaceModel(
    { ...currentModel.value, [field]: value },
    { fitCanvas: false, mergeHistory: true }
  );
}

function updateSelectedNodeFromLowCodeForm(payload: {
  field: { field: string };
  value: unknown;
}) {
  const node = selectedNode.value;
  if (!node || props.readonly) return;
  let next = updateTriggerNodeFromFormField(node, payload.field.field, payload.value);
  if (payload.field.field === 'taskType') next = applyTaskTypeDefaults(next);
  replaceNode(next);
}

function updateSelectedEdgeFromLowCodeForm(payload: {
  field: { field: string };
  value: unknown;
}) {
  const edge = selectedEdge.value;
  if (!edge || props.readonly) return;
  replaceEdge(updateTriggerEdgeFromFormField(edge, payload.field.field, payload.value));
}

function replaceNode(node: TriggerWorkflowNode) {
  replaceModel({
    ...currentModel.value,
    nodes: currentModel.value.nodes.map((item) => (item.id === node.id ? node : item))
  });
}

function replaceEdge(edge: TriggerWorkflowModel['edges'][number]) {
  replaceModel({
    ...currentModel.value,
    edges: currentModel.value.edges.map((item) => (item.id === edge.id ? edge : item))
  });
}

function layout() {
  if (props.readonly || !flowNodes.value.length) return;
  const layoutNodes = autoLayoutTriggerFlowNodes(flowNodes.value, flowEdges.value);
  replaceModel(flowToTriggerWorkflow(currentModel.value, layoutNodes, flowEdges.value));
}

function fitCanvas() {
  void nextTick(() => fitView({ padding: 0.18, duration: 180 }));
}

function zoomInCanvas() {
  void zoomIn({ duration: 140 });
}

function zoomOutCanvas() {
  void zoomOut({ duration: 140 });
}

function undoCanvasChange() {
  flushPendingHistory();
  if (!canUndo.value) return;
  const previous = undoStack.value.at(-1);
  if (!previous) return;
  undoStack.value = undoStack.value.slice(0, -1);
  redoStack.value = appendSnapshot(redoStack.value, currentModel.value);
  applyHistorySnapshot(previous);
}

function redoCanvasChange() {
  if (!canRedo.value) return;
  const next = redoStack.value.at(-1);
  if (!next) return;
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = appendSnapshot(undoStack.value, currentModel.value);
  applyHistorySnapshot(next);
}

async function clearCanvas() {
  if (!canClearCanvas.value) return;
  const retainedNodes = createRequiredCanvasNodes();
  const nodeCount = currentModel.value.nodes.length - currentModel.value.nodes.filter(isRequiredCanvasNode).length;
  const edgeCount = currentModel.value.edges.length;
  const confirmResult = await VxeUI.modal.confirm({
    title: '清空画布',
    content: `确定清除画布中的 ${nodeCount} 个流程节点和 ${edgeCount} 条连接吗？开始节点和结束节点将保留或自动恢复，清空后可通过撤销恢复。`,
    confirmButtonText: '清空'
  });
  if (confirmResult !== 'confirm') return;

  selectedNodeId.value = retainedNodes.find((node) => node.type === 'start')?.id ?? retainedNodes[0]?.id ?? null;
  selectedEdgeId.value = null;
  activeInspectorTab.value = 'config';
  replaceModel(
    {
      ...currentModel.value,
      nodes: retainedNodes,
      edges: []
    },
    { fitCanvas: false }
  );
  fitCanvas();
  void VxeUI.modal.message({ content: '画布已清空，开始节点和结束节点已保留。', status: 'success' });
}

function createRequiredCanvasNodes() {
  const existingStart = currentModel.value.nodes.find((node) => node.type === 'start');
  const existingEnd = currentModel.value.nodes.find((node) => node.type === 'end');
  const start = existingStart ?? createConfiguredNode(
    'start',
    createNodeId('start'),
    getTriggerNodeDefinition('start')?.label ?? '开始',
    { x: 380, y: 40 }
  );
  const end = existingEnd ?? createConfiguredNode(
    'end',
    createNodeId('end'),
    getTriggerNodeDefinition('end')?.label ?? '结束',
    { x: 380, y: 360 }
  );
  return [start, end];
}

function isRequiredCanvasNode(node: TriggerWorkflowNode) {
  return node.type === 'start' || node.type === 'end';
}

function prepareEditorModel(value: unknown) {
  const model = normalizeTriggerWorkflow(value);
  const hasEntryNode = model.nodes.some(isEntryCanvasNode);
  const hasEndNode = model.nodes.some((node) => node.type === 'end');
  if (hasEntryNode && hasEndNode) return model;

  const nodes = [...model.nodes];
  if (!hasEntryNode) {
    nodes.unshift({
      id: createAvailableNodeId(nodes, 'start'),
      type: 'start',
      name: getTriggerNodeDefinition('start')?.label ?? '开始',
      position: { x: 380, y: 40 }
    });
  }
  if (!hasEndNode) {
    const lastNodeY = Math.max(200, ...nodes.map((node) => node.position?.y ?? 40));
    nodes.push({
      id: createAvailableNodeId(nodes, 'end'),
      type: 'end',
      name: getTriggerNodeDefinition('end')?.label ?? '结束',
      position: { x: 380, y: lastNodeY + 160 }
    });
  }

  return {
    ...model,
    nodes
  };
}

function isEntryCanvasNode(node: TriggerWorkflowNode) {
  return node.type === 'start' || node.type === 'schedule' || node.type === 'webhook';
}

function createAvailableNodeId(nodes: TriggerWorkflowNode[], preferredId: string) {
  const ids = new Set(nodes.map((node) => node.id));
  if (!ids.has(preferredId)) return preferredId;
  let suffix = 2;
  while (ids.has(`${preferredId}_${suffix}`)) suffix += 1;
  return `${preferredId}_${suffix}`;
}

function compile() {
  if (!compiledPlan.value) return;
  emit('compile', compiledPlan.value);
  activeInspectorTab.value = 'compiled';
}

function exportModel() {
  emit('export', cloneTriggerWorkflow(currentModel.value));
}

function rememberSnapshot(model: TriggerWorkflowModel) {
  flushPendingHistory();
  commitSnapshot(model);
}

function commitSnapshot(model: TriggerWorkflowModel) {
  undoStack.value = appendSnapshot(undoStack.value, model);
  redoStack.value = [];
}

function rememberMergedSnapshot(model: TriggerWorkflowModel) {
  if (!pendingHistorySnapshot.value) pendingHistorySnapshot.value = cloneTriggerWorkflow(model);
  if (pendingHistoryTimer) clearTimeout(pendingHistoryTimer);
  pendingHistoryTimer = setTimeout(flushPendingHistory, historyDebounceMs);
  redoStack.value = [];
}

function flushPendingHistory() {
  if (pendingHistoryTimer) clearTimeout(pendingHistoryTimer);
  pendingHistoryTimer = undefined;
  if (!pendingHistorySnapshot.value) return;
  commitSnapshot(pendingHistorySnapshot.value);
  pendingHistorySnapshot.value = undefined;
}

function appendSnapshot(stack: TriggerWorkflowModel[], model: TriggerWorkflowModel) {
  const snapshot = cloneTriggerWorkflow(model);
  const latest = stack.at(-1);
  if (latest && modelsMatch(latest, snapshot)) return stack;
  return [...stack, snapshot].slice(-historyLimit);
}

function applyHistorySnapshot(model: TriggerWorkflowModel) {
  syncFromModel(model);
  emitModel(currentModel.value);
  fitCanvas();
}

function resetHistory() {
  if (pendingHistoryTimer) clearTimeout(pendingHistoryTimer);
  undoStack.value = [];
  redoStack.value = [];
  dragStartSnapshot = undefined;
  pendingHistorySnapshot.value = undefined;
  pendingHistoryTimer = undefined;
}

function modelsMatch(left: TriggerWorkflowModel, right: TriggerWorkflowModel) {
  return JSON.stringify(left) === JSON.stringify(right);
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
    return {
      ...base,
      config: {
        task: {
          type: 'registeredTask',
          id: taskId,
          failureStrategy: 'failWorkflow',
          retry: { maxAttempts: 3 }
        }
      }
    };
  }
  if (type === 'manualApproval' || type === 'humanReview') {
    return {
      ...base,
      config: {
        task: { type: 'registeredTask', id: taskId, failureStrategy: 'failWorkflow' },
        approval: { assigneeType: 'role', assigneeIds: [], timeoutSeconds: 86400, onTimeout: 'fail' }
      }
    };
  }
  if (type === 'wait') return { ...base, config: { wait: { mode: 'duration', duration: 'PT1H' } } };
  if (type === 'dataSource' || type === 'dataSink') return { ...base, config: { task: { type: 'registeredTask', id: taskId }, data: { connector: 'http', operation: 'sync' } } };
  if (type === 'transform' || type === 'memory') return { ...base, config: { task: { type: 'registeredTask', id: taskId }, expression: '' } };
  if (type === 'agent') return { ...base, config: { task: { type: 'registeredTask', id: taskId }, ai: { provider: 'openai', model: 'gpt-4.1', prompt: '', maxTurns: 6 } } };
  if (type === 'schedule') return { ...base, config: { schedule: { cron: '0 8 * * *', timezone: 'Asia/Shanghai' } } };
  if (type === 'webhook') {
    return {
      ...base,
      config: {
        webhook: {
          path: '/api/service',
          method: 'POST',
          body: { serviceName: '', serviceMethod: '', postData: {} }
        }
      }
    };
  }
  return base;
}

function applyTaskTypeDefaults(node: TriggerWorkflowNode): TriggerWorkflowNode {
  const task = node.config?.task;
  if (!task?.type) return node;
  const nextTask = { ...task };

  if (task.type === 'storedProcedure' && !task.procedureSchema?.trim()) {
    nextTask.procedureSchema = 'public';
  }

  return {
    ...node,
    config: {
      ...node.config,
      task: nextTask
    }
  };
}

function createEdgeId(source: string, target: string) {
  sequence += 1;
  return `edge_${source}_${target}_${sequence}`;
}

function cloneTriggerWorkflowNode(node: TriggerWorkflowNode) {
  return JSON.parse(JSON.stringify(node)) as TriggerWorkflowNode;
}

function createNodeId(type: TriggerNodeType) {
  sequence += 1;
  return `${type}_${Date.now().toString(36)}_${sequence}`;
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
        <span class="trigger-editor__brand-icon"><i class="ri-git-branch-line" aria-hidden="true" /></span>
        <div>
          <input
            class="trigger-editor__title"
            :value="currentModel.name"
            :disabled="readonly"
            aria-label="工作流名称"
            @input="updateWorkflowField('name', $event)"
          />
          <input
            class="trigger-editor__code"
            :value="currentModel.code"
            :disabled="readonly"
            aria-label="工作流编码"
            @input="updateWorkflowField('code', $event)"
          />
        </div>
      </div>

      <div class="trigger-editor__file-actions" role="group" aria-label="流程文件操作">
        <button type="button" :disabled="busy || readonly" @click="emit('new-workflow')">
          <i class="ri-file-add-line" aria-hidden="true" />新建流程
        </button>
        <button type="button" :disabled="busy || readonly" @click="emit('save-workflow')">
          <i class="ri-save-3-line" aria-hidden="true" />保存流程
        </button>
        <button type="button" :disabled="busy" @click="emit('load-workflow')">
          <i class="ri-folder-open-line" aria-hidden="true" />加载流程
        </button>
      </div>

      <div class="trigger-editor__kind" role="tablist" aria-label="工作流类型">
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
        <button type="button" title="保存本地草稿" aria-label="保存本地草稿" @click="emit('save')"><i class="ri-save-3-line" /></button>
        <button type="button" title="恢复本地草稿" aria-label="恢复本地草稿" @click="emit('restore')"><i class="ri-history-line" /></button>
        <button type="button" title="复制工作流 JSON" aria-label="复制工作流 JSON" @click="emit('copy')"><i class="ri-file-copy-line" /></button>
        <span class="trigger-editor__action-divider" />
        <button type="button" title="导出工作流" aria-label="导出工作流" @click="exportModel"><i class="ri-download-line" /></button>
        <button type="button" class="trigger-editor__primary" :disabled="Boolean(errorCount)" @click="compile">
          <i class="ri-code-s-slash-line" />编译
        </button>
        <span class="trigger-editor__action-divider" />
        <button type="button" :disabled="busy || Boolean(errorCount)" title="编译当前流程并启用作业" @click="emit('enable')"><i class="ri-rocket-line" />启用</button>
        <button type="button" :disabled="busy || !canRun" title="手动触发一次" @click="emit('run')"><i class="ri-play-circle-line" />运行</button>
        <button type="button" :disabled="busy" title="刷新运行记录" aria-label="刷新运行记录" @click="emit('refresh')"><i :class="busy ? 'ri-loader-4-line trigger-editor__spin' : 'ri-refresh-line'" /></button>
      </div>
    </header>

    <div class="trigger-editor__workspace">
      <aside class="trigger-editor__palette">
        <div class="trigger-editor__side-head">
          <strong>流程模板</strong>
          <span>{{ kindOptions.find((item) => item.value === currentModel.kind)?.label }}</span>
        </div>
        <div class="trigger-editor__templates">
          <button type="button" :disabled="readonly" @click="loadTemplate('approval')">审批</button>
          <button type="button" :disabled="readonly" @click="loadTemplate('dataSync')">同步</button>
          <button type="button" :disabled="readonly" @click="loadTemplate('aiAgent')">智能体</button>
        </div>

        <div class="trigger-editor__side-head trigger-editor__side-head--nodes">
          <strong>可用节点</strong>
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
            <span><i :class="item.icon" aria-hidden="true" /></span>
            <strong>{{ item.label }}</strong>
            <small>{{ getTriggerNodeCategoryLabel(item.category) }}</small>
          </button>
        </div>
      </aside>

      <main class="trigger-editor__canvas" @dragover="onCanvasDragOver" @drop="onCanvasDrop">
        <div class="trigger-editor__canvas-topbar">
          <div class="trigger-editor__canvas-status">
            <span :class="{ 'trigger-editor__status-dot--error': errorCount }" class="trigger-editor__status-dot" />
            <strong>{{ errorCount ? `${errorCount} 个错误` : '校验通过' }}</strong>
            <span>{{ currentModel.nodes.length }} 个节点 · {{ currentModel.edges.length }} 条连接</span>
          </div>

          <div class="trigger-editor__canvas-tools" role="toolbar" aria-label="画布工具">
            <div class="trigger-editor__canvas-tool-group">
              <button type="button" :disabled="!canUndo" title="撤销" aria-label="撤销" @click="undoCanvasChange">
                <i class="ri-arrow-go-back-line" aria-hidden="true" />
              </button>
              <button type="button" :disabled="!canRedo" title="重做" aria-label="重做" @click="redoCanvasChange">
                <i class="ri-arrow-go-forward-line" aria-hidden="true" />
              </button>
            </div>
            <span class="trigger-editor__canvas-tool-divider" />
            <div class="trigger-editor__canvas-tool-group">
              <button type="button" title="缩小" aria-label="缩小" @click="zoomOutCanvas">
                <i class="ri-zoom-out-line" aria-hidden="true" />
              </button>
              <button type="button" title="放大" aria-label="放大" @click="zoomInCanvas">
                <i class="ri-zoom-in-line" aria-hidden="true" />
              </button>
              <button type="button" :disabled="!currentModel.nodes.length" title="适应画布" aria-label="适应画布" @click="fitCanvas">
                <i class="ri-focus-3-line" aria-hidden="true" />
              </button>
            </div>
            <span class="trigger-editor__canvas-tool-divider" />
            <div class="trigger-editor__canvas-tool-group">
              <button type="button" :disabled="readonly || !currentModel.nodes.length" title="自动整理节点" aria-label="自动整理节点" @click="layout">
                <i class="ri-layout-masonry-line" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="trigger-editor__canvas-tool--danger"
                :disabled="!canClearCanvas"
                title="清空画布"
                aria-label="清空画布"
                @click="clearCanvas"
              >
                <i class="ri-delete-bin-line" aria-hidden="true" />
              </button>
            </div>
          </div>
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
          @node-drag-start="onNodeDragStart"
          @node-drag-stop="onNodeDragStop"
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
            节点配置
          </button>
          <button
            type="button"
            :class="{ 'trigger-editor__tab--active': activeInspectorTab === 'compiled' }"
            @click="activeInspectorTab = 'compiled'"
          >
            编译结果
          </button>
        </div>

        <div v-if="activeInspectorTab === 'compiled'" class="trigger-editor__compiled">
          <JsonDialogInput
            :model-value="compiledText"
            name="compiledPlan"
            label="编译结果"
            title="查看编译结果 JSON"
            :rows="18"
            readonly
            standalone
            value-mode="string"
          />
        </div>

        <div v-else-if="selectedNode && selectedNodeFormSchema" class="trigger-editor__form">
          <div class="trigger-editor__selected">
            <span
              :style="{
                '--selected-accent': selectedDefinition?.accent,
                '--selected-soft': selectedDefinition?.accentSoft,
                '--selected-border': selectedDefinition?.accentBorder
              }"
            >
              <i :class="selectedDefinition?.icon" aria-hidden="true" />
            </span>
            <div>
              <strong>{{ selectedNode.name }}</strong>
              <small>{{ selectedCategoryLabel }} · {{ selectedDefinition?.label ?? '自定义节点' }}</small>
            </div>
          </div>

          <LowCodeForm
            :key="selectedNode.id"
            class="trigger-editor__low-code-form"
            :schema="selectedNodeFormSchema"
            :model-value="selectedNodeFormModel"
            :loading="inspectorSchemasLoading"
            :readonly="readonly"
            vertical
            size="mini"
            @field-change="updateSelectedNodeFromLowCodeForm"
          />
        </div>

        <div v-else-if="selectedEdge && selectedEdgeFormSchema" class="trigger-editor__form">
          <div class="trigger-editor__selected trigger-editor__selected--edge">
            <span><i class="ri-arrow-right-line" /></span>
            <div><strong>连接配置</strong><small>{{ selectedEdgeSummary }}</small></div>
          </div>
          <LowCodeForm
            :key="selectedEdge.id"
            class="trigger-editor__low-code-form"
            :schema="selectedEdgeFormSchema"
            :model-value="selectedEdgeFormModel"
            :loading="inspectorSchemasLoading"
            :readonly="readonly"
            vertical
            size="mini"
            @field-change="updateSelectedEdgeFromLowCodeForm"
          />
          <button type="button" class="trigger-editor__danger" :disabled="readonly" @click="deleteSelection">
            <i class="ri-delete-bin-line" />删除连接
          </button>
        </div>

        <div v-else class="trigger-editor__empty">
          <i class="ri-cursor-line" aria-hidden="true" />
          <strong>选择一个节点</strong>
          <span>节点配置会显示在这里</span>
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
  min-height: 560px;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #d7dee8;
  border-radius: 6px;
  background: #f5f7fa;
  color: #172033;
}

.trigger-editor__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  border-bottom: 1px solid #d8dee8;
  background: #fff;
  padding: 8px 10px;
}

.trigger-editor__identity {
  display: grid;
  min-width: 230px;
  flex: 1 1 260px;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
}

.trigger-editor__identity > div {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.trigger-editor__brand-icon {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  background: #e8f3ef;
  color: #08705d;
  font-size: 17px;
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
  font-size: 15px;
  font-weight: 700;
  line-height: 20px;
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
  border-radius: 6px;
  background: #f5f7fa;
  padding: 3px;
}

.trigger-editor__kind button,
.trigger-editor__tabs button {
  min-height: 28px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 9px;
}

.trigger-editor__kind-button--active,
.trigger-editor__tab--active {
  background: #fff !important;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.12);
  color: #111827 !important;
}

.trigger-editor__file-actions,
.trigger-editor__actions,
.trigger-editor__form-actions {
  display: flex;
  align-items: center;
  gap: 5px;
}

.trigger-editor__file-actions {
  flex: 1 1 260px;
}

.trigger-editor__actions {
  flex: 0 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-left: auto;
}

.trigger-editor__file-actions button,
.trigger-editor__actions button,
.trigger-editor__form-actions button,
.trigger-editor__templates button,
.trigger-editor__danger {
  min-height: 28px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  color: #334155;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  padding: 4px 8px;
}

.trigger-editor__file-actions button,
.trigger-editor__actions button,
.trigger-editor__danger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  white-space: nowrap;
}

.trigger-editor__actions button[aria-label] {
  width: 28px;
  padding: 4px;
}

.trigger-editor__file-actions button i,
.trigger-editor__actions button i,
.trigger-editor__danger i {
  font-size: 14px;
}

.trigger-editor__action-divider {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: #dde3eb;
}

.trigger-editor__file-actions button:disabled,
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
  grid-template-columns: 196px minmax(480px, 1fr) 480px;
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
  margin-top: 15px;
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
  gap: 5px;
  margin-top: 9px;
}

.trigger-editor__palette-item {
  position: relative;
  display: grid;
  min-height: 42px;
  grid-template-columns: 32px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: 1px solid var(--palette-border);
  border-radius: 7px;
  background: #fff;
  color: #1f2937;
  cursor: pointer;
  padding: 5px 7px;
  text-align: left;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

.trigger-editor__palette-item:hover {
  border-color: var(--palette-accent);
  box-shadow: 0 3px 10px rgba(15, 23, 42, 0.08);
}

.trigger-editor__palette-item:active {
  cursor: grabbing;
}

.trigger-editor__palette-item > span {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--palette-border);
  border-radius: 6px;
  background: #fff;
  color: var(--palette-accent);
  font-size: 15px;
}

.trigger-editor__palette-item strong {
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trigger-editor__palette-item small {
  grid-column: 2;
  color: #94a3b8;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0;
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

.trigger-editor__canvas-topbar {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  z-index: 5;
  pointer-events: none;
}

.trigger-editor__canvas-status {
  display: flex;
  min-height: 34px;
  align-items: center;
  gap: 7px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
  color: #64748b;
  font-size: 11px;
  padding: 6px 8px;
  pointer-events: auto;
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

.trigger-editor__canvas-tools,
.trigger-editor__canvas-tool-group {
  display: inline-flex;
  align-items: center;
}

.trigger-editor__canvas-tools {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  min-height: 34px;
  gap: 3px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.07);
  padding: 2px 3px;
  pointer-events: auto;
}

.trigger-editor__canvas-tool-group {
  gap: 2px;
}

.trigger-editor__canvas-tools button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #475569;
  cursor: pointer;
  font-size: 15px;
  padding: 0;
}

.trigger-editor__canvas-tools button:hover:not(:disabled) {
  background: #eef2f7;
  color: #0f172a;
}

.trigger-editor__canvas-tools button:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.trigger-editor__canvas-tools button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.trigger-editor__canvas-tools .trigger-editor__canvas-tool--danger {
  color: #b91c1c;
}

.trigger-editor__canvas-tools .trigger-editor__canvas-tool--danger:hover:not(:disabled) {
  background: #fef2f2;
  color: #991b1b;
}

.trigger-editor__canvas-tool-divider {
  width: 1px;
  height: 20px;
  margin: 0 2px;
  background: #dfe5ec;
}

.trigger-editor__flow {
  width: 100%;
  height: 100%;
}

.trigger-editor__tabs {
  display: flex;
  width: 100%;
  margin-bottom: 10px;
}

.trigger-editor__tabs button {
  flex: 1;
}

.trigger-editor__form {
  display: grid;
  gap: 10px;
}

.trigger-editor__selected {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid #e8edf4;
  padding-bottom: 9px;
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
  font-size: 17px;
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

.trigger-editor__form-actions {
  justify-content: space-between;
}

.trigger-editor__form-actions--end {
  justify-content: flex-end;
}

.trigger-editor__compiled {
  padding: 2px;
}

.trigger-editor__low-code-form :deep(.lc-form-layout),
.trigger-editor__low-code-form :deep(.lc-form-grid) {
  display: grid;
  gap: 7px;
}

.trigger-editor__low-code-form :deep(.vxe-form--item-title) {
  color: #536173;
  font-size: 11px;
  font-weight: 650;
}

.trigger-editor__low-code-form :deep(.vxe-input),
.trigger-editor__low-code-form :deep(.vxe-select),
.trigger-editor__low-code-form :deep(.vxe-number-input),
.trigger-editor__low-code-form :deep(.vxe-textarea) {
  width: 100%;
}

.trigger-editor__empty {
  display: grid;
  min-height: 180px;
  place-content: center;
  place-items: center;
  gap: 6px;
  color: #94a3b8;
  text-align: center;
}

.trigger-editor__empty i {
  font-size: 28px;
}

.trigger-editor__empty strong {
  color: #475569;
  font-size: 13px;
}

.trigger-editor__empty span {
  font-size: 11px;
}

.trigger-editor__spin {
  animation: trigger-editor-spin 0.8s linear infinite;
}

@keyframes trigger-editor-spin {
  to {
    transform: rotate(360deg);
  }
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
    grid-template-columns: 178px minmax(0, 1fr) 292px;
  }

  .trigger-editor__header {
    align-items: flex-start;
  }

  .trigger-editor__actions {
    flex: 1 1 100%;
    justify-content: flex-start;
    margin-left: 0;
  }

  .trigger-editor__canvas-tools {
    right: 0;
    left: auto;
    transform: none;
  }
}

@media (max-width: 920px) {
  .trigger-editor {
    height: auto;
  }

  .trigger-editor__header {
    align-items: stretch;
  }

  .trigger-editor__identity,
  .trigger-editor__file-actions,
  .trigger-editor__kind,
  .trigger-editor__actions {
    flex-basis: 100%;
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
