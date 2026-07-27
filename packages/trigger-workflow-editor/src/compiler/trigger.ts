import { assertValidTriggerWorkflow } from '../schema/validate';
import type {
  TriggerEdgeCondition,
  TriggerWorkflowModel,
  TriggerWorkflowNode,
  TriggerWorkflowTaskRef
} from '../schema/types';

export type TriggerWorkflowOperationType =
  | 'entry'
  | 'schedule'
  | 'webhook'
  | 'task.trigger'
  | 'task.triggerAndWait'
  | 'task.batchTriggerAndWait'
  | 'wait.for'
  | 'wait.until'
  | 'wait.forToken'
  | 'condition'
  | 'parallel'
  | 'human.approval'
  | 'ai.agent'
  | 'data.connector'
  | 'complete';

export type TriggerWorkflowOperation = {
  id: string;
  nodeId: string;
  type: TriggerWorkflowOperationType;
  label: string;
  task?: TriggerWorkflowTaskRef;
  condition?: TriggerEdgeCondition;
  dependsOn: string[];
  next: string[];
  options: Record<string, unknown>;
};

export type TriggerWorkflowExecutionPlan = {
  workflowId: string;
  workflowCode: string;
  workflowName: string;
  kind: TriggerWorkflowModel['kind'];
  entryNodeId: string;
  operations: TriggerWorkflowOperation[];
  taskIds: string[];
  schedule?: {
    nodeId: string;
    cron: string;
    timezone?: string;
    externalId?: string;
  };
};

export function compileTriggerWorkflow(model: TriggerWorkflowModel): TriggerWorkflowExecutionPlan {
  assertValidTriggerWorkflow(model);

  const incoming = new Map<string, string[]>();
  const outgoing = new Map<string, string[]>();
  model.nodes.forEach((node) => {
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  });
  model.edges.forEach((edge) => {
    incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge.source]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  });

  const entry = model.nodes.find((node) => node.type === 'start' || node.type === 'schedule' || node.type === 'webhook');
  if (!entry) {
    throw new Error('Trigger workflow requires an entry node.');
  }

  const operations = model.nodes.map((node) => {
    const nextEdges = model.edges.filter((edge) => edge.source === node.id);
    return compileNodeOperation(node, incoming.get(node.id) ?? [], nextEdges);
  });

  const taskIds = Array.from(
    new Set(
      operations
        .map((operation) => operation.task?.id)
        .filter((taskId): taskId is string => Boolean(taskId))
    )
  );
  const scheduleNode = model.nodes.find((node) => node.type === 'schedule');

  return {
    workflowId: model.id ?? model.code,
    workflowCode: model.code,
    workflowName: model.name,
    kind: model.kind,
    entryNodeId: entry.id,
    operations,
    taskIds,
    ...(scheduleNode?.config?.schedule?.cron
      ? {
          schedule: {
            nodeId: scheduleNode.id,
            cron: scheduleNode.config.schedule.cron,
            ...(scheduleNode.config.schedule.timezone ? { timezone: scheduleNode.config.schedule.timezone } : {}),
            ...(scheduleNode.config.schedule.externalId ? { externalId: scheduleNode.config.schedule.externalId } : {})
          }
        }
      : {})
  };
}

function compileNodeOperation(
  node: TriggerWorkflowNode,
  incomingNodeIds: string[],
  outgoingEdges: Array<{ target: string; condition?: TriggerEdgeCondition }>
): TriggerWorkflowOperation {
  const base = {
    id: `op_${node.id}`,
    nodeId: node.id,
    label: node.name,
    dependsOn: incomingNodeIds,
    next: outgoingEdges.map((edge) => edge.target),
    options: node.config?.metadata ?? {}
  };

  switch (node.type) {
    case 'start':
      return { ...base, type: 'entry' };
    case 'schedule':
      return { ...base, type: 'schedule', options: node.config?.schedule ?? {} };
    case 'webhook':
      return { ...base, type: 'webhook', options: node.config?.webhook ?? {} };
    case 'manualApproval':
    case 'humanReview':
      return { ...base, type: 'human.approval', task: node.config?.task, options: node.config?.approval ?? {} };
    case 'condition':
      return { ...base, type: 'condition', options: { branches: outgoingEdges } };
    case 'parallel':
      return { ...base, type: 'parallel', options: { branches: outgoingEdges.map((edge) => edge.target) } };
    case 'triggerAndWait':
      return { ...base, type: 'task.triggerAndWait', task: node.config?.task };
    case 'batchTrigger':
      return { ...base, type: 'task.batchTriggerAndWait', task: node.config?.task, options: node.config?.data ?? {} };
    case 'wait':
      return compileWaitOperation(node, base);
    case 'dataSource':
    case 'dataSink':
      return { ...base, type: 'data.connector', task: node.config?.task, options: node.config?.data ?? {} };
    case 'agent':
      return { ...base, type: 'ai.agent', task: node.config?.task, options: node.config?.ai ?? {} };
    case 'tool':
      return { ...base, type: 'task.triggerAndWait', task: node.config?.task, options: { aiTool: true } };
    case 'memory':
    case 'transform':
    case 'task':
      return { ...base, type: 'task.trigger', task: node.config?.task, options: node.config ?? {} };
    case 'end':
      return { ...base, type: 'complete' };
    default:
      return { ...base, type: 'task.trigger', task: node.config?.task, options: node.config ?? {} };
  }
}

function compileWaitOperation(
  node: TriggerWorkflowNode,
  base: Omit<TriggerWorkflowOperation, 'type'>
): TriggerWorkflowOperation {
  const wait = node.config?.wait;
  if (wait?.mode === 'until') return { ...base, type: 'wait.until', options: wait };
  if (wait?.mode === 'token') return { ...base, type: 'wait.forToken', options: wait };
  return { ...base, type: 'wait.for', options: wait ?? {} };
}

