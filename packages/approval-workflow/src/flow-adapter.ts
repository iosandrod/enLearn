import {
  ConnectionLineType,
  MarkerType,
  Position,
  type Connection
} from '@vue-flow/core';
import type {
  AssigneeStrategy,
  WorkflowCondition,
  WorkflowEdge,
  WorkflowModel,
  WorkflowNode,
  WorkflowNodeType
} from '@enlearn/workflow-schema';

export const APPROVAL_NODE_RENDER_TYPE = 'approval-card';

export type ApprovalFlowNodeData = {
  workflowType: WorkflowNodeType;
  label: string;
  typeLabel: string;
  categoryLabel: string;
  description?: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  summary: string;
  isStart: boolean;
  isEnd: boolean;
};

export type ApprovalFlowEdgeData = {
  condition?: WorkflowCondition;
};

export type ApprovalFlowNode = {
  id: string;
  label?: string;
  position: {
    x: number;
    y: number;
  };
  type?: string;
  class?: string;
  data: ApprovalFlowNodeData;
  draggable?: boolean;
  deletable?: boolean;
  selectable?: boolean;
  connectable?: boolean;
  width?: number;
  height?: number;
  sourcePosition?: Position;
  targetPosition?: Position;
};

export type ApprovalFlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  markerEnd?: string;
  animated?: boolean;
  class?: string;
  interactionWidth?: number;
  style?: Record<string, string | number>;
  labelStyle?: Record<string, string | number>;
  labelBgStyle?: Record<string, string | number>;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
  data?: ApprovalFlowEdgeData;
};

const nodeTypeLabels: Record<string, string> = {
  start: '开始',
  approval: '审批',
  sign: '会签',
  orSign: '或签',
  condition: '条件',
  cc: '抄送',
  parallelGateway: '并行',
  serviceTask: '服务',
  timer: '定时',
  subProcess: '子流程',
  end: '结束'
};

const nodeTypeCategories: Record<string, string> = {
  start: '事件',
  approval: '人工审批',
  sign: '人工审批',
  orSign: '人工审批',
  condition: '网关',
  cc: '通知',
  parallelGateway: '网关',
  serviceTask: '自动任务',
  timer: '事件',
  subProcess: '复用流程',
  end: '事件'
};

const nodeTypeVisuals: Record<string, { icon: string; accent: string; accentSoft: string; accentBorder: string }> = {
  start: {
    icon: 'S',
    accent: '#16a34a',
    accentSoft: '#ecfdf5',
    accentBorder: '#bbf7d0'
  },
  approval: {
    icon: 'A',
    accent: '#2563eb',
    accentSoft: '#eff6ff',
    accentBorder: '#bfdbfe'
  },
  sign: {
    icon: 'ALL',
    accent: '#7c3aed',
    accentSoft: '#f5f3ff',
    accentBorder: '#ddd6fe'
  },
  orSign: {
    icon: 'ANY',
    accent: '#c026d3',
    accentSoft: '#fdf4ff',
    accentBorder: '#f5d0fe'
  },
  condition: {
    icon: 'IF',
    accent: '#d97706',
    accentSoft: '#fffbeb',
    accentBorder: '#fde68a'
  },
  cc: {
    icon: 'CC',
    accent: '#0d9488',
    accentSoft: '#f0fdfa',
    accentBorder: '#99f6e4'
  },
  parallelGateway: {
    icon: '||',
    accent: '#dc2626',
    accentSoft: '#fef2f2',
    accentBorder: '#fecaca'
  },
  serviceTask: {
    icon: 'API',
    accent: '#4f46e5',
    accentSoft: '#eef2ff',
    accentBorder: '#c7d2fe'
  },
  timer: {
    icon: 'T',
    accent: '#db2777',
    accentSoft: '#fdf2f8',
    accentBorder: '#fbcfe8'
  },
  subProcess: {
    icon: 'SUB',
    accent: '#0891b2',
    accentSoft: '#ecfeff',
    accentBorder: '#a5f3fc'
  },
  end: {
    icon: 'END',
    accent: '#475569',
    accentSoft: '#f8fafc',
    accentBorder: '#cbd5e1'
  }
};

const defaultNodeVisual = {
  icon: 'N',
  accent: '#334155',
  accentSoft: '#f8fafc',
  accentBorder: '#cbd5e1'
};

const layoutOptions = {
  originX: 360,
  originY: 48,
  levelGap: 210,
  siblingGap: 320,
  branchGap: 330,
  minSiblingGap: 284
};

export function workflowToFlowNodes(model: WorkflowModel): ApprovalFlowNode[] {
  return model.nodes.map((node, index) => ({
    id: node.id,
    label: node.name,
    type: APPROVAL_NODE_RENDER_TYPE,
    position: node.position ?? {
      x: layoutOptions.originX,
      y: layoutOptions.originY + index * layoutOptions.levelGap
    },
    class: `approval-flow-node approval-flow-node--${node.type}`,
    data: getNodePresentation(node),
    draggable: true,
    deletable: node.type !== 'start' && node.type !== 'end',
    selectable: true,
    connectable: true,
    width: 236,
    height: 86,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top
  }));
}

export function workflowToFlowEdges(model: WorkflowModel): ApprovalFlowEdge[] {
  return model.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: 'out',
    targetHandle: 'in',
    label: edge.name,
    type: ConnectionLineType.SmoothStep,
    markerEnd: MarkerType.ArrowClosed,
    interactionWidth: 18,
    style: {
      stroke: '#64748b',
      strokeWidth: 2.2
    },
    labelStyle: {
      fill: '#475569',
      fontSize: 12,
      fontWeight: 600
    },
    labelBgStyle: {
      fill: '#ffffff',
      stroke: '#dbe4f0',
      strokeWidth: 1
    },
    labelBgPadding: [8, 4],
    labelBgBorderRadius: 6,
    animated: isConditionalEdge(edge),
    class: isConditionalEdge(edge) ? 'approval-flow-edge approval-flow-edge--conditional' : 'approval-flow-edge',
    data: {
      condition: edge.condition
    }
  }));
}

export function flowToWorkflowModel(
  model: WorkflowModel,
  nodes: ApprovalFlowNode[],
  edges: ApprovalFlowEdge[]
): WorkflowModel {
  const existingNodes = new Map(model.nodes.map((node) => [node.id, node]));
  const existingEdges = new Map(model.edges.map((edge) => [edge.id, edge]));

  return {
    ...model,
    nodes: nodes.map((node): WorkflowNode => {
      const existing = existingNodes.get(node.id);
      const workflowType = node.data?.workflowType ?? existing?.type ?? 'approval';
      const label = readLabel(node.label) || node.data?.label || existing?.name || nodeTypeLabels[workflowType] || workflowType;

      return {
        ...(existing ?? {}),
        id: node.id,
        type: workflowType,
        name: label,
        position: {
          x: node.position.x,
          y: node.position.y
        }
      };
    }),
    edges: edges.map((edge): WorkflowEdge => {
      const existing = existingEdges.get(edge.id);
      const name = readLabel(edge.label) || existing?.name;

      return {
        ...(existing ?? {}),
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(name ? { name } : {}),
        ...(edge.data?.condition ? { condition: edge.data.condition } : existing?.condition ? { condition: existing.condition } : {})
      };
    })
  };
}

export function connectionToWorkflowEdge(connection: Connection, edgeId: string): ApprovalFlowEdge {
  return {
    id: edgeId,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? 'out',
    targetHandle: connection.targetHandle ?? 'in',
    type: ConnectionLineType.SmoothStep,
    markerEnd: MarkerType.ArrowClosed,
    interactionWidth: 18,
    style: {
      stroke: '#64748b',
      strokeWidth: 2.2
    }
  };
}

function readLabel(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

export function getDefaultNodeName(type: WorkflowNodeType) {
  return nodeTypeLabels[type] ?? type;
}

export function getNodePresentation(node: WorkflowNode): ApprovalFlowNodeData {
  const visual = nodeTypeVisuals[node.type] ?? defaultNodeVisual;

  return {
    workflowType: node.type,
    label: node.name || getDefaultNodeName(node.type),
    typeLabel: getDefaultNodeName(node.type),
    categoryLabel: nodeTypeCategories[node.type] ?? '扩展节点',
    description: node.description,
    icon: visual.icon,
    accent: visual.accent,
    accentSoft: visual.accentSoft,
    accentBorder: visual.accentBorder,
    summary: summarizeNodeConfig(node),
    isStart: node.type === 'start',
    isEnd: node.type === 'end'
  };
}

export function getNodeTypePresentation(type: WorkflowNodeType) {
  const visual = nodeTypeVisuals[type] ?? defaultNodeVisual;

  return {
    type,
    label: getDefaultNodeName(type),
    categoryLabel: nodeTypeCategories[type] ?? '扩展节点',
    ...visual
  };
}

export function autoLayoutFlowNodes(nodes: ApprovalFlowNode[], edges: ApprovalFlowEdge[]): ApprovalFlowNode[] {
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const outgoing = new Map<string, ApprovalFlowEdge[]>();
  const incoming = new Map<string, ApprovalFlowEdge[]>();
  const incomingCount = new Map<string, number>();

  for (const node of nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
    incomingCount.set(node.id, 0);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;

    outgoing.get(edge.source)?.push(edge);
    incoming.get(edge.target)?.push(edge);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  for (const edgeGroup of outgoing.values()) {
    edgeGroup.sort((left, right) => getEdgeOrder(left) - getEdgeOrder(right));
  }

  const startNodes = nodes
    .filter((node) => node.data.workflowType === 'start')
    .map((node) => node.id);
  const endNodeIds = new Set(nodes.filter((node) => node.data.workflowType === 'end').map((node) => node.id));
  const queue = [
    ...(startNodes.length
      ? startNodes
      : nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0).map((node) => node.id))
  ];
  const levels = new Map<string, number>();

  for (const nodeId of queue) {
    levels.set(nodeId, 0);
  }

  while (queue.length) {
    const nodeId = queue.shift();
    if (!nodeId) continue;

    const level = levels.get(nodeId) ?? 0;
    const targets = outgoing.get(nodeId) ?? [];

    for (const edge of targets) {
      const target = edge.target;
      const nextLevel = level + 1;
      if ((levels.get(target) ?? -1) < nextLevel) {
        levels.set(target, nextLevel);
        queue.push(target);
      }
    }
  }

  let fallbackLevel = Math.max(0, ...levels.values()) + 1;
  for (const node of nodes) {
    if (!levels.has(node.id)) {
      levels.set(node.id, fallbackLevel);
      fallbackLevel += 1;
    }
  }

  const lastContentLevel = Math.max(
    0,
    ...nodes
      .filter((node) => !endNodeIds.has(node.id))
      .map((node) => levels.get(node.id) ?? 0)
  );
  for (const endNodeId of endNodeIds) {
    levels.set(endNodeId, lastContentLevel + 1);
  }

  const grouped = new Map<number, ApprovalFlowNode[]>();
  for (const node of nodes) {
    const level = levels.get(node.id) ?? 0;
    const siblings = grouped.get(level) ?? [];
    siblings.push(node);
    grouped.set(level, siblings);
  }

  const traversalOrder = buildTraversalOrder(nodes, outgoing, originalIndex);
  const xById = new Map<string, number>();
  const orderedLevels = Array.from(grouped.keys()).sort((left, right) => left - right);

  for (const level of orderedLevels) {
    const siblings = grouped.get(level) ?? [];
    const desiredItems = siblings.map((node) => ({
      node,
      desiredX: getDesiredNodeX(node, incoming, outgoing, xById)
    }));
    desiredItems.sort((left, right) => {
      const desiredDelta = left.desiredX - right.desiredX;
      if (Math.abs(desiredDelta) > 1) return desiredDelta;

      return (traversalOrder.get(left.node.id) ?? 0) - (traversalOrder.get(right.node.id) ?? 0);
    });

    const spreadItems = spreadLayoutItems(desiredItems);
    grouped.set(
      level,
      spreadItems.map((item) => item.node)
    );

    for (const item of spreadItems) {
      xById.set(item.node.id, item.x);
    }
  }

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0;
    const x = node.data.workflowType === 'start' || node.data.workflowType === 'end'
      ? layoutOptions.originX
      : xById.get(node.id) ?? layoutOptions.originX;

    return {
      ...node,
      draggable: true,
      position: {
        x: Math.round(x),
        y: layoutOptions.originY + level * layoutOptions.levelGap
      }
    };
  });
}

function getEdgeOrder(edge: ApprovalFlowEdge) {
  const condition = edge.data?.condition;
  if (condition?.type === 'always') return 10_000;
  if (typeof edge.label === 'string' && edge.label.includes('默认')) return 10_000;
  return 0;
}

function buildTraversalOrder(
  nodes: ApprovalFlowNode[],
  outgoing: Map<string, ApprovalFlowEdge[]>,
  originalIndex: Map<string, number>
) {
  const order = new Map<string, number>();
  const visited = new Set<string>();
  let cursor = 0;
  const starts = nodes
    .filter((node) => node.data.workflowType === 'start')
    .sort((left, right) => (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0));
  const roots = starts.length
    ? starts
    : [...nodes].sort((left, right) => (originalIndex.get(left.id) ?? 0) - (originalIndex.get(right.id) ?? 0));

  function visit(nodeId: string) {
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    order.set(nodeId, cursor);
    cursor += 1;

    const targets = outgoing.get(nodeId) ?? [];
    for (const edge of targets) {
      visit(edge.target);
    }
  }

  for (const node of roots) {
    visit(node.id);
  }

  for (const node of nodes) {
    visit(node.id);
  }

  return order;
}

function getDesiredNodeX(
  node: ApprovalFlowNode,
  incoming: Map<string, ApprovalFlowEdge[]>,
  outgoing: Map<string, ApprovalFlowEdge[]>,
  xById: Map<string, number>
) {
  if (node.data.workflowType === 'start' || node.data.workflowType === 'end') return layoutOptions.originX;

  const parentEdges = incoming.get(node.id) ?? [];
  const parentXs = parentEdges
    .map((edge) => {
      const parentX = xById.get(edge.source);
      if (parentX === undefined) return undefined;

      const siblings = outgoing.get(edge.source) ?? [];
      if (siblings.length <= 1) return parentX;

      const siblingIndex = siblings.findIndex((item) => item.id === edge.id);
      const centerOffset = (siblings.length - 1) / 2;
      return parentX + (siblingIndex - centerOffset) * layoutOptions.branchGap;
    })
    .filter((value): value is number => typeof value === 'number');

  if (parentXs.length) {
    return parentXs.reduce((sum, value) => sum + value, 0) / parentXs.length;
  }

  return layoutOptions.originX;
}

function spreadLayoutItems(items: Array<{ node: ApprovalFlowNode; desiredX: number }>) {
  if (!items.length) return [];
  if (items.length === 1) {
    const item = items[0];
    return [
      {
        ...item,
        x: item.node.data.workflowType === 'start' || item.node.data.workflowType === 'end'
          ? layoutOptions.originX
          : item.desiredX
      }
    ];
  }

  const nextItems = items.map((item) => ({
    ...item,
    x: item.node.data.workflowType === 'start' || item.node.data.workflowType === 'end'
      ? layoutOptions.originX
      : item.desiredX
  }));

  for (let index = 1; index < nextItems.length; index += 1) {
    const previous = nextItems[index - 1];
    const current = nextItems[index];
    const requiredX = previous.x + layoutOptions.minSiblingGap;
    if (current.x < requiredX) {
      current.x = requiredX;
    }
  }

  for (let index = nextItems.length - 2; index >= 0; index -= 1) {
    const next = nextItems[index + 1];
    const current = nextItems[index];
    const requiredX = next.x - layoutOptions.minSiblingGap;
    if (current.x > requiredX) {
      current.x = requiredX;
    }
  }

  const hasFixedEventNode = nextItems.some(
    (item) => item.node.data.workflowType === 'start' || item.node.data.workflowType === 'end'
  );
  if (!hasFixedEventNode) {
    const averageX = nextItems.reduce((sum, item) => sum + item.x, 0) / nextItems.length;
    const shift = layoutOptions.originX - averageX;
    for (const item of nextItems) {
      item.x += shift;
    }
  }

  return nextItems;
}

function summarizeNodeConfig(node: WorkflowNode) {
  const config = isRecord(node.config) ? node.config : {};

  if (node.type === 'start') return '提交单据后进入审批';
  if (node.type === 'end') return '流程结束并写入结果';
  if (node.type === 'condition') return summarizeCondition(config);
  if (node.type === 'parallelGateway') return '并行分支执行与汇聚';
  if (node.type === 'cc') return `抄送给 ${summarizeAssigneeStrategy(config.assigneeStrategy)}`;
  if (node.type === 'serviceTask') return summarizeServiceTask(config);
  if (node.type === 'timer') return summarizeTimer(config);
  if (node.type === 'subProcess') return summarizeSubProcess(config);
  if (node.type === 'sign' || node.type === 'orSign') {
    const completion = node.type === 'orSign' ? '任一通过' : config.completionStrategy === 'any' ? '任一通过' : '全部通过';
    return `${completion}，${summarizeAssigneeStrategy(config.assigneeStrategy)}`;
  }

  return `由 ${summarizeAssigneeStrategy(config.assigneeStrategy)} 审批`;
}

function summarizeAssigneeStrategy(value: unknown) {
  if (!isRecord(value)) return '待配置处理人';

  const strategy = value as Partial<AssigneeStrategy> & Record<string, unknown>;

  if (strategy.type === 'initiatorManager') {
    const level = typeof strategy.level === 'number' ? strategy.level : 1;
    return `发起人第 ${level} 级主管`;
  }

  if (strategy.type === 'users') {
    const count = Array.isArray(strategy.userIds) ? strategy.userIds.length : 0;
    return count ? `${count} 个指定用户` : '指定用户';
  }

  if (strategy.type === 'roles') {
    const count = Array.isArray(strategy.roleCodes) ? strategy.roleCodes.length : 0;
    return count ? `${count} 个角色` : '指定角色';
  }

  if (strategy.type === 'departments') {
    const count = Array.isArray(strategy.departmentIds) ? strategy.departmentIds.length : 0;
    return count ? `${count} 个部门` : '指定部门';
  }

  if (strategy.type === 'field') return `表单字段 ${String(strategy.field ?? '') || '未设置'}`;
  if (strategy.type === 'expression') return '表达式动态计算';

  return '待配置处理人';
}

function summarizeCondition(config: Record<string, unknown>) {
  if (typeof config.expression === 'string' && config.expression.trim()) return '按表达式分支';
  if (typeof config.field === 'string' && config.field.trim()) return `按 ${config.field} 字段分支`;

  return '配置条件后分支流转';
}

function summarizeServiceTask(config: Record<string, unknown>) {
  const serviceName = typeof config.serviceName === 'string' ? config.serviceName : '';
  const serviceMethod = typeof config.serviceMethod === 'string' ? config.serviceMethod : '';

  return serviceName || serviceMethod ? `${serviceName}.${serviceMethod}`.replace(/^\./, '').replace(/\.$/, '') : '调用业务服务';
}

function summarizeTimer(config: Record<string, unknown>) {
  const delaySeconds = typeof config.delaySeconds === 'number' ? config.delaySeconds : 0;
  const action = typeof config.action === 'string' ? config.action : 'continue';

  if (delaySeconds <= 0) return `立即 ${action}`;

  return `${delaySeconds} 秒后 ${action}`;
}

function summarizeSubProcess(config: Record<string, unknown>) {
  const definitionCode = typeof config.definitionCode === 'string' ? config.definitionCode.trim() : '';

  return definitionCode ? `调用 ${definitionCode}` : '选择可复用流程';
}

function isConditionalEdge(edge: WorkflowEdge) {
  return Boolean(edge.condition && edge.condition.type !== 'always');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
