import {
  ConnectionLineType,
  MarkerType,
  Position,
  type Connection
} from '@vue-flow/core';
import { getTriggerNodeCategoryLabel, getTriggerNodeDefinition } from './schema/registry';
import type {
  TriggerNodeType,
  TriggerWorkflowEdge,
  TriggerWorkflowModel,
  TriggerWorkflowNode
} from './schema/types';

export const TRIGGER_FLOW_NODE_RENDER_TYPE = 'trigger-workflow-node';

export type TriggerFlowNodeData = {
  workflowType: TriggerNodeType;
  label: string;
  category: string;
  description: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  summary: string;
  isEntry: boolean;
  isEnd: boolean;
};

export type TriggerFlowNode = {
  id: string;
  label?: string;
  position: { x: number; y: number };
  type: string;
  data: TriggerFlowNodeData;
  draggable: boolean;
  deletable: boolean;
  selectable: boolean;
  connectable: boolean;
  sourcePosition: Position;
  targetPosition: Position;
};

export type TriggerFlowEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
  type?: string;
  markerEnd?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
  labelStyle?: Record<string, string | number>;
  labelBgStyle?: Record<string, string | number>;
  labelBgPadding?: [number, number];
  labelBgBorderRadius?: number;
  data?: { condition?: TriggerWorkflowEdge['condition'] };
};

export function triggerWorkflowToFlowNodes(model: TriggerWorkflowModel): TriggerFlowNode[] {
  return model.nodes.map((node, index) => ({
    id: node.id,
    label: node.name,
    position: node.position ?? { x: 380, y: 40 + index * 150 },
    type: TRIGGER_FLOW_NODE_RENDER_TYPE,
    data: getTriggerNodePresentation(node),
    draggable: !isEntryType(node.type) || node.type === 'start' || node.type === 'schedule',
    deletable: !isEntryType(node.type) && node.type !== 'end',
    selectable: true,
    connectable: true,
    sourcePosition: Position.Bottom,
    targetPosition: Position.Top
  }));
}

export function triggerWorkflowToFlowEdges(model: TriggerWorkflowModel): TriggerFlowEdge[] {
  return model.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    sourceHandle: 'out',
    targetHandle: 'in',
    label: edge.name,
    type: ConnectionLineType.SmoothStep,
    markerEnd: MarkerType.ArrowClosed,
    animated: Boolean(edge.condition),
    style: {
      stroke: edge.condition ? '#d97706' : '#64748b',
      strokeWidth: 2
    },
    labelStyle: {
      fill: '#475569',
      fontSize: 11,
      fontWeight: 700
    },
    labelBgStyle: {
      fill: '#ffffff',
      stroke: '#dbe4f0',
      strokeWidth: 1
    },
    labelBgPadding: [7, 4],
    labelBgBorderRadius: 5,
    data: {
      condition: edge.condition
    }
  }));
}

export function flowToTriggerWorkflow(
  model: TriggerWorkflowModel,
  nodes: TriggerFlowNode[],
  edges: TriggerFlowEdge[]
): TriggerWorkflowModel {
  const nodeMap = new Map(model.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(model.edges.map((edge) => [edge.id, edge]));

  return {
    ...model,
    nodes: nodes.map((node): TriggerWorkflowNode => {
      const existing = nodeMap.get(node.id);
      return {
        ...(existing ?? {}),
        id: node.id,
        type: node.data.workflowType,
        name: readLabel(node.label) || node.data.label,
        position: {
          x: node.position.x,
          y: node.position.y
        }
      };
    }),
    edges: edges.map((edge): TriggerWorkflowEdge => {
      const existing = edgeMap.get(edge.id);
      return {
        ...(existing ?? {}),
        id: edge.id,
        source: edge.source,
        target: edge.target,
        ...(readLabel(edge.label) ? { name: readLabel(edge.label) } : {}),
        ...(edge.data?.condition ? { condition: edge.data.condition } : {})
      };
    })
  };
}

export function connectionToTriggerFlowEdge(connection: Connection, id: string): TriggerFlowEdge {
  return {
    id,
    source: connection.source,
    target: connection.target,
    sourceHandle: connection.sourceHandle ?? 'out',
    targetHandle: connection.targetHandle ?? 'in',
    type: ConnectionLineType.SmoothStep,
    markerEnd: MarkerType.ArrowClosed,
    style: {
      stroke: '#64748b',
      strokeWidth: 2
    }
  };
}

export function autoLayoutTriggerFlowNodes(nodes: TriggerFlowNode[], edges: TriggerFlowEdge[]) {
  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  nodes.forEach((node) => {
    outgoing.set(node.id, []);
    incomingCount.set(node.id, 0);
  });
  edges.forEach((edge) => {
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  });

  const entries = nodes.filter((node) => node.data.isEntry).map((node) => node.id);
  const queue = entries.length ? [...entries] : nodes.filter((node) => (incomingCount.get(node.id) ?? 0) === 0).map((node) => node.id);
  const levels = new Map<string, number>(queue.map((id) => [id, 0]));

  while (queue.length) {
    const id = queue.shift();
    if (!id) continue;
    const level = levels.get(id) ?? 0;
    for (const target of outgoing.get(id) ?? []) {
      const nextLevel = level + 1;
      if ((levels.get(target) ?? -1) < nextLevel) {
        levels.set(target, nextLevel);
        queue.push(target);
      }
    }
  }

  const groups = new Map<number, TriggerFlowNode[]>();
  nodes.forEach((node) => {
    const level = levels.get(node.id) ?? groups.size;
    groups.set(level, [...(groups.get(level) ?? []), node]);
  });

  return nodes.map((node) => {
    const level = levels.get(node.id) ?? 0;
    const siblings = groups.get(level) ?? [node];
    const index = siblings.findIndex((item) => item.id === node.id);
    const spacing = 310;
    const center = 380;
    const start = center - ((siblings.length - 1) * spacing) / 2;
    return {
      ...node,
      position: {
        x: start + index * spacing,
        y: 40 + level * 160
      }
    };
  });
}

export function getTriggerNodePresentation(node: TriggerWorkflowNode): TriggerFlowNodeData {
  const definition = getTriggerNodeDefinition(node.type);
  return {
    workflowType: node.type,
    label: node.name,
    category: definition ? getTriggerNodeCategoryLabel(definition.category) : '自定义',
    description: node.description ?? definition?.description ?? '',
    icon: definition?.icon ?? 'TASK',
    accent: definition?.accent ?? '#334155',
    accentSoft: definition?.accentSoft ?? '#f8fafc',
    accentBorder: definition?.accentBorder ?? '#cbd5e1',
    summary: summarizeNode(node),
    isEntry: isEntryType(node.type),
    isEnd: node.type === 'end'
  };
}

function summarizeNode(node: TriggerWorkflowNode) {
  const config = node.config;
  if (node.type === 'schedule') {
    return `${describeScheduleCron(config?.schedule?.cron)} · ${config?.schedule?.timezone ?? 'UTC'}`;
  }
  if (node.type === 'webhook') return 'POST /api/service';
  if (node.type === 'manualApproval' || node.type === 'humanReview') {
    return `${approvalAssigneeLabels[config?.approval?.assigneeType ?? ''] ?? '未指定处理人'} · ${approvalTimeoutLabels[config?.approval?.onTimeout ?? ''] ?? '标记失败'}`;
  }
  if (node.type === 'wait') {
    const mode = config?.wait?.mode ?? 'duration';
    const detail = config?.wait?.duration ?? config?.wait?.until ?? config?.wait?.tokenKey ?? '未配置';
    return `${waitModeLabels[mode] ?? '等待'} · ${detail}`;
  }
  if (node.type === 'agent') return `${config?.ai?.provider ?? 'AI'} · ${config?.ai?.model ?? '未配置模型'}`;
  if (node.type === 'dataSource' || node.type === 'dataSink') {
    const operation = config?.data?.operation ?? 'sync';
    return `${config?.data?.connector ?? '未配置连接器'} · ${dataOperationLabels[operation] ?? '同步'}`;
  }
  if (node.type === 'condition') return '按条件选择执行路径';
  if (node.type === 'parallel') return '并行执行多个分支';
  if (config?.task?.type === 'frontendCommand') return '发送前端指令 · 自定义函数';
  if (config?.task?.type === 'backendCommand') return '执行后端指令 · 自定义函数';
  if (config?.task?.type === 'storedProcedure') {
    const procedure = config.task.procedureName ?? '未配置存储过程';
    const schema = config.task.procedureSchema;
    return `执行存储过程 · ${schema && !procedure.includes('.') ? `${schema}.${procedure}` : procedure}`;
  }
  return config?.task?.id ?? node.description ?? '未配置';
}

function describeScheduleCron(cron?: string) {
  const parts = cron?.trim().split(/\s+/) ?? [];
  if (parts.length !== 5) return '未配置 Cron';

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
  const intervalMatch = minute.match(/^\*\/([1-5]?\d)$/);
  if (intervalMatch && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return `每 ${intervalMatch[1]} 分钟`;
  }

  const time = describeCronTime(minute, hour);
  if (!time) return cron ?? '未配置 Cron';
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '*') return `每天 ${time}`;
  if (dayOfMonth === '*' && month === '*' && dayOfWeek === '1-5') return `周一至周五 ${time}`;
  if (dayOfMonth === '*' && month === '*' && /^[0-7]$/.test(dayOfWeek)) {
    const weekday = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][Number(dayOfWeek) % 7];
    return `每${weekday} ${time}`;
  }
  if (month === '*' && dayOfWeek === '*' && /^\d{1,2}$/.test(dayOfMonth)) {
    return `每月 ${dayOfMonth} 日 ${time}`;
  }
  return cron ?? '未配置 Cron';
}

function describeCronTime(minute: string, hour: string) {
  if (!/^\d{1,2}$/.test(minute) || !/^\d{1,2}$/.test(hour)) return '';
  const parsedMinute = Number(minute);
  const parsedHour = Number(hour);
  if (parsedMinute > 59 || parsedHour > 23) return '';
  return `${String(parsedHour).padStart(2, '0')}:${String(parsedMinute).padStart(2, '0')}`;
}

const approvalAssigneeLabels: Record<string, string> = {
  user: '用户',
  role: '角色',
  team: '团队',
  expression: '表达式'
};

const approvalTimeoutLabels: Record<string, string> = {
  fail: '标记失败',
  autoApprove: '自动通过',
  autoReject: '自动驳回',
  continue: '继续执行'
};

const waitModeLabels: Record<string, string> = {
  duration: '等待时长',
  until: '指定时间',
  token: '等待令牌'
};

const dataOperationLabels: Record<string, string> = {
  extract: '提取',
  load: '写入',
  sync: '同步',
  query: '查询',
  upsert: '更新或插入'
};

function isEntryType(type: TriggerNodeType) {
  return type === 'start' || type === 'schedule' || type === 'webhook';
}

function readLabel(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

