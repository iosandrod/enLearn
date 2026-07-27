import { isBuiltInTriggerNodeType } from './registry';
import { isRecord } from './normalize';
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
    push(issues, 'error', 'schemaVersion', `Unsupported schema version ${model.schemaVersion}.`);
  }
  if (!model.code.trim()) push(issues, 'error', 'code', 'Workflow code is required.');
  if (!model.name.trim()) push(issues, 'error', 'name', 'Workflow name is required.');
  if (!model.nodes.length) push(issues, 'error', 'nodes', 'Workflow requires nodes.');

  model.nodes.forEach((node, index) => {
    const path = `nodes.${index}`;
    if (!node.id.trim()) {
      push(issues, 'error', `${path}.id`, 'Node ID is required.');
    } else if (nodeIds.has(node.id)) {
      push(issues, 'error', `${path}.id`, `Duplicate node ID "${node.id}".`);
    } else {
      nodeIds.add(node.id);
    }
    if (!isBuiltInTriggerNodeType(node.type)) {
      push(issues, 'error', `${path}.type`, `Unsupported node type "${node.type}".`);
    }
    if (!node.name.trim()) push(issues, 'error', `${path}.name`, 'Node name is required.');
    validateNodeConfig(node, issues, path);
  });

  const entryNodes = model.nodes.filter((node) => node.type === 'start' || node.type === 'schedule' || node.type === 'webhook');
  const endNodes = model.nodes.filter((node) => node.type === 'end');
  if (entryNodes.length !== 1) push(issues, 'error', 'nodes', 'Workflow requires exactly one entry node.');
  if (!endNodes.length) push(issues, 'error', 'nodes', 'Workflow requires at least one end node.');

  model.edges.forEach((edge, index) => {
    const path = `edges.${index}`;
    if (!edge.id.trim()) {
      push(issues, 'error', `${path}.id`, 'Edge ID is required.');
    } else if (edgeIds.has(edge.id)) {
      push(issues, 'error', `${path}.id`, `Duplicate edge ID "${edge.id}".`);
    } else {
      edgeIds.add(edge.id);
    }
    if (!nodeIds.has(edge.source)) push(issues, 'error', `${path}.source`, `Source node "${edge.source}" does not exist.`);
    if (!nodeIds.has(edge.target)) push(issues, 'error', `${path}.target`, `Target node "${edge.target}" does not exist.`);
    if (edge.source === edge.target) push(issues, 'error', path, 'Self-loop edges are not supported.');
    if (edge.condition?.type === 'field' && !edge.condition.field.trim()) {
      push(issues, 'error', `${path}.condition.field`, 'Field condition requires a field.');
    }
    if (edge.condition?.type === 'expression' && !edge.condition.expression.trim()) {
      push(issues, 'error', `${path}.condition.expression`, 'Expression condition requires an expression.');
    }
  });

  const incoming = countEdges(model, 'target');
  const outgoing = countEdges(model, 'source');
  model.nodes.forEach((node, index) => {
    const path = `nodes.${index}`;
    const isEntry = node.type === 'start' || node.type === 'schedule' || node.type === 'webhook';
    if (!isEntry && (incoming.get(node.id) ?? 0) === 0) push(issues, 'error', path, 'Node requires an incoming edge.');
    if (node.type !== 'end' && (outgoing.get(node.id) ?? 0) === 0) push(issues, 'error', path, 'Node requires an outgoing edge.');
    if (node.type === 'condition' && (outgoing.get(node.id) ?? 0) < 2) push(issues, 'error', path, 'Condition requires at least two branches.');
    if (node.type === 'parallel' && (outgoing.get(node.id) ?? 0) < 2) push(issues, 'error', path, 'Parallel requires at least two branches.');
    if (!isEntry && node.type !== 'end' && node.type !== 'condition' && node.type !== 'parallel' && (outgoing.get(node.id) ?? 0) > 1) {
      push(issues, 'error', path, `${node.type} supports one outgoing edge.`);
    }
  });

  if (entryNodes.length === 1) {
    const reachable = collectReachable(model, entryNodes[0].id);
    model.nodes.forEach((node, index) => {
      if (!reachable.has(node.id)) push(issues, 'error', `nodes.${index}`, `Node "${node.id}" is unreachable.`);
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

  if (['task', 'triggerAndWait', 'batchTrigger', 'tool'].includes(node.type) && !task?.id?.trim()) {
    push(issues, 'error', `${path}.config.task.id`, `${node.type} requires a Trigger.dev task ID.`);
  }
  if (task?.timeoutSeconds !== undefined && (!Number.isInteger(task.timeoutSeconds) || task.timeoutSeconds < 1)) {
    push(issues, 'error', `${path}.config.task.timeoutSeconds`, 'Task timeout must be a positive integer.');
  }
  if (task?.queue?.concurrencyLimit !== undefined && (!Number.isInteger(task.queue.concurrencyLimit) || task.queue.concurrencyLimit < 1)) {
    push(issues, 'error', `${path}.config.task.queue.concurrencyLimit`, 'Queue concurrency must be a positive integer.');
  }
  if (node.type === 'schedule') {
    if (!config.schedule?.cron?.trim()) push(issues, 'error', `${path}.config.schedule.cron`, 'Schedule requires a cron expression.');
    if (!config.schedule?.timezone?.trim()) push(issues, 'warning', `${path}.config.schedule.timezone`, 'Schedule should define a timezone.');
  }
  if (node.type === 'manualApproval' || node.type === 'humanReview') {
    if (!config.approval?.assigneeType) push(issues, 'error', `${path}.config.approval.assigneeType`, 'Human step requires an assignee type.');
  }
  if (node.type === 'wait') {
    const wait = config.wait;
    if (!wait?.mode) push(issues, 'error', `${path}.config.wait.mode`, 'Wait node requires a mode.');
    if (wait?.mode === 'duration' && !wait.duration?.trim()) push(issues, 'error', `${path}.config.wait.duration`, 'Duration wait requires an ISO duration.');
    if (wait?.mode === 'until' && (!wait.until || Number.isNaN(new Date(wait.until).getTime()))) push(issues, 'error', `${path}.config.wait.until`, 'Until wait requires a valid datetime.');
    if (wait?.mode === 'token' && !wait.tokenKey?.trim()) push(issues, 'error', `${path}.config.wait.tokenKey`, 'Token wait requires a token key.');
  }
  if (['dataSource', 'dataSink'].includes(node.type) && !config.data?.connector?.trim()) {
    push(issues, 'error', `${path}.config.data.connector`, `${node.type} requires a connector.`);
  }
  if (node.type === 'agent') {
    if (!config.ai?.model?.trim()) push(issues, 'error', `${path}.config.ai.model`, 'Agent requires a model.');
    if (!config.ai?.prompt?.trim()) push(issues, 'warning', `${path}.config.ai.prompt`, 'Agent should define a prompt.');
  }
  if (node.type === 'transform' && !config.expression?.trim() && !isRecord(config.data?.mapping)) {
    push(issues, 'warning', `${path}.config`, 'Transform should define an expression or mapping.');
  }
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

