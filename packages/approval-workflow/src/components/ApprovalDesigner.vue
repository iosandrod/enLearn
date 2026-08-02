<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ConnectionLineType,
  useVueFlow,
  VueFlow,
  type Connection,
  type NodeDragEvent,
  type NodeMouseEvent
} from '@vue-flow/core';
import { VxeUI, type VxeContextMenuDefines } from 'vxe-pc-ui';
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import {
  normalizeWorkflowModel,
  validateWorkflowModel,
  type AssigneeStrategy,
  type WorkflowCondition,
  type WorkflowConditionOperator,
  type WorkflowEdge,
  type WorkflowModel,
  type WorkflowNode,
  type WorkflowNodeType,
  type WorkflowSchemaIssue
} from '@enlearn/workflow-schema';
import ApprovalFlowNodeCard from './ApprovalFlowNode.vue';
import { createSimpleApprovalWorkflow } from '../utils';
import {
  autoLayoutFlowNodes,
  connectionToWorkflowEdge,
  flowToWorkflowModel,
  getDefaultNodeName,
  getNodePresentation,
  getNodeTypePresentation,
  workflowToFlowEdges,
  workflowToFlowNodes,
  type ApprovalFlowEdge,
  type ApprovalFlowNode
} from '../flow-adapter';

const props = withDefaults(
  defineProps<{
    modelValue?: WorkflowModel;
    readonly?: boolean;
    showHeader?: boolean;
  }>(),
  {
    readonly: false,
    showHeader: true
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: WorkflowModel];
  change: [value: WorkflowModel];
  export: [value: WorkflowModel];
  validation: [issues: WorkflowSchemaIssue[]];
}>();

type PaletteItem = ReturnType<typeof getNodeTypePresentation> & {
  description: string;
};

type BranchRow = {
  edge: WorkflowEdge;
  index: number;
  targetName: string;
  conditionType: WorkflowCondition['type'];
  expression: string;
  field: string;
  operator: string;
  valueText: string;
  isFallback: boolean;
};

type PointerPaletteDrag = {
  type: WorkflowNodeType;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  active: boolean;
};

type WorkflowBuildSimulationOptions = {
  intervalMs?: number;
};

type NodeTypeMenuState = {
  visible: boolean;
  sourceId: string | null;
  x: number;
  y: number;
};

type NodeContextMenuAction = {
  key: string;
  label: string;
  icon: string;
  disabled?: boolean;
  danger?: boolean;
  separated?: boolean;
  run: () => void;
};

const paletteGroups: Array<{ title: string; items: PaletteItem[] }> = [
  {
    title: '人工节点',
    items: [
      createPaletteItem('approval', '单人、角色、主管、字段审批'),
      createPaletteItem('sign', '多人全部完成后流转'),
      createPaletteItem('orSign', '任一处理人完成即流转'),
      createPaletteItem('cc', '同步通知相关人员')
    ]
  },
  {
    title: '判断与并行',
    items: [
      createPaletteItem('condition', '按表达式或字段进入分支'),
      createPaletteItem('parallelGateway', '并行执行多个审批分支')
    ]
  },
  {
    title: '自动节点',
    items: [
      createPaletteItem('serviceTask', '调用业务服务或回写状态'),
      createPaletteItem('timer', '等待、超时、自动继续'),
      createPaletteItem('subProcess', '嵌套复用已有流程')
    ]
  }
];

const extensionItems: PaletteItem[] = [
  createPaletteItem('approval', '继续审批'),
  createPaletteItem('condition', '分支判断'),
  createPaletteItem('cc', '同步抄送'),
  createPaletteItem('serviceTask', '服务回调')
];

const conditionOperators = [
  { label: '=', value: 'eq' },
  { label: '!=', value: 'ne' },
  { label: '>', value: 'gt' },
  { label: '>=', value: 'gte' },
  { label: '<', value: 'lt' },
  { label: '<=', value: 'lte' },
  { label: '包含', value: 'contains' },
  { label: '属于', value: 'in' }
];

const dragMimeType = 'application/x-enlearn-workflow-node';
let localIdSequence = 0;

const fallbackModel = createSimpleApprovalWorkflow({
  type: 'initiatorManager',
  level: 1
});

const flowId = `approval-designer-${Math.random().toString(36).slice(2)}`;
const { fitView, project, zoomIn, zoomOut } = useVueFlow(flowId);

const currentModel = ref<WorkflowModel>(normalizeWorkflowModel(props.modelValue ?? fallbackModel));
const flowNodes = ref<ApprovalFlowNode[]>(workflowToFlowNodes(currentModel.value));
const flowEdges = ref<ApprovalFlowEdge[]>(workflowToFlowEdges(currentModel.value));
const isSyncingFromModel = ref(false);
const flowCanvasRef = ref<HTMLElement | null>(null);
const selectedNodeId = ref<string | null>(null);
const configDraft = ref('{}');
const configError = ref('');
const draggingPaletteType = ref<WorkflowNodeType | null>(null);
const isCanvasDragOver = ref(false);
const pointerPaletteDrag = ref<PointerPaletteDrag | null>(null);
const suppressNextPaletteClick = ref(false);
const nodeTypeMenu = ref<NodeTypeMenuState>({
  visible: false,
  sourceId: null,
  x: 0,
  y: 0
});

const connectionLineOptions = {
  type: ConnectionLineType.SmoothStep,
  style: {
    stroke: '#64748b',
    strokeWidth: 2.2
  }
};

const issues = computed(() => validateWorkflowModel(currentModel.value));
const errors = computed(() => issues.value.filter((issue) => issue.level === 'error'));
const warnings = computed(() => issues.value.filter((issue) => issue.level === 'warning'));
const selectedNode = computed(() => currentModel.value.nodes.find((node) => node.id === selectedNodeId.value));
const selectedFlowNode = computed(() => flowNodes.value.find((node) => node.id === selectedNodeId.value));
const selectedPresentation = computed(() => (selectedNode.value ? getNodePresentation(selectedNode.value) : undefined));
const selectedOutgoingEdges = computed(() => {
  if (!selectedNode.value) return [];

  return currentModel.value.edges.filter((edge) => edge.source === selectedNode.value?.id);
});
const targetNodeOptions = computed(() => currentModel.value.nodes.filter((node) => node.id !== selectedNodeId.value && node.type !== 'start'));
const conditionBranches = computed<BranchRow[]>(() => {
  if (selectedNode.value?.type !== 'condition') return [];

  return selectedOutgoingEdges.value.map((edge, index) => {
    const condition = edge.condition ?? { type: 'always' as const };

    return {
      edge,
      index,
      targetName: getNodeNameById(edge.target),
      conditionType: condition.type,
      expression: condition.type === 'expression' ? condition.expression ?? '' : '',
      field: condition.type === 'field' ? condition.field ?? '' : '',
      operator: condition.type === 'field' ? condition.operator ?? 'eq' : 'eq',
      valueText: condition.type === 'field' ? formatBranchValue(condition.value) : '',
      isFallback: condition.type === 'always'
    };
  });
});
const canEditSelectedNode = computed(
  () => Boolean(selectedNode.value && selectedNode.value.type !== 'start' && selectedNode.value.type !== 'end' && !props.readonly)
);
const canExtendSelectedNode = computed(() => Boolean(selectedNode.value && selectedNode.value.type !== 'end' && !props.readonly));
const canGenerateConditionTemplate = computed(
  () =>
    Boolean(
      selectedNode.value?.type === 'condition' &&
        (selectedOutgoingEdges.value.length < 2 || !selectedOutgoingEdges.value.some((edge) => edge.condition?.type === 'always')) &&
        !props.readonly
    )
);
function buildContextMenuActions(node: WorkflowNode) {
  const actions: NodeContextMenuAction[] = [];
  const canExtend = node.type !== 'end' && !props.readonly;
  const canEdit = node.type !== 'start' && node.type !== 'end' && !props.readonly;

  if (canExtend) {
    actions.push(
      ...extensionItems.map((item) => ({
        key: `extend-${item.type}`,
        label: `延伸${item.label}`,
        icon: item.icon,
        run: () => extendFromNode(node.id, item.type)
      }))
    );
  }

  if (node.type === 'condition') {
    actions.push(
      {
        key: 'condition-repair',
        label: '生成/修复双分支',
        icon: 'IF',
        separated: true,
        disabled: props.readonly,
        run: () => repairConditionBranches(node.id)
      },
      {
        key: 'condition-add-branch',
        label: '追加条件审批分支',
        icon: '+',
        disabled: props.readonly,
        run: () => extendFromNode(node.id, 'approval')
      }
    );
  }

  if (node.type === 'parallelGateway') {
    actions.push(
      {
        key: 'parallel-repair',
        label: '生成/修复并行分支',
        icon: '||',
        separated: true,
        disabled: props.readonly,
        run: () => repairParallelBranches(node.id)
      },
      {
        key: 'parallel-add-approval',
        label: '追加并行审批',
        icon: 'A',
        disabled: props.readonly,
        run: () => extendFromNode(node.id, 'approval')
      },
      {
        key: 'parallel-add-service',
        label: '追加服务分支',
        icon: 'API',
        disabled: props.readonly,
        run: () => extendFromNode(node.id, 'serviceTask')
      }
    );
  }

  if (isHumanNodeType(node.type) || node.type === 'cc') {
    actions.push(
      {
        key: 'assignee-manager',
        label: '处理人：发起人主管',
        icon: 'M',
        separated: true,
        disabled: !canEdit,
        run: () => setAssigneePreset(node.id, 'manager')
      },
      {
        key: 'assignee-role',
        label: '处理人：审批角色',
        icon: 'R',
        disabled: !canEdit,
        run: () => setAssigneePreset(node.id, 'role')
      },
      {
        key: 'assignee-users',
        label: '处理人：指定用户',
        icon: 'U',
        disabled: !canEdit,
        run: () => setAssigneePreset(node.id, 'users')
      }
    );
  }

  if (node.type === 'approval') {
    actions.push(
      {
        key: 'convert-sign',
        label: '转换为会签',
        icon: 'ALL',
        disabled: !canEdit,
        run: () => convertHumanNode(node.id, 'sign')
      },
      {
        key: 'convert-or-sign',
        label: '转换为或签',
        icon: 'ANY',
        disabled: !canEdit,
        run: () => convertHumanNode(node.id, 'orSign')
      }
    );
  }

  if (node.type === 'sign' || node.type === 'orSign') {
    actions.push(
      {
        key: 'completion-all',
        label: '完成规则：全部通过',
        icon: 'ALL',
        disabled: !canEdit,
        run: () => setSignCompletion(node.id, 'all')
      },
      {
        key: 'completion-any',
        label: '完成规则：任一通过',
        icon: 'ANY',
        disabled: !canEdit,
        run: () => setSignCompletion(node.id, 'any')
      }
    );
  }

  if (node.type === 'serviceTask') {
    actions.push(
      {
        key: 'service-order-sync',
        label: '服务：回写订单状态',
        icon: 'API',
        separated: true,
        disabled: !canEdit,
        run: () => setServicePreset(node.id, 'orderSync')
      },
      {
        key: 'service-lock-inventory',
        label: '服务：锁定库存',
        icon: 'API',
        disabled: !canEdit,
        run: () => setServicePreset(node.id, 'lockInventory')
      }
    );
  }

  if (node.type === 'timer') {
    actions.push(
      {
        key: 'timer-now',
        label: '定时：立即继续',
        icon: 'T',
        separated: true,
        disabled: !canEdit,
        run: () => setTimerPreset(node.id, 0)
      },
      {
        key: 'timer-hour',
        label: '定时：等待 1 小时',
        icon: '1H',
        disabled: !canEdit,
        run: () => setTimerPreset(node.id, 3600)
      }
    );
  }

  if (node.type === 'subProcess') {
    actions.push({
      key: 'subprocess-contract',
      label: '子流程：合同归档',
      icon: 'SUB',
      separated: true,
      disabled: !canEdit,
      run: () => setSubProcessPreset(node.id)
    });
  }

  actions.push(
    {
      key: 'duplicate',
      label: '复制并接入流程',
      icon: 'CP',
      separated: true,
      disabled: !canEdit,
      run: () => duplicateNodeById(node.id)
    },
    {
      key: 'delete',
      label: '删除节点',
      icon: '×',
      danger: true,
      disabled: !canEdit,
      run: () => deleteNodeById(node.id)
    }
  );

  return actions;
}
const draggingPaletteLabel = computed(() => {
  if (!draggingPaletteType.value) return '';

  return getDefaultNodeName(draggingPaletteType.value);
});
const pointerDragStyle = computed(() => {
  const drag = pointerPaletteDrag.value;

  return drag
    ? {
        left: `${drag.currentX + 12}px`,
        top: `${drag.currentY + 12}px`
      }
    : {};
});
const selectedSubtitle = computed(() => {
  if (!selectedNode.value || !selectedPresentation.value) return '';
  if (selectedNode.value.name === selectedPresentation.value.typeLabel) return selectedPresentation.value.categoryLabel;

  return `${selectedPresentation.value.typeLabel} · ${selectedPresentation.value.categoryLabel}`;
});
const canvasSubtitle = computed(
  () => selectedPresentation.value?.summary ?? `${currentModel.value.nodes.length} 节点 · ${currentModel.value.edges.length} 连线`
);
const publishStateText = computed(() => {
  if (errors.value.length) return `${errors.value.length} 个错误`;
  if (warnings.value.length) return `${warnings.value.length} 个提醒`;

  return '可发布';
});

watch(
  () => props.modelValue,
  (value) => {
    syncFromModel(value ?? fallbackModel);
  },
  {
    deep: true,
    immediate: true
  }
);

watch(
  [flowNodes, flowEdges],
  () => {
    if (isSyncingFromModel.value) return;

    const nextModel = flowToWorkflowModel(currentModel.value, flowNodes.value, flowEdges.value);
    currentModel.value = nextModel;
    ensureSelectedNodeExists();
    emitModel(nextModel);
  },
  {
    deep: true
  }
);

watch(
  selectedNode,
  (node) => {
    configDraft.value = JSON.stringify(node?.config ?? {}, null, 2);
    configError.value = '';
  },
  {
    immediate: true
  }
);

onMounted(() => {
  window.addEventListener('click', closeFloatingMenus);
  window.addEventListener('keydown', onWindowKeyDown);
  window.addEventListener('resize', closeFloatingMenus);
});

onBeforeUnmount(() => {
  window.removeEventListener('click', closeFloatingMenus);
  window.removeEventListener('keydown', onWindowKeyDown);
  window.removeEventListener('resize', closeFloatingMenus);
  window.removeEventListener('pointermove', onPalettePointerMove);
});

function emitModel(nextModel: WorkflowModel) {
  emit('update:modelValue', nextModel);
  emit('change', nextModel);
  emit('validation', validateWorkflowModel(nextModel));
}

function syncFromModel(nextModel: WorkflowModel) {
  isSyncingFromModel.value = true;
  currentModel.value = normalizeWorkflowModel(nextModel);
  flowNodes.value = workflowToFlowNodes(currentModel.value);
  flowEdges.value = workflowToFlowEdges(currentModel.value);
  ensureSelectedNodeExists();
  void nextTick(() => {
    isSyncingFromModel.value = false;
  });
}

function replaceModel(nextModel: WorkflowModel) {
  const normalizedModel = normalizeWorkflowModel(nextModel);

  syncFromModel(normalizedModel);
  emitModel(normalizedModel);
}

function loadSchema(nextModel: WorkflowModel) {
  replaceModel(nextModel);
  scheduleAutoLayout();
}

function updateName(event: Event) {
  if (props.readonly) return;

  const target = event.target as HTMLInputElement;
  const nextModel = {
    ...currentModel.value,
    name: target.value
  };
  currentModel.value = nextModel;
  emitModel(nextModel);
}

function resetSimpleWorkflow() {
  if (props.readonly) return;

  selectedNodeId.value = 'approval';
  replaceModel(
    createSimpleApprovalWorkflow(
      {
        type: 'initiatorManager',
        level: 1
      },
      {
        code: currentModel.value.code,
        name: currentModel.value.name,
        documentType: currentModel.value.documentType
      }
    )
  );
  void fitViewSafe();
}

function exportModel() {
  emit('export', currentModel.value);
}

function onPaletteClick(type: WorkflowNodeType) {
  if (suppressNextPaletteClick.value) {
    suppressNextPaletteClick.value = false;
    return;
  }

  addNode(type);
}

function addNode(type: WorkflowNodeType) {
  if (props.readonly || type === 'start' || type === 'end') return;

  const sourceId = getInsertionSourceId();
  const sourceFlowNode = sourceId ? flowNodes.value.find((node) => node.id === sourceId) : undefined;
  const position = {
    x: sourceFlowNode?.position.x ?? 330,
    y: (sourceFlowNode?.position.y ?? 48) + 142
  };

  addNodeFromSource(type, sourceId, position);
}

function addNodeFromSource(type: WorkflowNodeType, sourceId: string | undefined, position: { x: number; y: number }) {
  if (props.readonly || type === 'start' || type === 'end') return;

  const nextNode = createConfiguredWorkflowNode(type, position);
  const edgePlan = createEdgesForNewNode(sourceId, nextNode.id, currentModel.value.edges);
  const nextModel = createModelWithInsertedNode(nextNode, edgePlan);
  const nextModelWithScaffold = createModelWithNodeScaffold(nextModel, nextNode.id, type);

  selectedNodeId.value = nextNode.id;
  replaceModel(nextModelWithScaffold);
  scheduleAutoLayout();
}

function addNodeAtPosition(type: WorkflowNodeType, position: { x: number; y: number }) {
  if (props.readonly || type === 'start' || type === 'end') return;

  const sourceId = canExtendSelectedNode.value ? selectedNode.value?.id : getInsertionSourceId();
  addNodeFromSource(type, sourceId, position);
}

function extendSelectedNode(type: WorkflowNodeType) {
  if (!canExtendSelectedNode.value || !selectedNode.value || props.readonly) return;

  extendFromNode(selectedNode.value.id, type);
}

function extendFromNode(sourceId: string, type: WorkflowNodeType) {
  if (props.readonly || type === 'start' || type === 'end') return;

  const sourceNode = currentModel.value.nodes.find((node) => node.id === sourceId);
  if (!sourceNode || sourceNode.type === 'end') return;

  const sourceFlowNode = flowNodes.value.find((node) => node.id === sourceId);
  const outgoingCount = currentModel.value.edges.filter((edge) => edge.source === sourceId).length;
  const branchOffset = sourceNode.type === 'condition' || sourceNode.type === 'parallelGateway'
    ? (outgoingCount - 0.5) * 280
    : 0;
  const position = {
    x: (sourceFlowNode?.position.x ?? sourceNode.position?.x ?? 330) + branchOffset,
    y: (sourceFlowNode?.position.y ?? sourceNode.position?.y ?? 190) + 150
  };

  addNodeFromSource(type, sourceId, position);
}

function createConfiguredWorkflowNode(
  type: WorkflowNodeType,
  position: { x: number; y: number },
  options: { name?: string } = {}
): WorkflowNode {
  return {
    id: createNodeId(type),
    type,
    name: options.name ?? getDefaultNodeName(type),
    position,
    ...createNodeConfig(type)
  };
}

function createEdgesForNewNode(sourceId: string | undefined, nodeId: string, edges: WorkflowEdge[]) {
  if (!sourceId) {
    return {
      edges: [...edges],
      insertBeforeTargetId: undefined
    };
  }

  const sourceNode = currentModel.value.nodes.find((node) => node.id === sourceId);
  if (!sourceNode || sourceNode.type === 'end') {
    return {
      edges: [...edges],
      insertBeforeTargetId: undefined
    };
  }

  const outgoingEdges = edges.filter((edge) => edge.source === sourceId);
  const outgoingEdge = outgoingEdges.length === 1 ? outgoingEdges[0] : undefined;
  const shouldInsertBetween = !isBranchingNode(sourceNode.type) && Boolean(outgoingEdge);
  const edgeOptions = createOutgoingEdgeOptions(sourceNode, outgoingEdges);

  if (isBranchingNode(sourceNode.type)) {
    const downstreamTargetId = getBranchDownstreamTarget(sourceId, edges) ?? getDefaultEndNodeId();
    const branchEdges = [createWorkflowEdge(sourceId, nodeId, edgeOptions)];

    if (downstreamTargetId && downstreamTargetId !== nodeId) {
      branchEdges.push(createWorkflowEdge(nodeId, downstreamTargetId));
    }

    return {
      insertBeforeTargetId: downstreamTargetId,
      edges: [...edges, ...branchEdges]
    };
  }

  if (shouldInsertBetween && outgoingEdge) {
    return {
      insertBeforeTargetId: outgoingEdge.target,
      edges: [
        ...edges.filter((edge) => edge.id !== outgoingEdge.id),
        createWorkflowEdge(sourceId, nodeId, edgeOptions),
        createWorkflowEdge(nodeId, outgoingEdge.target)
      ]
    };
  }

  return {
    edges: [...edges, createWorkflowEdge(sourceId, nodeId, edgeOptions)],
    insertBeforeTargetId: undefined
  };
}

function createModelWithNodeScaffold(model: WorkflowModel, nodeId: string, type: WorkflowNodeType) {
  if (type === 'condition') return createModelWithConditionBranches(model, nodeId);
  if (type === 'parallelGateway') return createModelWithParallelBranches(model, nodeId);

  return model;
}

function createModelWithInsertedNode(
  nextNode: WorkflowNode,
  edgePlan: ReturnType<typeof createEdgesForNewNode>
): WorkflowModel {
  return {
    ...currentModel.value,
    nodes: insertNodeBeforeTarget(currentModel.value.nodes, nextNode, edgePlan.insertBeforeTargetId),
    edges: edgePlan.edges
  };
}

function createOutgoingEdgeOptions(sourceNode: WorkflowNode, outgoingEdges: WorkflowEdge[]): Partial<Pick<WorkflowEdge, 'condition' | 'name'>> {
  if (sourceNode.type !== 'condition') return {};

  const hasFallback = outgoingEdges.some((edge) => edge.condition?.type === 'always');
  if (!hasFallback && outgoingEdges.length > 0) {
    return {
      name: '默认分支',
      condition: {
        type: 'always'
      }
    };
  }

  return {
    name: `条件分支 ${outgoingEdges.length + 1}`,
    condition: createDefaultBranchCondition()
  };
}

function createNodeConfig(type: WorkflowNodeType): Pick<WorkflowNode, 'config'> | Record<string, never> {
  if (type === 'approval') {
    return {
      config: {
        assigneeStrategy: {
          type: 'initiatorManager',
          level: 1
        },
        allowReject: true,
        allowTransfer: true
      }
    };
  }

  if (type === 'sign' || type === 'orSign') {
    return {
      config: {
        assigneeStrategy: {
          type: 'users',
          userIds: ['user-1', 'user-2']
        },
        completionStrategy: type === 'orSign' ? 'any' : 'all',
        sequential: type === 'sign',
        allowReject: true
      }
    };
  }

  if (type === 'condition') {
    return {
      config: {
        expression: ''
      }
    };
  }

  if (type === 'cc') {
    return {
      config: {
        assigneeStrategy: {
          type: 'initiatorManager',
          level: 1
        }
      }
    };
  }

  if (type === 'parallelGateway') {
    return {
      config: {
        joinMode: 'all'
      }
    };
  }

  if (type === 'serviceTask') {
    return {
      config: {
        serviceName: 'document',
        serviceMethod: 'syncApprovalStatus'
      }
    };
  }

  if (type === 'timer') {
    return {
      config: {
        delaySeconds: 0,
        action: 'continue'
      }
    };
  }

  if (type === 'subProcess') {
    return {
      config: {
        definitionCode: ''
      }
    };
  }

  return {};
}

function onPaletteDragStart(event: DragEvent, item: PaletteItem) {
  if (props.readonly) return;

  draggingPaletteType.value = item.type;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.dropEffect = 'copy';
    event.dataTransfer.setData(dragMimeType, item.type);
    event.dataTransfer.setData('text/plain', item.type);
  }
}

function onPaletteDragEnd() {
  draggingPaletteType.value = null;
  isCanvasDragOver.value = false;
}

function onPalettePointerDown(event: PointerEvent, item: PaletteItem) {
  if (props.readonly || event.button !== 0) return;

  pointerPaletteDrag.value = {
    type: item.type,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    active: false
  };
  draggingPaletteType.value = item.type;
  window.addEventListener('pointermove', onPalettePointerMove);
  window.addEventListener('pointerup', onPalettePointerUp, { once: true });
}

function onPalettePointerMove(event: PointerEvent) {
  const drag = pointerPaletteDrag.value;
  if (!drag) return;

  const distance = Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY);
  const isActive = drag.active || distance > 6;

  pointerPaletteDrag.value = {
    ...drag,
    currentX: event.clientX,
    currentY: event.clientY,
    active: isActive
  };

  if (isActive) {
    event.preventDefault();
    isCanvasDragOver.value = isPointInCanvas(event.clientX, event.clientY);
  }
}

function onPalettePointerUp(event: PointerEvent) {
  const drag = pointerPaletteDrag.value;

  window.removeEventListener('pointermove', onPalettePointerMove);
  pointerPaletteDrag.value = null;
  isCanvasDragOver.value = false;
  draggingPaletteType.value = null;

  if (!drag?.active) return;

  suppressNextPaletteClick.value = true;
  window.setTimeout(() => {
    suppressNextPaletteClick.value = false;
  }, 0);

  if (isPointInCanvas(event.clientX, event.clientY)) {
    addNodeAtPosition(drag.type, getDropPositionFromClient(event.clientX, event.clientY, drag.type));
  }
}

function onCanvasDragOver(event: DragEvent) {
  if (props.readonly || !readDraggedNodeType(event.dataTransfer)) return;

  event.preventDefault();
  isCanvasDragOver.value = true;
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'copy';
  }
}

function onCanvasDragLeave(event: DragEvent) {
  const nextTarget = event.relatedTarget;
  if (nextTarget instanceof Node && event.currentTarget instanceof HTMLElement && event.currentTarget.contains(nextTarget)) return;

  isCanvasDragOver.value = false;
}

function onCanvasDrop(event: DragEvent) {
  if (props.readonly) return;

  const type = readDraggedNodeType(event.dataTransfer);
  if (!type || type === 'start' || type === 'end') return;

  event.preventDefault();
  isCanvasDragOver.value = false;
  draggingPaletteType.value = null;
  addNodeAtPosition(type, getDropPosition(event, type));
}

function readDraggedNodeType(dataTransfer: DataTransfer | null) {
  const value = dataTransfer?.getData(dragMimeType) || dataTransfer?.getData('text/plain') || draggingPaletteType.value || '';
  const paletteTypes = new Set(paletteGroups.flatMap((group) => group.items.map((item) => item.type)));

  return paletteTypes.has(value as WorkflowNodeType) ? (value as WorkflowNodeType) : null;
}

function getDropPosition(event: DragEvent, type: WorkflowNodeType) {
  return getDropPositionFromClient(event.clientX, event.clientY, type);
}

function getDropPositionFromClient(clientX: number, clientY: number, type: WorkflowNodeType) {
  const bounds = flowCanvasRef.value?.getBoundingClientRect();
  const size = getNodeDraftSize(type);
  const localPosition = bounds
    ? {
        x: clientX - bounds.left,
        y: clientY - bounds.top
      }
    : {
        x: clientX,
        y: clientY
      };
  const projectedPosition = project(localPosition);

  return {
    x: Math.round(projectedPosition.x - size.width / 2),
    y: Math.round(projectedPosition.y - size.height / 2)
  };
}

function isPointInCanvas(clientX: number, clientY: number) {
  const bounds = flowCanvasRef.value?.getBoundingClientRect();
  if (!bounds) return false;

  return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
}

function onConnect(connection: Connection) {
  if (props.readonly || !connection.source || !connection.target) return;
  if (connection.source === connection.target) return;

  const sourceNode = currentModel.value.nodes.find((node) => node.id === connection.source);
  const targetNode = currentModel.value.nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode || sourceNode.type === 'end' || targetNode.type === 'start') return;

  const hasDuplicate = flowEdges.value.some(
    (edge) => edge.source === connection.source && edge.target === connection.target
  );
  if (hasDuplicate) return;

  const edgeId = createEdgeId(connection.source, connection.target);
  const nextEdge = connectionToWorkflowEdge(connection, edgeId);
  const edgeOptions = createOutgoingEdgeOptions(
    sourceNode,
    currentModel.value.edges.filter((edge) => edge.source === sourceNode.id)
  );

  flowEdges.value = [
    ...flowEdges.value,
    {
      ...nextEdge,
      label: edgeOptions.name,
      data: {
        condition: edgeOptions.condition
      }
    }
  ];
  scheduleAutoLayout();
}

function onNodeClick(payload: NodeMouseEvent) {
  selectedNodeId.value = payload.node.id;
}

function onNodeDragStop(payload: NodeDragEvent) {
  selectedNodeId.value = payload.node.id;
}

function onPaneClick() {
  selectedNodeId.value = null;
  closeFloatingMenus();
}

function openNodeContextMenu(event: MouseEvent, nodeId: string) {
  if (props.readonly) return;

  event.preventDefault();
  event.stopPropagation();
  const node = currentModel.value.nodes.find((item) => item.id === nodeId);
  if (!node) return;

  selectedNodeId.value = nodeId;
  closeNodeTypeMenu();
  const optionGroups: VxeContextMenuDefines.MenuFirstOption[][] = [
    [
      {
        code: 'node-summary',
        name: `${node.name} · ${node.type}`,
        disabled: true
      }
    ]
  ];

  for (const action of buildContextMenuActions(node)) {
    if (action.separated || optionGroups.length === 1) {
      optionGroups.push([]);
    }
    optionGroups.at(-1)?.push({
      code: action.key,
      name: action.label,
      disabled: action.disabled,
      className: action.danger ? 'enlearn-context-menu-option--danger' : undefined,
      prefixConfig: {
        content: action.icon
      },
      params: action
    });
  }

  VxeUI.contextMenu.open({
    x: event.clientX,
    y: event.clientY,
    className: 'enlearn-context-menu',
    options: optionGroups,
    events: {
      optionClick({ option }) {
        const action = option.params as NodeContextMenuAction | undefined;
        if (action && !action.disabled) action.run();
      }
    }
  });
}

function openNodeTypeMenu(event: MouseEvent, sourceId: string) {
  if (props.readonly) return;

  const sourceNode = currentModel.value.nodes.find((node) => node.id === sourceId);
  if (!sourceNode || sourceNode.type === 'end') return;

  event.preventDefault();
  event.stopPropagation();
  selectedNodeId.value = sourceId;
  closeContextMenu();
  const menuWidth = 286;
  const menuHeight = 430;

  nodeTypeMenu.value = {
    visible: true,
    sourceId,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8))
  };
}

function closeContextMenu() {
  VxeUI.contextMenu.close();
}

function closeNodeTypeMenu() {
  if (!nodeTypeMenu.value.visible) return;

  nodeTypeMenu.value = {
    visible: false,
    sourceId: null,
    x: 0,
    y: 0
  };
}

function closeFloatingMenus() {
  closeContextMenu();
  closeNodeTypeMenu();
}

function onWindowKeyDown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeFloatingMenus();
    return;
  }

  if (props.readonly || !selectedNodeId.value || (event.key !== 'Delete' && event.key !== 'Backspace')) return;
  if (isEditingTarget(event.target)) return;

  event.preventDefault();
  deleteSelectedNode();
}

function applyAutoLayout() {
  if (props.readonly) return;

  flowNodes.value = autoLayoutFlowNodes(flowNodes.value, flowEdges.value);
  void fitViewSafe();
}

function scheduleAutoLayout() {
  void nextTick(() => {
    applyAutoLayout();
  });
}

function fitViewSafe() {
  return nextTick(() => {
    void fitView({
      padding: 0.22,
      maxZoom: 1.08,
      duration: 220
    });
  });
}

function zoomInCanvas() {
  void zoomIn({ duration: 160 });
}

function zoomOutCanvas() {
  void zoomOut({ duration: 160 });
}

function updateSelectedNodeName(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.value.trim() || (selectedNode.value ? getDefaultNodeName(selectedNode.value.type) : '');
  patchSelectedNode({ name: value });
}

function updateSelectedNodeDescription(event: Event) {
  const target = event.target as HTMLTextAreaElement;
  const description = target.value.trim();
  patchSelectedNode({ description: description || undefined });
}

function applySelectedConfig() {
  if (!selectedNode.value || props.readonly) return;

  try {
    const nextConfig = configDraft.value.trim() ? JSON.parse(configDraft.value) : {};
    if (!isRecord(nextConfig)) {
      configError.value = '配置必须是 JSON 对象';
      return;
    }

    configError.value = '';
    patchSelectedNode({ config: nextConfig });
  } catch (error) {
    configError.value = error instanceof Error ? error.message : 'JSON 格式错误';
  }
}

function generateConditionBranches(nodeId = selectedNode.value?.id) {
  if (props.readonly || !nodeId) return;

  const conditionNode = currentModel.value.nodes.find((node) => node.id === nodeId);
  if (!conditionNode || conditionNode.type !== 'condition') return;

  selectedNodeId.value = nodeId;
  replaceModel(createModelWithConditionBranches(currentModel.value, nodeId));
  scheduleAutoLayout();
}

function createModelWithConditionBranches(model: WorkflowModel, nodeId: string): WorkflowModel {
  const conditionNode = model.nodes.find((node) => node.id === nodeId);
  if (!conditionNode || conditionNode.type !== 'condition') return model;

  const outgoingEdges = model.edges.filter((edge) => edge.source === nodeId);
  if (outgoingEdges.length >= 2 && outgoingEdges.some((edge) => edge.condition?.type === 'always')) {
    return model;
  }

  const downstreamTargetId = outgoingEdges[0]?.target ?? getDefaultEndNodeId(model);
  const baseX = conditionNode.position?.x ?? flowNodes.value.find((node) => node.id === nodeId)?.position.x ?? 330;
  const baseY = conditionNode.position?.y ?? flowNodes.value.find((node) => node.id === nodeId)?.position.y ?? 190;
  const branchA = createConfiguredWorkflowNode('approval', { x: baseX - 170, y: baseY + 150 }, { name: '条件通过审批' });
  const branchB = createConfiguredWorkflowNode('approval', { x: baseX + 170, y: baseY + 150 }, { name: '默认审批' });
  const insertIndex = downstreamTargetId
    ? model.nodes.findIndex((node) => node.id === downstreamTargetId)
    : model.nodes.length;
  const safeInsertIndex = insertIndex >= 0 ? insertIndex : model.nodes.length;
  const nextNodes = [
    ...model.nodes.slice(0, safeInsertIndex),
    branchA,
    branchB,
    ...model.nodes.slice(safeInsertIndex)
  ];
  const nextEdges = model.edges.filter((edge) => edge.source !== nodeId);

  nextEdges.push(
    createWorkflowEdge(nodeId, branchA.id, {
      name: '条件分支',
      condition: createDefaultBranchCondition()
    }),
    createWorkflowEdge(nodeId, branchB.id, {
      name: '默认分支',
      condition: {
        type: 'always'
      }
    })
  );

  if (downstreamTargetId && downstreamTargetId !== branchA.id && downstreamTargetId !== branchB.id) {
    nextEdges.push(
      createWorkflowEdge(branchA.id, downstreamTargetId),
      createWorkflowEdge(branchB.id, downstreamTargetId)
    );
  }

  return {
    ...model,
    nodes: nextNodes,
    edges: nextEdges
  };
}

function repairConditionBranches(nodeId: string) {
  if (props.readonly) return;

  selectedNodeId.value = nodeId;
  replaceModel(createModelWithConditionBranches(currentModel.value, nodeId));
  scheduleAutoLayout();
}

function createModelWithParallelBranches(model: WorkflowModel, nodeId: string): WorkflowModel {
  const parallelNode = model.nodes.find((node) => node.id === nodeId);
  if (!parallelNode || parallelNode.type !== 'parallelGateway') return model;

  const outgoingEdges = model.edges.filter((edge) => edge.source === nodeId);
  if (outgoingEdges.length >= 2) return model;

  const downstreamTargetId = outgoingEdges[0]?.target ?? getDefaultEndNodeId(model);
  const baseX = parallelNode.position?.x ?? flowNodes.value.find((node) => node.id === nodeId)?.position.x ?? 330;
  const baseY = parallelNode.position?.y ?? flowNodes.value.find((node) => node.id === nodeId)?.position.y ?? 190;
  const branchA = createConfiguredWorkflowNode('approval', { x: baseX - 170, y: baseY + 150 }, { name: '并行审批' });
  const branchB = createConfiguredWorkflowNode('cc', { x: baseX + 170, y: baseY + 150 }, { name: '并行抄送' });
  const insertIndex = downstreamTargetId
    ? model.nodes.findIndex((node) => node.id === downstreamTargetId)
    : model.nodes.length;
  const safeInsertIndex = insertIndex >= 0 ? insertIndex : model.nodes.length;
  const nextNodes = [
    ...model.nodes.slice(0, safeInsertIndex),
    branchA,
    branchB,
    ...model.nodes.slice(safeInsertIndex)
  ];
  const nextEdges = model.edges.filter((edge) => edge.source !== nodeId);

  nextEdges.push(
    createWorkflowEdge(nodeId, branchA.id, { name: '审批分支' }),
    createWorkflowEdge(nodeId, branchB.id, { name: '通知分支' })
  );

  if (downstreamTargetId && downstreamTargetId !== branchA.id && downstreamTargetId !== branchB.id) {
    nextEdges.push(
      createWorkflowEdge(branchA.id, downstreamTargetId),
      createWorkflowEdge(branchB.id, downstreamTargetId)
    );
  }

  return {
    ...model,
    nodes: nextNodes,
    edges: nextEdges
  };
}

function repairParallelBranches(nodeId: string) {
  if (props.readonly) return;

  selectedNodeId.value = nodeId;
  replaceModel(createModelWithParallelBranches(currentModel.value, nodeId));
  scheduleAutoLayout();
}

function updateEdgeName(edgeId: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const name = target.value.trim();

  patchEdge(edgeId, {
    name: name || undefined
  });
}

function updateEdgeTarget(edgeId: string, event: Event) {
  const target = event.target as HTMLSelectElement;
  const targetId = target.value;
  const edge = currentModel.value.edges.find((item) => item.id === edgeId);

  if (!targetId || !edge || edge.source === targetId) return;

  patchEdge(edgeId, {
    target: targetId
  }, { layout: true });
}

function updateBranchConditionType(edgeId: string, event: Event) {
  const target = event.target as HTMLSelectElement;
  const type = target.value as WorkflowCondition['type'];

  if (type === 'always') {
    patchEdge(edgeId, {
      condition: {
        type: 'always'
      }
    }, { layout: true });
    return;
  }

  if (type === 'field') {
    patchEdge(edgeId, {
      condition: {
        type: 'field',
        field: 'amount',
        operator: 'gte',
        value: 5000
      }
    }, { layout: true });
    return;
  }

  patchEdge(edgeId, {
    condition: {
      type: 'expression',
      expression: 'amount >= 5000'
    }
  }, { layout: true });
}

function updateBranchExpression(edgeId: string, event: Event) {
  const target = event.target as HTMLInputElement;

  patchEdge(edgeId, {
    condition: {
      type: 'expression',
      expression: target.value
    }
  });
}

function updateBranchField(edgeId: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const current = getFieldCondition(edgeId);

  patchEdge(edgeId, {
    condition: {
      ...current,
      field: target.value
    }
  });
}

function updateBranchOperator(edgeId: string, event: Event) {
  const target = event.target as HTMLSelectElement;
  const current = getFieldCondition(edgeId);

  patchEdge(edgeId, {
    condition: {
      ...current,
      operator: target.value as WorkflowConditionOperator
    }
  });
}

function updateBranchValue(edgeId: string, event: Event) {
  const target = event.target as HTMLInputElement;
  const current = getFieldCondition(edgeId);

  patchEdge(edgeId, {
    condition: {
      ...current,
      value: parseBranchValue(target.value)
    }
  });
}

function deleteEdge(edgeId: string) {
  if (props.readonly) return;

  const selectedId = selectedNodeId.value;

  replaceModel({
    ...currentModel.value,
    edges: currentModel.value.edges.filter((edge) => edge.id !== edgeId)
  });
  selectedNodeId.value = selectedId;
  scheduleAutoLayout();
}

function patchEdge(edgeId: string, patch: Partial<WorkflowEdge>, options: { layout?: boolean } = {}) {
  if (props.readonly) return;

  const selectedId = selectedNodeId.value;

  replaceModel({
    ...currentModel.value,
    edges: currentModel.value.edges.map((edge) => {
      if (edge.id !== edgeId) return edge;

      const nextEdge: WorkflowEdge = {
        ...edge,
        ...patch
      };

      if (!nextEdge.name) {
        delete nextEdge.name;
      }

      return nextEdge;
    })
  });
  selectedNodeId.value = selectedId;
  if (options.layout) {
    scheduleAutoLayout();
  }
}

function chooseExtensionNodeType(type: WorkflowNodeType) {
  const sourceId = nodeTypeMenu.value.sourceId;
  if (!sourceId) return;

  closeNodeTypeMenu();
  extendFromNode(sourceId, type);
}

function setAssigneePreset(nodeId: string, preset: 'manager' | 'role' | 'users') {
  const strategies: Record<'manager' | 'role' | 'users', AssigneeStrategy> = {
    manager: {
      type: 'initiatorManager',
      level: 1
    },
    role: {
      type: 'roles',
      roleCodes: ['order_approver']
    },
    users: {
      type: 'users',
      userIds: ['approver-1', 'approver-2']
    }
  };

  patchNodeConfig(nodeId, {
    assigneeStrategy: strategies[preset]
  });
}

function convertHumanNode(nodeId: string, type: 'sign' | 'orSign') {
  patchNodeById(nodeId, (node) => ({
    ...node,
    type,
    name: node.name === getDefaultNodeName(node.type) ? getDefaultNodeName(type) : node.name,
    config: {
      ...(node.config ?? {}),
      completionStrategy: type === 'orSign' ? 'any' : 'all',
      sequential: type === 'sign',
      allowReject: true,
      assigneeStrategy: isRecord(node.config?.assigneeStrategy)
        ? node.config?.assigneeStrategy
        : {
            type: 'users',
            userIds: ['approver-1', 'approver-2']
          }
    }
  }));
}

function setSignCompletion(nodeId: string, completionStrategy: 'all' | 'any') {
  const type = completionStrategy === 'any' ? 'orSign' : 'sign';

  patchNodeById(nodeId, (node) => ({
    ...node,
    type,
    name: node.name === getDefaultNodeName(node.type) ? getDefaultNodeName(type) : node.name,
    config: {
      ...(node.config ?? {}),
      completionStrategy,
      sequential: completionStrategy === 'all'
    }
  }));
}

function setServicePreset(nodeId: string, preset: 'orderSync' | 'lockInventory') {
  patchNodeConfig(nodeId, {
    serviceName: 'order',
    serviceMethod: preset === 'lockInventory' ? 'lockInventory' : 'syncApprovalStatus'
  });
}

function setTimerPreset(nodeId: string, delaySeconds: number) {
  patchNodeConfig(nodeId, {
    delaySeconds,
    action: 'continue'
  });
}

function setSubProcessPreset(nodeId: string) {
  patchNodeConfig(nodeId, {
    definitionCode: 'contract_archive'
  });
}

function patchNodeConfig(nodeId: string, configPatch: Record<string, unknown>) {
  patchNodeById(nodeId, (node) => ({
    ...node,
    config: {
      ...(node.config ?? {}),
      ...configPatch
    }
  }));
}

function patchNodeById(nodeId: string, updater: (node: WorkflowNode) => WorkflowNode, options: { layout?: boolean } = {}) {
  if (props.readonly) return;

  let didUpdate = false;
  const nextNodes = currentModel.value.nodes.map((node) => {
    if (node.id !== nodeId) return node;

    didUpdate = true;
    const nextNode = updater(node);
    if (!nextNode.description) {
      delete nextNode.description;
    }

    return nextNode;
  });

  if (!didUpdate) return;

  selectedNodeId.value = nodeId;
  replaceModel({
    ...currentModel.value,
    nodes: nextNodes
  });

  if (options.layout) {
    scheduleAutoLayout();
  }
}

function duplicateSelectedNode() {
  if (!canEditSelectedNode.value || !selectedNode.value) return;

  duplicateNodeById(selectedNode.value.id);
}

function duplicateNodeById(nodeId: string) {
  if (props.readonly) return;

  const sourceNode = currentModel.value.nodes.find((node) => node.id === nodeId);
  if (!sourceNode || sourceNode.type === 'start' || sourceNode.type === 'end') return;

  const sourceFlowNode = flowNodes.value.find((node) => node.id === sourceNode.id);
  const id = createNodeId(sourceNode.type);
  const copyNode: WorkflowNode = {
    ...sourceNode,
    id,
    name: `${sourceNode.name} 副本`,
    position: {
      x: (sourceFlowNode?.position.x ?? sourceNode.position?.x ?? 330) + 34,
      y: (sourceFlowNode?.position.y ?? sourceNode.position?.y ?? 190) + 34
    },
    ...(sourceNode.config ? { config: cloneJsonObject(sourceNode.config) } : {})
  };
  const edgePlan = createEdgesForNewNode(sourceNode.id, copyNode.id, currentModel.value.edges);
  const nextModel = createModelWithInsertedNode(copyNode, edgePlan);
  const nextModelWithScaffold = createModelWithNodeScaffold(nextModel, copyNode.id, copyNode.type);

  selectedNodeId.value = id;
  replaceModel(nextModelWithScaffold);
  scheduleAutoLayout();
}

function deleteSelectedNode() {
  if (!canEditSelectedNode.value || !selectedNode.value) return;

  deleteNodeById(selectedNode.value.id);
}

function deleteNodeById(nodeId: string) {
  if (props.readonly) return;

  const node = currentModel.value.nodes.find((item) => item.id === nodeId);
  if (!node || node.type === 'start' || node.type === 'end') return;

  const incomingEdges = currentModel.value.edges.filter((edge) => edge.target === nodeId);
  const outgoingEdges = currentModel.value.edges.filter((edge) => edge.source === nodeId);
  let nextEdges = currentModel.value.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId);

  if (incomingEdges.length === 1 && outgoingEdges.length === 1) {
    const source = incomingEdges[0].source;
    const target = outgoingEdges[0].target;
    const isDuplicate = nextEdges.some((edge) => edge.source === source && edge.target === target);

    if (source !== target && !isDuplicate) {
      nextEdges = [
        ...nextEdges,
        createWorkflowEdge(source, target, {
          ...(incomingEdges[0].name ? { name: incomingEdges[0].name } : {}),
          ...(incomingEdges[0].condition ? { condition: incomingEdges[0].condition } : {})
        })
      ];
    }
  }

  selectedNodeId.value = null;
  closeContextMenu();
  replaceModel({
    ...currentModel.value,
    nodes: currentModel.value.nodes.filter((node) => node.id !== nodeId),
    edges: nextEdges
  });
  scheduleAutoLayout();
}

function patchSelectedNode(patch: Partial<WorkflowNode>) {
  if (!selectedNode.value || props.readonly) return;

  const selectedId = selectedNode.value.id;
  const nextNodes = currentModel.value.nodes.map((node) => {
    if (node.id !== selectedId) return node;

    const nextNode: WorkflowNode = {
      ...node,
      ...patch
    };

    if (!nextNode.description) {
      delete nextNode.description;
    }

    return nextNode;
  });

  replaceModel({
    ...currentModel.value,
    nodes: nextNodes
  });
  selectedNodeId.value = selectedId;
}

function getInsertionSourceId() {
  const selected = selectedNode.value;
  if (selected && selected.type !== 'end') return selected.id;

  const endNodeIds = new Set(currentModel.value.nodes.filter((node) => node.type === 'end').map((node) => node.id));
  const edgeBeforeEnd = currentModel.value.edges.find((edge) => endNodeIds.has(edge.target));

  return edgeBeforeEnd?.source ?? 'start';
}

function insertNodeBeforeTarget(nodes: WorkflowNode[], nextNode: WorkflowNode, targetId?: string) {
  const targetIndex = targetId ? nodes.findIndex((node) => node.id === targetId) : -1;
  const endIndex = nodes.findIndex((node) => node.type === 'end');
  const insertIndex = targetIndex >= 0 ? targetIndex : endIndex >= 0 ? endIndex : nodes.length;

  return [...nodes.slice(0, insertIndex), nextNode, ...nodes.slice(insertIndex)];
}

function createNodeId(type: WorkflowNodeType) {
  const sameTypeCount = currentModel.value.nodes.filter((node) => node.type === type).length;
  const existingIds = new Set(currentModel.value.nodes.map((node) => node.id));
  let index = sameTypeCount + 1;
  let id = `${type}_${index}_${nextLocalIdPart()}`;

  while (existingIds.has(id)) {
    index += 1;
    id = `${type}_${index}_${nextLocalIdPart()}`;
  }

  return id;
}

function createWorkflowEdge(source: string, target: string, options: Partial<Pick<WorkflowEdge, 'condition' | 'name'>> = {}) {
  return {
    id: createEdgeId(source, target),
    source,
    target,
    ...(options.name ? { name: options.name } : {}),
    ...(options.condition ? { condition: options.condition } : {})
  };
}

function createEdgeId(source: string, target: string) {
  return `edge_${source}_${target}_${nextLocalIdPart()}`;
}

function nextLocalIdPart() {
  localIdSequence += 1;

  return `${Date.now().toString(36)}_${localIdSequence.toString(36)}`;
}

function createDefaultBranchCondition(): WorkflowCondition {
  return {
    type: 'field',
    field: 'amount',
    operator: 'gte',
    value: 5000
  };
}

function getFieldCondition(edgeId: string): WorkflowCondition & { type: 'field' } {
  const condition = currentModel.value.edges.find((edge) => edge.id === edgeId)?.condition;

  if (condition?.type === 'field') {
    return {
      type: 'field',
      field: condition.field ?? 'amount',
      operator: condition.operator ?? 'gte',
      value: condition.value ?? 5000
    };
  }

  return {
    type: 'field',
    field: 'amount',
    operator: 'gte',
    value: 5000
  };
}

function getDefaultEndNodeId(model: WorkflowModel = currentModel.value) {
  return model.nodes.find((node) => node.type === 'end')?.id;
}

function getBranchDownstreamTarget(sourceId: string, edges: WorkflowEdge[]) {
  const outgoingTargetIds = edges.filter((edge) => edge.source === sourceId).map((edge) => edge.target);
  const downstreamCounts = new Map<string, number>();

  for (const targetId of outgoingTargetIds) {
    for (const edge of edges) {
      if (edge.source !== targetId) continue;

      downstreamCounts.set(edge.target, (downstreamCounts.get(edge.target) ?? 0) + 1);
    }
  }

  const [bestTarget] = [...downstreamCounts.entries()].sort((left, right) => right[1] - left[1])[0] ?? [];
  if (bestTarget) return bestTarget;

  return outgoingTargetIds[0] ?? getDefaultEndNodeId();
}

function getNodeNameById(nodeId: string) {
  return currentModel.value.nodes.find((node) => node.id === nodeId)?.name ?? nodeId;
}

function getNodeDraftSize(type: WorkflowNodeType) {
  return type === 'start' || type === 'end'
    ? {
        width: 176,
        height: 72
      }
    : {
        width: 236,
        height: 86
      };
}

function isBranchingNode(type: WorkflowNodeType) {
  return type === 'condition' || type === 'parallelGateway';
}

function isHumanNodeType(type: WorkflowNodeType) {
  return type === 'approval' || type === 'sign' || type === 'orSign';
}

function formatBranchValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;

  return JSON.stringify(value);
}

function parseBranchValue(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return '';

  try {
    return JSON.parse(trimmedValue) as unknown;
  } catch {
    return trimmedValue;
  }
}

function ensureSelectedNodeExists() {
  if (selectedNodeId.value && !currentModel.value.nodes.some((node) => node.id === selectedNodeId.value)) {
    selectedNodeId.value = null;
  }
}

function createPaletteItem(type: WorkflowNodeType, description: string): PaletteItem {
  return {
    ...getNodeTypePresentation(type),
    description
  };
}

function cloneJsonObject(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isEditingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;

  return Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

async function simulateWorkflowBuild(targetModel: WorkflowModel, options: WorkflowBuildSimulationOptions = {}) {
  if (props.readonly) return;

  const normalizedModel = normalizeWorkflowModel(targetModel);
  const startNode = normalizedModel.nodes.find((node) => node.type === 'start');
  const endNodes = normalizedModel.nodes.filter((node) => node.type === 'end');
  if (!startNode || !endNodes.length) {
    loadSchema(normalizedModel);
    return;
  }

  const delay = options.intervalMs ?? 180;
  const addedNodeIds = new Set<string>([startNode.id, ...endNodes.map((node) => node.id)]);
  selectedNodeId.value = startNode.id;

  replaceModel(pickSimulationModel(normalizedModel, addedNodeIds));
  scheduleAutoLayout();
  await waitForSimulationStep(delay);

  const orderedNodes = normalizedModel.nodes.filter((node) => node.type !== 'start' && node.type !== 'end');
  for (const node of orderedNodes) {
    addedNodeIds.add(node.id);
    selectedNodeId.value = node.id;
    replaceModel(pickSimulationModel(normalizedModel, addedNodeIds));
    scheduleAutoLayout();
    await waitForSimulationStep(delay);
  }

  replaceModel(normalizedModel);
  selectedNodeId.value = startNode.id;
  scheduleAutoLayout();
}

function pickSimulationModel(model: WorkflowModel, addedNodeIds: Set<string>): WorkflowModel {
  return {
    ...model,
    status: 'draft',
    nodes: model.nodes.filter((node) => addedNodeIds.has(node.id)).map(cloneWorkflowNode),
    edges: model.edges
      .filter((edge) => addedNodeIds.has(edge.source) && addedNodeIds.has(edge.target))
      .map(cloneWorkflowEdge)
  };
}

function cloneWorkflowNode(node: WorkflowNode): WorkflowNode {
  return JSON.parse(JSON.stringify(node)) as WorkflowNode;
}

function cloneWorkflowEdge(edge: WorkflowEdge): WorkflowEdge {
  return JSON.parse(JSON.stringify(edge)) as WorkflowEdge;
}

function waitForSimulationStep(delay: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, Math.max(0, delay));
  });
}

defineExpose({
  getSchema: () => currentModel.value,
  loadSchema,
  validate: () => issues.value,
  autoLayout: applyAutoLayout,
  simulateWorkflowBuild
});
</script>

<template>
  <section
    class="approval-designer"
    :class="{ 'approval-designer--embedded': !showHeader }"
    aria-label="审批流程设计器"
  >
    <header
      v-if="showHeader"
      class="approval-designer__header"
    >
      <div class="approval-designer__heading">
        <span class="approval-designer__eyebrow">Approval Workflow</span>
        <input
          class="approval-designer__title nodrag nowheel"
          :value="currentModel.name"
          :readonly="readonly"
          aria-label="流程名称"
          @input="updateName"
        />
        <div class="approval-designer__meta">
          <span>{{ currentModel.documentType || '通用单据' }}</span>
          <span>{{ currentModel.nodes.length }} 节点</span>
          <span>{{ currentModel.edges.length }} 连线</span>
          <span :class="{ 'approval-designer__meta-warning': errors.length }">{{ publishStateText }}</span>
        </div>
      </div>

      <div class="approval-designer__header-actions">
        <button
          class="approval-designer__button"
          type="button"
          :disabled="readonly"
          title="恢复为一个开始、审批、结束的基础流程"
          @click="resetSimpleWorkflow"
        >
          简单审批
        </button>
        <button
          class="approval-designer__button approval-designer__button--primary"
          type="button"
          title="导出当前审批流 schema"
          @click="exportModel"
        >
          导出
        </button>
      </div>
    </header>

    <div class="approval-designer__body">
      <aside class="approval-designer__palette" aria-label="节点库">
        <div class="approval-designer__side-title">
          <strong>节点库</strong>
          <span>{{ paletteGroups.reduce((count, group) => count + group.items.length, 0) }}</span>
        </div>

        <section
          v-for="group in paletteGroups"
          :key="group.title"
          class="approval-designer__palette-group"
        >
          <h3>{{ group.title }}</h3>
          <button
            v-for="item in group.items"
            :key="item.type"
            type="button"
            class="approval-designer__palette-node"
            :class="{ 'approval-designer__palette-node--dragging': draggingPaletteType === item.type }"
            :disabled="readonly"
            :draggable="!readonly"
            :aria-grabbed="draggingPaletteType === item.type"
            :style="{
              '--palette-accent': item.accent,
              '--palette-soft': item.accentSoft,
              '--palette-border': item.accentBorder
            }"
            @pointerdown="onPalettePointerDown($event, item)"
            @dragstart="onPaletteDragStart($event, item)"
            @dragend="onPaletteDragEnd"
            @click="onPaletteClick(item.type)"
          >
            <span class="approval-designer__palette-icon">{{ item.icon }}</span>
            <span class="approval-designer__palette-copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </span>
          </button>
        </section>
      </aside>

      <main class="approval-designer__canvas-shell" aria-label="流程画布">
        <div class="approval-designer__canvas-toolbar">
          <div class="approval-designer__canvas-status">
            <strong>{{ selectedNode ? selectedNode.name : '流程画布' }}</strong>
            <span>{{ canvasSubtitle }}</span>
          </div>
          <div class="approval-designer__canvas-actions">
            <button
              type="button"
              class="approval-designer__tool-button"
              :disabled="readonly"
              title="自动整理为纵向审批流"
              @click="applyAutoLayout"
            >
              自动布局
            </button>
            <button
              type="button"
              class="approval-designer__tool-button"
              title="居中显示全部节点"
              @click="fitViewSafe"
            >
              居中
            </button>
            <button
              type="button"
              class="approval-designer__tool-button"
              title="放大"
              @click="zoomInCanvas"
            >
              +
            </button>
            <button
              type="button"
              class="approval-designer__tool-button"
              title="缩小"
              @click="zoomOutCanvas"
            >
              -
            </button>
          </div>
        </div>

        <div
          ref="flowCanvasRef"
          class="approval-designer__canvas"
          :class="{ 'approval-designer__canvas--drag-over': isCanvasDragOver }"
          @dragover="onCanvasDragOver"
          @dragleave="onCanvasDragLeave"
          @drop="onCanvasDrop"
        >
          <div
            v-if="isCanvasDragOver"
            class="approval-designer__drop-indicator"
          >
            {{ draggingPaletteLabel }}
          </div>
          <VueFlow
            :id="flowId"
            v-model:nodes="flowNodes"
            v-model:edges="flowEdges"
            class="approval-designer__flow"
            :connection-line-options="connectionLineOptions"
            :fit-view-on-init="true"
            :max-zoom="1.45"
            :min-zoom="0.32"
            :nodes-draggable="!readonly"
            :nodes-connectable="!readonly"
            :edges-updatable="!readonly"
            :elements-selectable="true"
            :snap-to-grid="true"
            :snap-grid="[20, 20]"
            :elevate-nodes-on-select="true"
            :elevate-edges-on-select="true"
            @connect="onConnect"
            @node-click="onNodeClick"
            @node-drag-stop="onNodeDragStop"
            @pane-click="onPaneClick"
          >
            <template #node-approval-card="{ id, data, selected, connectable }">
              <ApprovalFlowNodeCard
                :data="data"
                :selected="Boolean(selected || selectedNodeId === id)"
                :connectable="connectable"
                :extendable="!readonly && data.workflowType !== 'end'"
                :branchable="!readonly && data.workflowType === 'condition'"
                @contextmenu="openNodeContextMenu($event, id)"
                @extend="openNodeTypeMenu($event, id)"
                @branch="generateConditionBranches(id)"
              />
            </template>
          </VueFlow>
        </div>

        <footer class="approval-designer__validation-strip">
          <span
            class="approval-designer__validation-dot"
            :class="{ 'approval-designer__validation-dot--error': errors.length }"
          />
          <strong>{{ errors.length ? '存在阻断项' : '结构检查通过' }}</strong>
          <span>{{ errors.length }} 错误</span>
          <span>{{ warnings.length }} 提醒</span>
        </footer>
      </main>

      <aside class="approval-designer__inspect" aria-label="节点属性">
        <div class="approval-designer__side-title">
          <strong>属性</strong>
          <span>{{ selectedNode ? selectedNode.type : '未选择' }}</span>
        </div>

        <div
          v-if="selectedNode && selectedPresentation"
          class="approval-designer__inspector-content"
        >
          <div
            class="approval-designer__selected-head"
            :style="{
              '--selected-accent': selectedPresentation.accent,
              '--selected-soft': selectedPresentation.accentSoft,
              '--selected-border': selectedPresentation.accentBorder
            }"
          >
            <span>{{ selectedPresentation.icon }}</span>
            <div>
              <strong>{{ selectedNode.name }}</strong>
              <small>{{ selectedSubtitle }}</small>
            </div>
          </div>

          <label class="approval-designer__field">
            <span>节点名称</span>
            <input
              class="approval-designer__input nodrag nowheel"
              :value="selectedNode.name"
              :readonly="readonly"
              @input="updateSelectedNodeName"
            />
          </label>

          <label class="approval-designer__field">
            <span>节点说明</span>
            <textarea
              class="approval-designer__textarea nodrag nowheel"
              :value="selectedNode.description || ''"
              :readonly="readonly"
              rows="3"
              @input="updateSelectedNodeDescription"
            />
          </label>

          <dl class="approval-designer__details">
            <div>
              <dt>节点 ID</dt>
              <dd>{{ selectedNode.id }}</dd>
            </div>
            <div>
              <dt>位置</dt>
              <dd>{{ Math.round(selectedFlowNode?.position.x ?? 0) }}, {{ Math.round(selectedFlowNode?.position.y ?? 0) }}</dd>
            </div>
          </dl>

          <section
            v-if="canExtendSelectedNode"
            class="approval-designer__node-tools"
          >
            <div class="approval-designer__section-head">
              <strong>延伸箭头</strong>
              <span>{{ selectedOutgoingEdges.length }} 条出边</span>
            </div>
            <div class="approval-designer__extension-grid">
              <button
                v-for="item in extensionItems"
                :key="item.type"
                type="button"
                class="approval-designer__extension-node"
                :style="{
                  '--extension-accent': item.accent,
                  '--extension-soft': item.accentSoft,
                  '--extension-border': item.accentBorder
                }"
                @click="extendSelectedNode(item.type)"
              >
                <span>{{ item.icon }}</span>
                <strong>{{ item.label }}</strong>
              </button>
            </div>

            <ul
              v-if="selectedOutgoingEdges.length"
              class="approval-designer__edge-list"
            >
              <li
                v-for="edge in selectedOutgoingEdges"
                :key="edge.id"
              >
                <input
                  class="approval-designer__input nodrag nowheel"
                  :value="edge.name || '默认连线'"
                  :readonly="readonly"
                  @input="updateEdgeName(edge.id, $event)"
                />
                <select
                  class="approval-designer__select nodrag nowheel"
                  :value="edge.target"
                  :disabled="readonly"
                  @change="updateEdgeTarget(edge.id, $event)"
                >
                  <option
                    v-for="node in targetNodeOptions"
                    :key="node.id"
                    :value="node.id"
                  >
                    {{ node.name }}
                  </option>
                </select>
                <button
                  type="button"
                  class="approval-designer__icon-button"
                  :disabled="readonly"
                  title="删除连线"
                  @click="deleteEdge(edge.id)"
                >
                  ×
                </button>
              </li>
            </ul>
          </section>

          <section
            v-if="selectedNode.type === 'condition'"
            class="approval-designer__condition-builder"
          >
            <div class="approval-designer__section-head">
              <strong>条件分支</strong>
              <button
                type="button"
                class="approval-designer__mini-button"
                :disabled="!canGenerateConditionTemplate"
                @click="generateConditionBranches()"
              >
                生成双分支
              </button>
            </div>

            <article
              v-for="branch in conditionBranches"
              :key="branch.edge.id"
              class="approval-designer__branch-card"
              :class="{ 'approval-designer__branch-card--fallback': branch.isFallback }"
            >
              <div class="approval-designer__branch-top">
                <span>{{ branch.index + 1 }}</span>
                <input
                  class="approval-designer__input nodrag nowheel"
                  :value="branch.edge.name || `分支 ${branch.index + 1}`"
                  :readonly="readonly"
                  @input="updateEdgeName(branch.edge.id, $event)"
                />
              </div>

              <label class="approval-designer__compact-field">
                <span>条件类型</span>
                <select
                  class="approval-designer__select nodrag nowheel"
                  :value="branch.conditionType"
                  :disabled="readonly"
                  @change="updateBranchConditionType(branch.edge.id, $event)"
                >
                  <option value="field">字段条件</option>
                  <option value="expression">表达式</option>
                  <option value="always">默认兜底</option>
                </select>
              </label>

              <label
                v-if="branch.conditionType === 'expression'"
                class="approval-designer__compact-field"
              >
                <span>表达式</span>
                <input
                  class="approval-designer__input nodrag nowheel"
                  :value="branch.expression"
                  :readonly="readonly"
                  @input="updateBranchExpression(branch.edge.id, $event)"
                />
              </label>

              <div
                v-else-if="branch.conditionType === 'field'"
                class="approval-designer__branch-condition-grid"
              >
                <label class="approval-designer__compact-field">
                  <span>字段</span>
                  <input
                    class="approval-designer__input nodrag nowheel"
                    :value="branch.field"
                    :readonly="readonly"
                    @input="updateBranchField(branch.edge.id, $event)"
                  />
                </label>
                <label class="approval-designer__compact-field">
                  <span>操作符</span>
                  <select
                    class="approval-designer__select nodrag nowheel"
                    :value="branch.operator"
                    :disabled="readonly"
                    @change="updateBranchOperator(branch.edge.id, $event)"
                  >
                    <option
                      v-for="operator in conditionOperators"
                      :key="operator.value"
                      :value="operator.value"
                    >
                      {{ operator.label }}
                    </option>
                  </select>
                </label>
                <label class="approval-designer__compact-field">
                  <span>值</span>
                  <input
                    class="approval-designer__input nodrag nowheel"
                    :value="branch.valueText"
                    :readonly="readonly"
                    @input="updateBranchValue(branch.edge.id, $event)"
                  />
                </label>
              </div>

              <label class="approval-designer__compact-field">
                <span>流向节点</span>
                <select
                  class="approval-designer__select nodrag nowheel"
                  :value="branch.edge.target"
                  :disabled="readonly"
                  @change="updateEdgeTarget(branch.edge.id, $event)"
                >
                  <option
                    v-for="node in targetNodeOptions"
                    :key="node.id"
                    :value="node.id"
                  >
                    {{ node.name }}
                  </option>
                </select>
              </label>
            </article>
          </section>

          <label class="approval-designer__field">
            <span>配置 JSON</span>
            <textarea
              v-model="configDraft"
              class="approval-designer__textarea approval-designer__textarea--code nodrag nowheel"
              :readonly="readonly"
              rows="10"
              @input="configError = ''"
            />
          </label>
          <p
            v-if="configError"
            class="approval-designer__form-error"
          >
            {{ configError }}
          </p>

          <div class="approval-designer__inspector-actions">
            <button
              type="button"
              class="approval-designer__button"
              :disabled="readonly"
              @click="applySelectedConfig"
            >
              应用配置
            </button>
            <button
              type="button"
              class="approval-designer__button"
              :disabled="!canEditSelectedNode"
              @click="duplicateSelectedNode"
            >
              复制
            </button>
            <button
              type="button"
              class="approval-designer__button approval-designer__button--danger"
              :disabled="!canEditSelectedNode"
              @click="deleteSelectedNode"
            >
              删除
            </button>
          </div>
        </div>

        <div
          v-else
          class="approval-designer__empty"
        >
          <strong>未选择节点</strong>
          <span>暂无节点属性</span>
        </div>

        <section class="approval-designer__issues" aria-label="校验结果">
          <div class="approval-designer__issues-head">
            <strong>校验</strong>
            <span>{{ publishStateText }}</span>
          </div>
          <ul v-if="issues.length">
            <li
              v-for="issue in issues"
              :key="`${issue.path}-${issue.message}`"
              :class="`approval-designer__issue--${issue.level}`"
            >
              <span>{{ issue.path }}</span>
              <strong>{{ issue.message }}</strong>
            </li>
          </ul>
          <p v-else>Schema OK</p>
        </section>
      </aside>
    </div>
    <div
      v-if="nodeTypeMenu.visible"
      class="approval-designer__node-type-menu"
      :style="{
        left: `${nodeTypeMenu.x}px`,
        top: `${nodeTypeMenu.y}px`
      }"
      @click.stop
      @contextmenu.prevent.stop
      @pointerdown.stop
    >
      <div class="approval-designer__node-type-head">
        <strong>选择节点类型</strong>
        <span>{{ currentModel.nodes.find((node) => node.id === nodeTypeMenu.sourceId)?.name || '延伸节点' }}</span>
      </div>
      <div class="flex flex-col" style="height:300px">

        <section
        v-for="group in paletteGroups"
        :key="group.title"
        class="approval-designer__node-type-group"
      >
        <h3>{{ group.title }}</h3>
        <button
          v-for="item in group.items"
          :key="item.type"
          type="button"
          class="approval-designer__node-type-action"
          :style="{
            '--node-type-accent': item.accent,
            '--node-type-soft': item.accentSoft,
            '--node-type-border': item.accentBorder
          }"
          @click="chooseExtensionNodeType(item.type)"
        >
          <span>{{ item.icon }}</span>
          <strong>{{ item.label }}</strong>
          <small>{{ item.description }}</small>
        </button>
      </section>
    </div>

    </div>
    <div
      v-if="pointerPaletteDrag?.active"
      class="approval-designer__drag-ghost"
      :style="pointerDragStyle"
    >
      {{ draggingPaletteLabel }}
    </div>
  </section>
</template>

<style scoped>
.approval-designer {
  container-type: inline-size;
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid #d5deea;
  border-radius: 8px;
  background:
    linear-gradient(180deg, #fafcff 0%, #f5f8fc 100%),
    #f7f9fc;
  color: #1f2937;
}

.approval-designer--embedded {
  border-top: 0;
  border-radius: 0 0 8px 8px;
}

.approval-designer__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border-bottom: 1px solid #d5deea;
  background: #ffffff;
  padding: 8px 12px;
}

.approval-designer__heading {
  min-width: 0;
}

.approval-designer__eyebrow {
  display: block;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 14px;
  text-transform: uppercase;
}

.approval-designer__title {
  display: block;
  width: min(40vw, 320px);
  min-width: 160px;
  border: 0;
  background: transparent;
  color: #111827;
  font-size: 18px;
  font-weight: 900;
  line-height: 24px;
  outline: none;
}

.approval-designer__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
}

.approval-designer__meta span {
  padding-right: 0;
}

.approval-designer__meta span:last-child {
  padding-right: 0;
}

.approval-designer__meta-warning {
  color: #dc2626;
  font-weight: 700;
}

.approval-designer__header-actions,
.approval-designer__canvas-actions,
.approval-designer__inspector-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.approval-designer__button,
.approval-designer__tool-button {
  min-height: 30px;
  border: 1px solid #c8d2e0;
  border-radius: 6px;
  background: #ffffff;
  color: #1f2937;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  line-height: 16px;
  padding: 0 10px;
}

.approval-designer__button:hover:not(:disabled),
.approval-designer__tool-button:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.approval-designer__button:disabled,
.approval-designer__tool-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

.approval-designer__button--primary {
  border-color: #2563eb;
  background: #2563eb;
  color: #ffffff;
}

.approval-designer__button--primary:hover:not(:disabled) {
  border-color: #1d4ed8;
  background: #1d4ed8;
}

.approval-designer__button--danger {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.approval-designer__body {
  display: grid;
  flex: 1;
  grid-template-areas:
    'palette canvas'
    'inspect inspect';
  grid-template-columns: minmax(188px, 214px) minmax(0, 1fr);
  min-height: 0;
}

.approval-designer__palette,
.approval-designer__inspect {
  overflow: auto;
  border-right: 1px solid #d5deea;
  background: #ffffff;
  padding: 10px;
}

.approval-designer__palette {
  grid-area: palette;
}

.approval-designer__inspect {
  grid-area: inspect;
  border-right: 0;
  border-top: 1px solid #d5deea;
  border-left: 0;
}

.approval-designer__side-title,
.approval-designer__issues-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.approval-designer__side-title strong,
.approval-designer__issues-head strong {
  color: #0f172a;
  font-size: 13px;
  line-height: 20px;
}

.approval-designer__side-title span,
.approval-designer__issues-head span {
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.approval-designer__palette-group {
  border-top: 1px solid #edf1f7;
  margin-top: 10px;
  padding-top: 10px;
}

.approval-designer__palette-group h3 {
  margin: 0 0 8px;
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
  line-height: 16px;
}

.approval-designer__palette-node {
  display: grid;
  width: 100%;
  min-height: 50px;
  grid-template-columns: 38px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: 1px solid var(--palette-border);
  border-radius: 6px;
  background: #ffffff;
  color: #0f172a;
  cursor: grab;
  margin-top: 8px;
  padding: 8px;
  text-align: left;
}

.approval-designer__palette-node:hover:not(:disabled) {
  border-color: var(--palette-accent);
  background: #f8fafc;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.06);
}

.approval-designer__palette-node--dragging {
  border-color: var(--palette-accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--palette-accent) 14%, transparent);
  opacity: 0.82;
}

.approval-designer__palette-node:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.approval-designer__palette-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border: 1px solid var(--palette-border);
  border-radius: 6px;
  background: #f8fafc;
  color: var(--palette-accent);
  font-size: 10px;
  font-weight: 900;
}

.approval-designer__palette-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.approval-designer__palette-copy strong {
  overflow: hidden;
  color: #111827;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__palette-copy small {
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__canvas-shell {
  display: grid;
  grid-area: canvas;
  min-width: 0;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr) auto;
  background: #f5f7fb;
}

.approval-designer__canvas-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid #d5deea;
  background: rgba(255, 255, 255, 0.96);
  padding: 6px 8px;
}

.approval-designer__canvas-status {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.approval-designer__canvas-status strong {
  overflow: hidden;
  color: #0f172a;
  font-size: 12px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__canvas-status span {
  overflow: hidden;
  color: #64748b;
  font-size: 10px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__tool-button:nth-last-child(-n + 2) {
  min-width: 28px;
  padding-right: 0;
  padding-left: 0;
}

.approval-designer__canvas {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background-color: #f8fafc;
  background-image:
    radial-gradient(circle, rgba(100, 116, 139, 0.16) 1px, transparent 1px),
    linear-gradient(rgba(148, 163, 184, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.08) 1px, transparent 1px);
  background-position: 0 0, 0 0, 0 0;
  background-size: 20px 20px, 80px 80px, 80px 80px;
}

.approval-designer__canvas--drag-over {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}

.approval-designer__drop-indicator {
  position: absolute;
  top: 12px;
  left: 12px;
  z-index: 5;
  border: 1px solid #bfdbfe;
  border-radius: 999px;
  background: #eff6ff;
  box-shadow: 0 8px 16px rgba(15, 23, 42, 0.08);
  color: #1d4ed8;
  font-size: 11px;
  font-weight: 800;
  line-height: 16px;
  pointer-events: none;
  padding: 5px 9px;
}

.approval-designer__drag-ghost {
  position: fixed;
  z-index: 9999;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.16);
  color: #1d4ed8;
  font-size: 12px;
  font-weight: 900;
  line-height: 16px;
  pointer-events: none;
  padding: 8px 10px;
}

.approval-designer__node-type-menu {
  position: fixed;
  z-index: 9998;
  display: grid;
  width: 286px;
  max-height: calc(100vh - 16px);
  gap: 10px;
  overflow: auto;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  box-shadow: 0 14px 28px rgba(15, 23, 42, 0.14);
  padding: 8px;
}

.approval-designer__node-type-head {
  display: grid;
  gap: 2px;
  border-bottom: 1px solid #edf1f7;
  padding: 2px 2px 9px;
}

.approval-designer__node-type-head strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
  line-height: 18px;
}

.approval-designer__node-type-head span {
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__node-type-group {
  display: grid;
  gap: 6px;
}

.approval-designer__node-type-group h3 {
  margin: 0;
  color: #94a3b8;
  font-size: 11px;
  font-weight: 900;
  line-height: 16px;
}

.approval-designer__node-type-action {
  display: grid;
  min-height: 48px;
  grid-template-columns: 30px minmax(0, 1fr);
  align-items: center;
  gap: 7px 9px;
  border: 1px solid var(--node-type-border);
  border-radius: 6px;
  background: linear-gradient(90deg, var(--node-type-soft), #ffffff);
  color: #1f2937;
  cursor: pointer;
  padding: 7px 8px;
  text-align: left;
}

.approval-designer__node-type-action:hover {
  border-color: var(--node-type-accent);
  background: var(--node-type-soft);
}

.approval-designer__node-type-action span {
  grid-row: span 2;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--node-type-border);
  border-radius: 6px;
  background: #ffffff;
  color: var(--node-type-accent);
  font-size: 10px;
  font-weight: 900;
  line-height: 1;
}

.approval-designer__node-type-action strong,
.approval-designer__node-type-action small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__node-type-action strong {
  color: #0f172a;
  font-size: 13px;
  font-weight: 900;
  line-height: 17px;
}

.approval-designer__node-type-action small {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
  line-height: 15px;
}

.approval-designer__flow {
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 520px;
}

.approval-designer__validation-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid #d5deea;
  background: #ffffff;
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
  padding: 7px 10px;
}

.approval-designer__validation-strip strong {
  color: #0f172a;
}

.approval-designer__validation-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #16a34a;
}

.approval-designer__validation-dot--error {
  background: #dc2626;
}

.approval-designer__inspector-content {
  display: grid;
  gap: 10px;
  border-top: 1px solid #edf1f7;
  margin-top: 10px;
  padding-top: 10px;
}

.approval-designer__selected-head {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  border: 1px solid var(--selected-border);
  border-radius: 6px;
  background: #ffffff;
  padding: 8px;
}

.approval-designer__selected-head > span {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid var(--selected-border);
  border-radius: 6px;
  background: var(--selected-soft);
  color: var(--selected-accent);
  font-size: 10px;
  font-weight: 900;
}

.approval-designer__selected-head div {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.approval-designer__selected-head strong,
.approval-designer__selected-head small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__selected-head strong {
  color: #0f172a;
  font-size: 13px;
  line-height: 18px;
}

.approval-designer__selected-head small {
  color: #64748b;
  font-size: 11px;
  line-height: 14px;
}

.approval-designer__field {
  display: grid;
  gap: 5px;
}

.approval-designer__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.approval-designer__section-head strong {
  color: #0f172a;
  font-size: 11px;
  line-height: 16px;
}

.approval-designer__section-head span {
  color: #64748b;
  font-size: 11px;
  font-weight: 700;
}

.approval-designer__field span {
  color: #475569;
  font-size: 11px;
  font-weight: 800;
  line-height: 14px;
}

.approval-designer__input,
.approval-designer__select,
.approval-designer__textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #111827;
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  outline: none;
  padding: 6px 8px;
}

.approval-designer__input:focus,
.approval-designer__select:focus,
.approval-designer__textarea:focus {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.approval-designer__textarea {
  min-height: 64px;
  resize: vertical;
}

.approval-designer__textarea--code {
  min-height: 152px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  font-size: 11px;
  line-height: 16px;
}

.approval-designer__details {
  display: grid;
  gap: 7px;
  margin: 0;
}

.approval-designer__details div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  border-bottom: 1px solid #edf1f7;
  padding-bottom: 6px;
}

.approval-designer__details dt {
  color: #64748b;
  font-size: 12px;
  font-weight: 800;
}

.approval-designer__details dd {
  overflow: hidden;
  margin: 0;
  color: #111827;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__node-tools,
.approval-designer__condition-builder {
  display: grid;
  gap: 8px;
  border: 1px solid #edf1f7;
  border-radius: 8px;
  background: #fbfdff;
  padding: 9px;
}

.approval-designer__extension-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.approval-designer__extension-node {
  display: grid;
  min-width: 0;
  grid-template-columns: 28px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 1px solid var(--extension-border);
  border-radius: 8px;
  background: linear-gradient(90deg, var(--extension-soft), #ffffff);
  color: #0f172a;
  cursor: pointer;
  padding: 8px;
  text-align: left;
}

.approval-designer__extension-node:hover {
  border-color: var(--extension-accent);
}

.approval-designer__extension-node span {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid var(--extension-border);
  border-radius: 7px;
  background: #ffffff;
  color: var(--extension-accent);
  font-size: 10px;
  font-weight: 900;
}

.approval-designer__extension-node strong {
  overflow: hidden;
  font-size: 12px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.approval-designer__edge-list {
  display: grid;
  gap: 7px;
  margin: 0;
  padding: 0;
}

.approval-designer__edge-list li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.9fr) 30px;
  gap: 6px;
  align-items: center;
  list-style: none;
}

.approval-designer__icon-button,
.approval-designer__mini-button {
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 11px;
  font-weight: 800;
}

.approval-designer__icon-button {
  width: 28px;
  height: 28px;
  line-height: 1;
}

.approval-designer__mini-button {
  min-height: 24px;
  padding: 2px 7px;
}

.approval-designer__icon-button:hover:not(:disabled),
.approval-designer__mini-button:hover:not(:disabled) {
  border-color: #94a3b8;
  background: #f8fafc;
}

.approval-designer__icon-button:disabled,
.approval-designer__mini-button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.approval-designer__branch-card {
  display: grid;
  gap: 8px;
  border: 1px solid #fde68a;
  border-radius: 6px;
  background: #fffbeb;
  padding: 8px;
}

.approval-designer__branch-card--fallback {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.approval-designer__branch-top {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
}

.approval-designer__branch-top > span {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border-radius: 999px;
  background: #ffffff;
  color: #d97706;
  font-size: 10px;
  font-weight: 900;
}

.approval-designer__compact-field {
  display: grid;
  gap: 4px;
}

.approval-designer__compact-field span {
  color: #64748b;
  font-size: 10px;
  font-weight: 800;
  line-height: 13px;
}

.approval-designer__branch-condition-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px minmax(0, 0.8fr);
  gap: 8px;
}

.approval-designer__form-error {
  margin: -8px 0 0;
  color: #dc2626;
  font-size: 11px;
  line-height: 16px;
}

.approval-designer__empty {
  display: grid;
  gap: 6px;
  border-top: 1px solid #edf1f7;
  margin-top: 10px;
  padding-top: 12px;
  color: #64748b;
  font-size: 12px;
}

.approval-designer__empty strong {
  color: #0f172a;
}

.approval-designer__issues {
  border-top: 1px solid #edf1f7;
  margin-top: 10px;
  padding-top: 10px;
}

.approval-designer__issues ul {
  display: grid;
  gap: 8px;
  margin: 12px 0 0;
  padding: 0;
}

.approval-designer__issues li {
  display: grid;
  gap: 3px;
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
  color: #92400e;
  list-style: none;
  padding: 7px 8px;
}

.approval-designer__issues li.approval-designer__issue--error {
  border-left-color: #dc2626;
  background: #fef2f2;
  color: #991b1b;
}

.approval-designer__issues li span {
  font-size: 10px;
  font-weight: 800;
}

.approval-designer__issues li strong {
  font-size: 11px;
  line-height: 16px;
}

.approval-designer__issues p {
  margin: 10px 0 0;
  color: #16a34a;
  font-size: 12px;
  font-weight: 800;
}

:deep(.vue-flow__pane) {
  cursor: grab;
}

:deep(.vue-flow__pane.dragging) {
  cursor: grabbing;
}

:deep(.vue-flow__node-approval-card) {
  border: 0;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

:deep(.vue-flow__node-approval-card.selected) {
  box-shadow: none;
}

:deep(.vue-flow__edge-path) {
  stroke-linecap: round;
}

:deep(.approval-flow-edge--conditional .vue-flow__edge-path) {
  stroke-dasharray: 7 5;
}

:deep(.vue-flow__connection-path) {
  stroke: #2563eb;
  stroke-width: 2.2;
}

@container (min-width: 1120px) {
  .approval-designer__body {
    grid-template-areas: 'palette canvas inspect';
    grid-template-columns: 224px minmax(560px, 1fr) 324px;
  }

  .approval-designer__inspect {
    border-top: 0;
    border-left: 1px solid #d5deea;
  }
}

@container (max-width: 560px) {
  .approval-designer__body {
    grid-template-areas:
      'palette'
      'canvas'
      'inspect';
    grid-template-columns: 1fr;
  }

  .approval-designer__palette,
  .approval-designer__inspect {
    border-right: 0;
    border-bottom: 1px solid #d5deea;
  }

  .approval-designer__palette-group {
    display: inline-grid;
    width: min(260px, 82vw);
    margin-right: 10px;
    vertical-align: top;
  }
}

@media (max-width: 940px) {
  .approval-designer__header {
    align-items: flex-start;
    flex-direction: column;
  }

  .approval-designer__body {
    grid-template-columns: 1fr;
  }

  .approval-designer__palette,
  .approval-designer__inspect {
    max-height: none;
    border: 0;
    border-bottom: 1px solid #d5deea;
  }

  .approval-designer__palette-group {
    display: inline-grid;
    width: min(260px, 82vw);
    margin-right: 10px;
    vertical-align: top;
  }

  .approval-designer__canvas-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .approval-designer__flow {
    min-height: 480px;
  }
}
</style>
