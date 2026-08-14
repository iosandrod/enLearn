import { isBuiltInTriggerNodeType } from './registry';
import { isRecord } from './normalize';
import {
  TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES,
  isRegisteredTriggerWorkflowQueue
} from '../runtime-catalog';
import {
  TRIGGER_WORKFLOW_SCHEMA_VERSION,
  type TriggerWorkflowIssue,
  type TriggerWorkflowModel,
  type TriggerWorkflowNode
} from './types';

export class TriggerWorkflowValidationError extends Error {
  constructor(public readonly issues: TriggerWorkflowIssue[]) {
    super(issues.map((issue) => `${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'TriggerWorkflowValidationError';
  }
}

export function validateTriggerWorkflow(model: TriggerWorkflowModel) {
  const issues: TriggerWorkflowIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();

  if (model.schemaVersion !== TRIGGER_WORKFLOW_SCHEMA_VERSION) {
    push(issues, 'error', 'schemaVersion', `不支持架构版本 ${model.schemaVersion}。`);
  }
  if (!model.code.trim()) push(issues, 'error', 'code', '工作流编码不能为空。');
  if (!model.name.trim()) push(issues, 'error', 'name', '工作流名称不能为空。');
  if (!model.nodes.length) push(issues, 'error', 'nodes', '工作流至少需要一个节点。');

  model.nodes.forEach((node, index) => {
    const path = `nodes.${index}`;
    if (!node.id.trim()) {
      push(issues, 'error', `${path}.id`, '节点 ID 不能为空。');
    } else if (nodeIds.has(node.id)) {
      push(issues, 'error', `${path}.id`, `节点 ID“${node.id}”重复。`);
    } else {
      nodeIds.add(node.id);
    }
    if (!isBuiltInTriggerNodeType(node.type)) {
      push(issues, 'error', `${path}.type`, `不支持节点类型“${node.type}”。`);
    }
    if (!node.name.trim()) push(issues, 'error', `${path}.name`, '节点名称不能为空。');
    validateNodeConfig(node, issues, path);
  });

  const entryNodes = model.nodes.filter((node) => node.type === 'start' || node.type === 'schedule' || node.type === 'webhook');
  const endNodes = model.nodes.filter((node) => node.type === 'end');
  if (entryNodes.length !== 1) push(issues, 'error', 'nodes', '工作流必须且只能有一个入口节点。');
  if (!endNodes.length) push(issues, 'error', 'nodes', '工作流至少需要一个结束节点。');

  model.edges.forEach((edge, index) => {
    const path = `edges.${index}`;
    if (!edge.id.trim()) {
      push(issues, 'error', `${path}.id`, '连接 ID 不能为空。');
    } else if (edgeIds.has(edge.id)) {
      push(issues, 'error', `${path}.id`, `连接 ID“${edge.id}”重复。`);
    } else {
      edgeIds.add(edge.id);
    }
    if (!nodeIds.has(edge.source)) push(issues, 'error', `${path}.source`, `起点“${edge.source}”不存在。`);
    if (!nodeIds.has(edge.target)) push(issues, 'error', `${path}.target`, `终点“${edge.target}”不存在。`);
    if (edge.source === edge.target) push(issues, 'error', path, '不支持节点连接自身。');
    if (edge.condition?.type === 'field' && !edge.condition.field.trim()) {
      push(issues, 'error', `${path}.condition.field`, '字段判断必须指定字段。');
    }
    if (edge.condition?.type === 'expression' && !edge.condition.expression.trim()) {
      push(issues, 'error', `${path}.condition.expression`, '表达式判断必须填写表达式。');
    }
  });

  const incoming = countEdges(model, 'target');
  const outgoing = countEdges(model, 'source');
  model.nodes.forEach((node, index) => {
    const path = `nodes.${index}`;
    const isEntry = node.type === 'start' || node.type === 'schedule' || node.type === 'webhook';
    if (!isEntry && (incoming.get(node.id) ?? 0) === 0) push(issues, 'error', path, '节点缺少入线。');
    if (node.type !== 'end' && (outgoing.get(node.id) ?? 0) === 0) push(issues, 'error', path, '节点缺少出线。');
    if (node.type === 'condition' && (outgoing.get(node.id) ?? 0) < 2) push(issues, 'error', path, '条件节点至少需要两个分支。');
    if (node.type === 'parallel' && (outgoing.get(node.id) ?? 0) < 2) push(issues, 'error', path, '并行节点至少需要两个分支。');
    if (!isEntry && node.type !== 'end' && node.type !== 'condition' && node.type !== 'parallel' && (outgoing.get(node.id) ?? 0) > 1) {
      push(issues, 'error', path, `${node.type} 节点只能有一条出线。`);
    }
  });

  if (entryNodes.length === 1) {
    const reachable = collectReachable(model, entryNodes[0].id);
    model.nodes.forEach((node, index) => {
      if (!reachable.has(node.id)) push(issues, 'error', `nodes.${index}`, `无法从入口到达节点“${node.id}”。`);
    });
  }

  return issues;
}

export function assertValidTriggerWorkflow(model: TriggerWorkflowModel) {
  const issues = validateTriggerWorkflow(model);
  const errors = issues.filter((issue) => issue.level === 'error');
  if (errors.length) throw new TriggerWorkflowValidationError(errors);
  return issues;
}

function validateNodeConfig(node: TriggerWorkflowNode, issues: TriggerWorkflowIssue[], path: string) {
  const config = node.config ?? {};
  const task = config.task;
  const taskType = task?.type;

  if (task && !taskType) {
    push(issues, 'error', `${path}.config.task.type`, '任务配置必须选择任务类型。');
  } else if (['task', 'triggerAndWait', 'batchTrigger', 'tool'].includes(node.type) && !taskType) {
    push(issues, 'error', `${path}.config.task.type`, `${node.type} 节点必须选择任务类型。`);
  }
  if (taskType === 'registeredTask' && !task?.id?.trim()) {
    push(issues, 'error', `${path}.config.task.id`, '已注册任务必须填写 Trigger.dev 任务 ID。');
  }
  if (taskType === 'frontendCommand' && !task?.frontendFunction?.trim()) {
    push(issues, 'error', `${path}.config.task.frontendFunction`, '发送前端指令必须填写前端指令函数。');
  }
  if (taskType === 'backendCommand' && !task?.backendFunction?.trim()) {
    push(issues, 'error', `${path}.config.task.backendFunction`, '执行后端指令必须填写后端指令函数。');
  }
  if (taskType === 'storedProcedure') {
    if (!task?.procedureName?.trim()) {
      push(issues, 'error', `${path}.config.task.procedureName`, '执行存储过程必须填写存储过程名称。');
    } else if (!isQualifiedIdentifier(task.procedureName)) {
      push(issues, 'error', `${path}.config.task.procedureName`, '存储过程名称只能包含字母、数字、下划线和单个架构分隔符。');
    }
    if (task?.procedureSchema && !isIdentifier(task.procedureSchema)) {
      push(issues, 'error', `${path}.config.task.procedureSchema`, '存储过程架构名称无效。');
    }
  }
  if (task?.timeoutSeconds !== undefined && (!Number.isInteger(task.timeoutSeconds) || task.timeoutSeconds < 1)) {
    push(issues, 'error', `${path}.config.task.timeoutSeconds`, '任务超时必须是正整数。');
  }
  const queueName = task?.queue?.name?.trim();
  if (queueName && !isRegisteredTriggerWorkflowQueue(queueName)) {
    push(
      issues,
      'error',
      `${path}.config.task.queue.name`,
      `队列“${queueName}”未随当前 worker 注册。可用队列：${TRIGGER_WORKFLOW_REGISTERED_QUEUE_NAMES.join('、')}。`
    );
  }
  if (task?.queue?.concurrencyLimit !== undefined) {
    push(
      issues,
      'error',
      `${path}.config.task.queue.concurrencyLimit`,
      '队列并发上限由 Trigger.dev worker 静态注册，不能在流程节点中修改。'
    );
  }
  if (task?.priority !== undefined && (!Number.isInteger(task.priority) || task.priority < 0 || task.priority > 100)) {
    push(issues, 'error', `${path}.config.task.priority`, '任务优先级必须是 0 到 100 之间的整数。');
  }
  if (
    task?.retry?.maxAttempts !== undefined &&
    (!Number.isInteger(task.retry.maxAttempts) || task.retry.maxAttempts < 0)
  ) {
    push(issues, 'error', `${path}.config.task.retry.maxAttempts`, '最大尝试次数必须是非负整数。');
  }
  if (task?.retry?.factor !== undefined && (!Number.isFinite(task.retry.factor) || task.retry.factor < 1)) {
    push(issues, 'error', `${path}.config.task.retry.factor`, '重试退避倍数必须大于或等于 1。');
  }
  const minRetry = task?.retry?.minTimeoutMs;
  const maxRetry = task?.retry?.maxTimeoutMs;
  if (minRetry !== undefined && (!Number.isInteger(minRetry) || minRetry < 0)) {
    push(issues, 'error', `${path}.config.task.retry.minTimeoutMs`, '最小重试间隔必须是非负整数。');
  }
  if (maxRetry !== undefined && (!Number.isInteger(maxRetry) || maxRetry < 0)) {
    push(issues, 'error', `${path}.config.task.retry.maxTimeoutMs`, '最大重试间隔必须是非负整数。');
  }
  if (minRetry !== undefined && maxRetry !== undefined && minRetry > maxRetry) {
    push(issues, 'error', `${path}.config.task.retry`, '最小重试间隔不能大于最大重试间隔。');
  }
  if (task?.failureStrategy === 'useDefaultOutput' && task.defaultOutput === undefined) {
    push(issues, 'error', `${path}.config.task.defaultOutput`, '使用默认输出继续时必须配置默认输出。');
  }
  if (node.type === 'schedule') {
    if (!config.schedule?.cron?.trim()) push(issues, 'error', `${path}.config.schedule.cron`, '定时节点必须填写 Cron 表达式。');
    if (!config.schedule?.timezone?.trim()) push(issues, 'warning', `${path}.config.schedule.timezone`, '建议为定时节点指定时区。');
  }
  if (node.type === 'manualApproval' || node.type === 'humanReview') {
    if (!config.approval?.assigneeType) push(issues, 'error', `${path}.config.approval.assigneeType`, '人工节点必须指定处理人类型。');
  }
  if (node.type === 'wait') {
    const wait = config.wait;
    if (!wait?.mode) push(issues, 'error', `${path}.config.wait.mode`, '等待节点必须指定等待方式。');
    if (wait?.mode === 'duration' && !wait.duration?.trim()) push(issues, 'error', `${path}.config.wait.duration`, '等待时长必须使用 ISO 时长格式。');
    if (wait?.mode === 'until' && (!wait.until || Number.isNaN(new Date(wait.until).getTime()))) push(issues, 'error', `${path}.config.wait.until`, '请填写有效的结束时间。');
    if (wait?.mode === 'token' && !wait.tokenKey?.trim()) push(issues, 'error', `${path}.config.wait.tokenKey`, '等待令牌时必须填写令牌键。');
  }
  if (['dataSource', 'dataSink'].includes(node.type) && !config.data?.connector?.trim()) {
    push(issues, 'error', `${path}.config.data.connector`, `${node.type} 节点必须指定连接器。`);
  }
  if (node.type === 'agent') {
    if (!config.ai?.model?.trim()) push(issues, 'error', `${path}.config.ai.model`, 'AI 智能体必须指定模型。');
    if (!config.ai?.prompt?.trim()) push(issues, 'warning', `${path}.config.ai.prompt`, '建议为 AI 智能体填写系统提示词。');
  }
  if (node.type === 'transform' && !config.expression?.trim() && !isRecord(config.data?.mapping)) {
    push(issues, 'warning', `${path}.config`, '数据转换节点应填写表达式或字段映射。');
  }
}

function isIdentifier(value: string) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value.trim());
}

function isQualifiedIdentifier(value: string) {
  const parts = value.trim().split('.');
  return parts.length <= 2 && parts.every(isIdentifier);
}

function push(issues: TriggerWorkflowIssue[], level: TriggerWorkflowIssue['level'], path: string, message: string) {
  issues.push({ level, path, message });
}

function countEdges(model: TriggerWorkflowModel, key: 'source' | 'target') {
  const counts = new Map<string, number>();
  model.edges.forEach((edge) => counts.set(edge[key], (counts.get(edge[key]) ?? 0) + 1));
  return counts;
}

function collectReachable(model: TriggerWorkflowModel, entryId: string) {
  const reachable = new Set<string>();
  const outgoing = new Map<string, string[]>();
  model.edges.forEach((edge) => outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]));
  const stack = [entryId];
  while (stack.length) {
    const id = stack.pop();
    if (!id || reachable.has(id)) continue;
    reachable.add(id);
    stack.push(...(outgoing.get(id) ?? []));
  }
  return reachable;
}

