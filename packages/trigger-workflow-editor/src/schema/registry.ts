import type { TriggerNodeType, TriggerWorkflowKind } from './types';

export type TriggerNodeDefinition = {
  type: TriggerNodeType;
  label: string;
  category: 'trigger' | 'control' | 'human' | 'task' | 'data' | 'ai' | 'terminal';
  description: string;
  icon: string;
  accent: string;
  accentSoft: string;
  accentBorder: string;
  allowedKinds: TriggerWorkflowKind[];
  minOutgoing?: number;
  maxOutgoing?: number;
  allowIncoming: boolean;
  allowOutgoing: boolean;
};

export const triggerNodeDefinitions: TriggerNodeDefinition[] = [
  defineNode('start', '开始', 'trigger', '手动触发工作流的入口。', 'ri-play-circle-line', '#16a34a', ['approval', 'dataSync', 'aiAgent', 'custom'], false, true, 1, 1),
  defineNode('schedule', '定时触发', 'trigger', '通过 Trigger.dev 定时计划启动工作流。', 'ri-calendar-event-line', '#0f766e', ['dataSync', 'aiAgent', 'custom'], false, true, 1, 1),
  defineNode('webhook', 'Webhook 触发', 'trigger', '接收外部系统 HTTP 事件。', 'ri-webhook-line', '#2563eb', ['approval', 'dataSync', 'aiAgent', 'custom'], false, true, 1, 1),
  defineNode('manualApproval', '人工审批', 'human', '等待指定人员完成审批。', 'ri-user-follow-line', '#7c3aed', ['approval', 'custom'], true, true, 1, 1),
  defineNode('condition', '条件分支', 'control', '根据字段或表达式选择执行路径。', 'ri-git-branch-line', '#d97706', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 2),
  defineNode('parallel', '并行分支', 'control', '同时启动多个任务分支。', 'ri-git-merge-line', '#dc2626', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 2),
  defineNode('task', '执行任务', 'task', '执行一个 Trigger.dev 任务。', 'ri-flashlight-line', '#4f46e5', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('triggerAndWait', '触发并等待', 'task', '调用另一个任务并等待完成。', 'ri-timer-line', '#0891b2', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('batchTrigger', '批量触发', 'task', '成批触发任务并等待结果。', 'ri-stack-line', '#be123c', ['dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('wait', '等待', 'control', '按时长、日期或令牌暂停执行。', 'ri-time-line', '#db2777', ['approval', 'dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('dataSource', '读取数据', 'data', '从数据库、接口、文件或 SaaS 服务读取数据。', 'ri-database-2-line', '#0284c7', ['dataSync', 'custom'], true, true, 1, 1),
  defineNode('transform', '转换数据', 'data', '映射、清洗、补充或过滤记录。', 'ri-function-line', '#65a30d', ['dataSync', 'aiAgent', 'custom'], true, true, 1, 1),
  defineNode('dataSink', '写入数据', 'data', '将结果写入目标连接器。', 'ri-save-3-line', '#c2410c', ['dataSync', 'custom'], true, true, 1, 1),
  defineNode('agent', 'AI 智能体', 'ai', '执行 AI 智能体推理循环。', 'ri-robot-2-line', '#9333ea', ['aiAgent', 'custom'], true, true, 1, 1),
  defineNode('tool', '智能体工具', 'ai', '由 Trigger.dev 任务提供的智能体工具。', 'ri-tools-line', '#2563eb', ['aiAgent', 'custom'], true, true, 1, 1),
  defineNode('memory', '上下文记忆', 'ai', '读取或写入智能体上下文。', 'ri-brain-line', '#0d9488', ['aiAgent', 'custom'], true, true, 1, 1),
  defineNode('humanReview', '人工复核', 'human', '对 AI 结果或高风险操作进行人工确认。', 'ri-eye-check-line', '#a21caf', ['aiAgent', 'approval', 'custom'], true, true, 1, 1),
  defineNode('end', '结束', 'terminal', '工作流结束节点。', 'ri-checkbox-circle-line', '#475569', ['approval', 'dataSync', 'aiAgent', 'custom'], true, false, 0, 0)
];

const categoryLabels: Record<TriggerNodeDefinition['category'], string> = {
  trigger: '触发器',
  control: '流程控制',
  human: '人工处理',
  task: '任务',
  data: '数据处理',
  ai: '人工智能',
  terminal: '结束节点'
};

export const triggerNodeDefinitionMap = new Map(triggerNodeDefinitions.map((definition) => [definition.type, definition]));

export function getTriggerNodeDefinition(type: TriggerNodeType) {
  return triggerNodeDefinitionMap.get(type);
}

export function isBuiltInTriggerNodeType(type: TriggerNodeType) {
  return triggerNodeDefinitionMap.has(type);
}

export function getTriggerNodeDefinitionsForKind(kind: TriggerWorkflowKind) {
  return triggerNodeDefinitions.filter((definition) => definition.allowedKinds.includes(kind));
}

export function getTriggerNodeCategoryLabel(category: TriggerNodeDefinition['category']) {
  return categoryLabels[category];
}

function defineNode(
  type: TriggerNodeType,
  label: string,
  category: TriggerNodeDefinition['category'],
  description: string,
  icon: string,
  accent: string,
  allowedKinds: TriggerWorkflowKind[],
  allowIncoming: boolean,
  allowOutgoing: boolean,
  minOutgoing?: number,
  maxOutgoing?: number
): TriggerNodeDefinition {
  return {
    type,
    label,
    category,
    description,
    icon,
    accent,
    accentSoft: tint(accent, 0.92),
    accentBorder: tint(accent, 0.72),
    allowedKinds,
    allowIncoming,
    allowOutgoing,
    ...(minOutgoing !== undefined ? { minOutgoing } : {}),
    ...(maxOutgoing !== undefined ? { maxOutgoing } : {})
  };
}

function tint(hex: string, amount: number) {
  const clean = hex.replace('#', '');
  const value = Number.parseInt(clean, 16);
  const red = value >> 16;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(red)}, ${mix(green)}, ${mix(blue)})`;
}

