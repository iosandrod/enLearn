import {
  compileTriggerWorkflow,
  type TriggerWorkflowExecutionPlan,
  type TriggerWorkflowOperation
} from './compiler/trigger';
import type {
  TriggerWorkflowModel,
  TriggerWorkflowTaskRef,
  TriggerWorkflowTaskType
} from './schema/types';
import { isRegisteredTriggerWorkflowQueue } from './runtime-catalog';

export const TRIGGER_WORKFLOW_JOB_DEFINITION_VERSION = 1 as const;
export const TRIGGER_WORKFLOW_RUNNER_TASK_ID = 'workflow.trigger-workflow.run';

export const TRIGGER_WORKFLOW_ADAPTER_TASK_IDS = {
  frontendCommand: 'workflow.adapter.frontend-command',
  backendCommand: 'workflow.adapter.backend-command',
  storedProcedure: 'workflow.adapter.stored-procedure'
} as const;

type TaskAdapterBase = {
  type: TriggerWorkflowTaskType;
  executorTaskId: string;
  input: Record<string, unknown>;
  outputPath?: string;
  outputMapping?: Record<string, string>;
  failureStrategy: NonNullable<TriggerWorkflowTaskRef['failureStrategy']>;
  defaultOutput?: unknown;
  priority?: number;
  tags?: string[];
  queue?: { name: string };
  retry?: TriggerWorkflowTaskRef['retry'];
  timeoutSeconds?: number;
  idempotencyKey?: string;
};

export type FrontendCommandJobAdapter = TaskAdapterBase & {
  type: 'frontendCommand';
  executorTaskId: typeof TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand;
  functionSource: string;
};

export type BackendCommandJobAdapter = TaskAdapterBase & {
  type: 'backendCommand';
  executorTaskId: typeof TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand;
  functionSource: string;
};

export type StoredProcedureJobAdapter = TaskAdapterBase & {
  type: 'storedProcedure';
  executorTaskId: typeof TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure;
  procedureName: string;
  procedureSchema: string;
};

export type RegisteredTaskJobAdapter = TaskAdapterBase & {
  type: 'registeredTask';
  executorTaskId: string;
  importPath?: string;
};

export type TriggerWorkflowTaskJobAdapter =
  | FrontendCommandJobAdapter
  | BackendCommandJobAdapter
  | StoredProcedureJobAdapter
  | RegisteredTaskJobAdapter;

export type TriggerWorkflowJobOperation = Omit<TriggerWorkflowOperation, 'task'> & {
  adapter?: TriggerWorkflowTaskJobAdapter;
};

export type TriggerWorkflowJobExecutionPlan = Omit<TriggerWorkflowExecutionPlan, 'operations'> & {
  operations: TriggerWorkflowJobOperation[];
};

export type TriggerWorkflowJobDefinitionPayload = {
  version: typeof TRIGGER_WORKFLOW_JOB_DEFINITION_VERSION;
  modelId: string;
  modelCode: string;
  modelName: string;
  planSignature: string;
  executionPlan: TriggerWorkflowJobExecutionPlan;
};

export type TriggerWorkflowJobDefinition = {
  code: string;
  name: string;
  type: 'manual' | 'cron';
  triggerTaskId: typeof TRIGGER_WORKFLOW_RUNNER_TASK_ID;
  cronExpr?: string;
  timezone: string;
  payload: {
    triggerWorkflow: TriggerWorkflowJobDefinitionPayload;
  };
  retryPolicy: { maxAttempts: number };
  timeoutSeconds: number;
  concurrencyKey: string;
};

type AdapterBuilder<TType extends TriggerWorkflowTaskType> = (
  task: TriggerWorkflowTaskRef & { type: TType }
) => TriggerWorkflowTaskJobAdapter & { type: TType };

const taskJobAdapterBuilders: {
  [TType in TriggerWorkflowTaskType]: AdapterBuilder<TType>;
} = {
  frontendCommand: (task) => ({
    ...buildCommonAdapter(task),
    type: 'frontendCommand',
    executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand,
    functionSource: requireString(task.frontendFunction, 'frontendFunction')
  }),
  backendCommand: (task) => ({
    ...buildCommonAdapter(task),
    type: 'backendCommand',
    executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand,
    functionSource: requireString(task.backendFunction, 'backendFunction')
  }),
  storedProcedure: (task) => ({
    ...buildCommonAdapter(task),
    type: 'storedProcedure',
    executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure,
    procedureName: requireString(task.procedureName, 'procedureName'),
    procedureSchema: task.procedureSchema?.trim() || 'public'
  }),
  registeredTask: (task) => ({
    ...buildCommonAdapter(task),
    type: 'registeredTask',
    executorTaskId: requireString(task.id, 'id'),
    ...(task.importPath?.trim() ? { importPath: task.importPath.trim() } : {})
  })
};

const supportedJobOperationTypes = new Set<TriggerWorkflowOperation['type']>([
  'entry',
  'schedule',
  'webhook',
  'task.trigger',
  'task.triggerAndWait',
  'wait.for',
  'wait.until',
  'condition',
  'complete'
]);

export function buildTriggerWorkflowTaskJobAdapter(
  task: TriggerWorkflowTaskRef,
  defaults?: TriggerWorkflowModel['settings']
): TriggerWorkflowTaskJobAdapter {
  const resolvedTask = applyTaskDefaults(task, defaults);
  if (!resolvedTask.type) throw new Error('Task type is required to build a workflow Job adapter.');

  switch (resolvedTask.type) {
    case 'frontendCommand':
      return taskJobAdapterBuilders.frontendCommand({ ...resolvedTask, type: resolvedTask.type });
    case 'backendCommand':
      return taskJobAdapterBuilders.backendCommand({ ...resolvedTask, type: resolvedTask.type });
    case 'storedProcedure':
      return taskJobAdapterBuilders.storedProcedure({ ...resolvedTask, type: resolvedTask.type });
    case 'registeredTask':
      return taskJobAdapterBuilders.registeredTask({ ...resolvedTask, type: resolvedTask.type });
  }
}

export function buildTriggerWorkflowJobExecutionPlan(
  model: TriggerWorkflowModel
): TriggerWorkflowJobExecutionPlan {
  const plan = compileTriggerWorkflow(model);
  const operations = plan.operations.map((operation): TriggerWorkflowJobOperation => {
    if (!supportedJobOperationTypes.has(operation.type)) {
      throw new Error(
        `Node "${operation.label}" cannot be enabled as a Job because operation ${operation.type} is not supported.`
      );
    }

    return {
      id: operation.id,
      nodeId: operation.nodeId,
      type: operation.type,
      label: operation.label,
      dependsOn: [...operation.dependsOn],
      next: [...operation.next],
      options: operation.task ? {} : stripEmbeddedTask(operation.options),
      ...(operation.condition ? { condition: operation.condition } : {}),
      ...(operation.task
        ? { adapter: buildTriggerWorkflowTaskJobAdapter(operation.task, model.settings) }
        : {})
    };
  });

  return { ...plan, operations };
}

function applyTaskDefaults(
  task: TriggerWorkflowTaskRef,
  defaults?: TriggerWorkflowModel['settings']
): TriggerWorkflowTaskRef {
  const defaultQueue = defaults?.defaultQueue;
  if (defaultQueue?.concurrencyLimit !== undefined) {
    throw new Error('Trigger.dev queue concurrency is defined by the workflow worker.');
  }
  return {
    ...task,
    ...(task.queue?.name?.trim()
      ? { queue: { ...task.queue } }
      : defaultQueue?.name?.trim()
        ? { queue: { name: defaultQueue.name.trim() } }
        : {}),
    ...(task.retry
      ? { retry: { ...defaults?.defaultRetry, ...task.retry } }
      : defaults?.defaultRetry
        ? { retry: { ...defaults.defaultRetry } }
        : {}),
    ...(task.timeoutSeconds !== undefined
      ? { timeoutSeconds: task.timeoutSeconds }
      : defaults?.defaultTimeoutSeconds !== undefined
        ? { timeoutSeconds: defaults.defaultTimeoutSeconds }
        : {})
  };
}

export function getTriggerWorkflowJobPlanSignature(model: TriggerWorkflowModel) {
  return getTriggerWorkflowExecutionPlanSignature(
    buildTriggerWorkflowJobExecutionPlan(model)
  );
}

export function getTriggerWorkflowExecutionPlanSignature(
  executionPlan: TriggerWorkflowJobExecutionPlan
) {
  return hashText(stableStringify(executionPlan));
}

export function buildTriggerWorkflowJob(
  model: TriggerWorkflowModel
): TriggerWorkflowJobDefinition {
  const executionPlan = buildTriggerWorkflowJobExecutionPlan(model);
  const planSignature = getTriggerWorkflowExecutionPlanSignature(executionPlan);
  const scheduled = executionPlan.schedule;

  return {
    code: model.code.trim(),
    name: model.name.trim(),
    type: scheduled ? 'cron' : 'manual',
    triggerTaskId: TRIGGER_WORKFLOW_RUNNER_TASK_ID,
    ...(scheduled ? { cronExpr: scheduled.cron } : {}),
    timezone: scheduled?.timezone?.trim() || 'Asia/Shanghai',
    payload: {
      triggerWorkflow: {
        version: TRIGGER_WORKFLOW_JOB_DEFINITION_VERSION,
        modelId: model.id?.trim() || executionPlan.workflowId,
        modelCode: executionPlan.workflowCode,
        modelName: executionPlan.workflowName,
        planSignature,
        executionPlan
      }
    },
    retryPolicy: { maxAttempts: 1 },
    timeoutSeconds: 3600,
    concurrencyKey: model.settings?.concurrencyKey?.trim() || `trigger-workflow:${executionPlan.workflowId}`
  };
}

function buildCommonAdapter(task: TriggerWorkflowTaskRef): TaskAdapterBase {
  const queueName = task.queue?.name?.trim();
  if (queueName && !isRegisteredTriggerWorkflowQueue(queueName)) {
    throw new Error(`Trigger.dev queue "${queueName}" is not registered by the workflow worker.`);
  }
  if (task.queue?.concurrencyLimit !== undefined) {
    throw new Error('Trigger.dev queue concurrency is defined by the workflow worker.');
  }

  return {
    type: task.type ?? 'registeredTask',
    executorTaskId: '',
    input: cloneRecord(task.input),
    failureStrategy: task.failureStrategy ?? 'failWorkflow',
    ...(task.outputPath?.trim() ? { outputPath: task.outputPath.trim() } : {}),
    ...(task.outputMapping ? { outputMapping: { ...task.outputMapping } } : {}),
    ...(task.defaultOutput !== undefined ? { defaultOutput: cloneValue(task.defaultOutput) } : {}),
    ...(task.priority !== undefined ? { priority: task.priority } : {}),
    ...(task.tags?.length ? { tags: [...task.tags] } : {}),
    ...(queueName ? { queue: { name: queueName } } : {}),
    ...(task.retry ? { retry: { ...task.retry } } : {}),
    ...(task.timeoutSeconds !== undefined ? { timeoutSeconds: task.timeoutSeconds } : {}),
    ...(task.idempotencyKey?.trim() ? { idempotencyKey: task.idempotencyKey.trim() } : {})
  };
}

function stripEmbeddedTask(options: Record<string, unknown>) {
  if (!isRecord(options) || !('task' in options)) return cloneRecord(options);
  const { task: _task, ...rest } = options;
  return cloneRecord(rest);
}

function cloneRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value ? cloneValue(value) as Record<string, unknown> : {};
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireString(value: string | undefined, field: string) {
  const result = value?.trim();
  if (!result) throw new Error(`Task adapter requires ${field}.`);
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item ?? null)).join(',')}]`;
  }
  if (isRecord(value)) {
    const fields = Object.keys(value)
      .filter((field) => value[field] !== undefined)
      .sort();
    return `{${fields
      .map((field) => `${JSON.stringify(field)}:${stableStringify(value[field])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
