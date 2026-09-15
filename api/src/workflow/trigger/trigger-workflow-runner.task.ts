import { task, tasks, wait } from '@trigger.dev/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  applyOutputMapping,
  assertRecord,
  cloneJson,
  getPath,
  interpolateValue,
  isRecord,
  parseIsoDurationSeconds,
  readRequiredString,
  readString,
  setPath,
  type JsonRecord
} from './trigger-workflow.helpers';
import {
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS,
  TRIGGER_WORKFLOW_RUNNER_TASK_ID,
  type TriggerWorkflowAdapterPayload,
  type TriggerWorkflowJobDefinitionPayload,
  type TriggerWorkflowJobExecutionPlan,
  type TriggerWorkflowJobOperation,
  type TriggerWorkflowRunnerPayload,
  type TriggerWorkflowTaskJobAdapter
} from './trigger-workflow.types';
import { resolveTriggerWorkflowQueueName } from './trigger-workflow-queues';
import {
  assertTriggerWorkflowJobPayload
} from './trigger-workflow-policy';
import {
  createTriggerWorkflowSupabaseClient,
  executeTriggerWorkflowRpc
} from './trigger-workflow-worker-supabase';
import { CanonicalExecutionKernel } from '../runtime/canonical-execution.kernel';
import type { CanonicalWorkflow } from '@enlearn/workflow-schema';

const WORKFLOW_JOB_RPC = 'workflow_job_command';

export const triggerWorkflowRunnerTask = task({
  id: TRIGGER_WORKFLOW_RUNNER_TASK_ID,
  maxDuration: 3600,
  run: async (payload: TriggerWorkflowRunnerPayload) => runTriggerWorkflowRunner(payload)
});

export async function runTriggerWorkflowRunner(
  payload: TriggerWorkflowRunnerPayload,
  dependencies: { supabase?: SupabaseClient } = {}
) {
  const runId = readRequiredString(payload.runId, 'runId');
  const supabase = dependencies.supabase
    ?? createTriggerWorkflowSupabaseClient(TRIGGER_WORKFLOW_RUNNER_TASK_ID);
  let started = false;

  try {
    const running = await command(supabase, 'mark_run_running', { run_id: runId });
    if (!running) throw new Error('Workflow job run not found.');
    started = true;

    const tenantId = readRequiredString(payload.tenantId, 'tenantId');
    const definition = readWorkflowDefinition(payload.triggerWorkflow);
    assertTriggerWorkflowJobPayload(TRIGGER_WORKFLOW_RUNNER_TASK_ID, {
      triggerWorkflow: definition
    });
    const runtimePayload = stripRunnerMetadata(payload);
    const output = await executeTriggerWorkflowJobPlan({
      runId,
      jobId: readString(payload.jobId) || undefined,
      processInstanceId: readString(payload.instanceId) || undefined,
      tenantId,
      userId: readString(payload.userId) || undefined,
      payload: runtimePayload,
      definition
    });
    await markDurableWorkflowInstanceCompleted(supabase, payload, output);
    await command(supabase, 'finish_run', {
      run_id: runId,
      status: 'succeeded',
      output
    });
    return output;
  } catch (error) {
    if (started) await markJobRunFailedBestEffort(supabase, runId, error);
    await markDurableWorkflowInstanceFailed(supabase, payload, error);
    throw error;
  }
}

async function markDurableWorkflowInstanceCompleted(
  supabase: SupabaseClient,
  payload: TriggerWorkflowRunnerPayload,
  output: Record<string, unknown>
) {
  const instanceId = readString(payload.instanceId);
  if (!instanceId) return;
  await executeTriggerWorkflowRpc(supabase, 'workflow_runtime_command', {
    p_action: 'set_instance_status',
    p_payload: {
      instance_id: instanceId,
      status: 'approved',
      payload: { triggerWorkflow: true, output }
    }
  });
}

async function markDurableWorkflowInstanceFailed(
  supabase: SupabaseClient,
  payload: TriggerWorkflowRunnerPayload,
  error: unknown
) {
  const instanceId = readString(payload.instanceId);
  if (!instanceId) return;
  try {
    await executeTriggerWorkflowRpc(supabase, 'workflow_runtime_command', {
      p_action: 'set_instance_status',
      p_payload: {
        instance_id: instanceId,
        status: 'failed',
        payload: { message: error instanceof Error ? error.message : String(error) }
      }
    });
  } catch {
    // Preserve the original workflow error if the failure projection is unavailable.
  }
}

export async function executeTriggerWorkflowJobPlan(input: {
  runId: string;
  jobId?: string;
  tenantId: string;
  userId?: string;
  processInstanceId?: string;
  payload: JsonRecord;
  definition: TriggerWorkflowJobDefinitionPayload;
  executeAdapter?: (
    operation: TriggerWorkflowJobOperation,
    adapter: TriggerWorkflowTaskJobAdapter,
    payload: TriggerWorkflowAdapterPayload
  ) => Promise<unknown>;
  executeHumanTask?: (payload: Record<string, unknown>) => Promise<unknown>;
}) {
  assertTriggerWorkflowJobPayload(TRIGGER_WORKFLOW_RUNNER_TASK_ID, {
    triggerWorkflow: input.definition
  });
  const plan = input.definition.executionPlan;
  const operationsByNodeId = new Map(plan.operations.map((operation) => [operation.nodeId, operation]));
  const workflow = canonicalFromJobDefinition(input.definition);
  const variables: JsonRecord = {};
  const operationOutputs: JsonRecord = {};
  const kernel = new CanonicalExecutionKernel();
  await kernel.execute(workflow, {
    complete: async () => undefined,
    waitHuman: async (context) => {
      if (!input.processInstanceId) {
        throw new Error(`Human task node "${context.node.id}" requires processInstanceId for durable task state.`);
      }
      const operation = operationsByNodeId.get(context.node.id);
      const human = context.node.human;
      const approval = isRecord(context.node.config.approval) ? context.node.config.approval : {};
      const configuredCandidates = isRecord(human?.assigneeStrategy) && Array.isArray(human.assigneeStrategy.ids)
        ? human.assigneeStrategy.ids
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => ({ type: 'user' as const, id }))
        : [];
      const candidates = configuredCandidates.length
        ? configuredCandidates
        : [{ type: 'user' as const, id: input.userId ?? input.tenantId }];
      const humanPayload = {
        runId: input.runId,
        tenantId: input.tenantId,
        workflowId: input.definition.modelId,
        workflowCode: input.definition.modelCode,
        operationId: operation?.id ?? context.node.id,
        nodeId: context.node.id,
        processInstanceId: input.processInstanceId,
        nodeInstanceId: context.token.id,
        payload: input.payload,
        variables,
        adapter: {
          type: 'humanTask',
          executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.humanTask,
          input: {}
        },
        humanTask: {
          title: context.node.name,
          completionStrategy: human?.completion.type ?? 'any',
          passRatio: human?.completion.type === 'ratio' ? human.completion.ratio : undefined,
          candidates,
          timeoutSeconds: typeof approval.timeoutSeconds === 'number' ? approval.timeoutSeconds : undefined,
          onTimeout: typeof approval.onTimeout === 'string' ? approval.onTimeout : undefined
        }
      };
      const result = input.executeHumanTask
        ? { ok: true as const, output: await input.executeHumanTask(humanPayload) }
        : await tasks.triggerAndWait('workflow.adapter.human-task', humanPayload, { idempotencyKey: `human-task-run:${input.runId}:${context.node.id}` });
      if (!result.ok) throw result.error;
      if (isRecord(result.output) && result.output.status === 'stopped') return 'stopped';
      return 'continued';
    },
    createCc: async (context) => {
      throw new Error(`CC node "${context.node.id}" requires the approval runtime.`);
    },
    executeService: async (context) => {
      const operation = operationsByNodeId.get(context.node.id);
      if (!operation?.adapter) throw new Error(`Operation ${context.node.id} has no Job adapter.`);
      const result = await executeAdapter(operation, operation.adapter, {
        ...input,
        plan,
        variables,
        previousOutput: context.token.previousOutput,
        executeAdapter: input.executeAdapter
      });
      operationOutputs[context.node.id] = cloneJson(result);
      if (operation.adapter.outputPath) setPath(variables, operation.adapter.outputPath, result);
      return result;
    },
    waitTimer: async (context) => {
      const operation = operationsByNodeId.get(context.node.id);
      const options = operation?.options ?? {};
      if (operation?.type === 'wait.until') {
        const date = new Date(readRequiredString(options.until, `${operation.id}.until`));
        if (Number.isNaN(date.getTime())) throw new Error(`Operation ${operation.id} has an invalid wait date.`);
        if (date.getTime() > Date.now()) await wait.until({ date, idempotencyKey: `trigger-workflow:${input.runId}:${operation.id}:until` });
        return;
      }
      const seconds = parseIsoDurationSeconds(options.duration);
      if (seconds > 0) await wait.for({ seconds, idempotencyKey: `trigger-workflow:${input.runId}:${operation?.id ?? context.node.id}:wait` });
    },
    recordSubProcess: async (context) => {
      throw new Error(`Sub-process node "${context.node.id}" is not supported by Trigger.dev adapter.`);
    },
    selectNext: async (context) => {
      const operation = operationsByNodeId.get(context.node.id);
      if (!operation) return [];
      if (operation.type !== 'condition') return [...operation.next];
      const branches = Array.isArray(operation.options.branches) ? operation.options.branches : [];
      const selected = branches.find((branch) => isRecord(branch) && matchesCondition(branch.condition, { payload: input.payload, variables }));
      const target = isRecord(selected) ? readString(selected.target) : '';
      if (!target) throw new Error(`Condition ${operation.id} did not match any branch.`);
      return [target];
    }
  }, { executionId: input.runId });

  return {
    handledBy: TRIGGER_WORKFLOW_RUNNER_TASK_ID,
    workflowId: input.definition.modelId,
    workflowCode: input.definition.modelCode,
    planSignature: input.definition.planSignature,
    variables,
    operationOutputs
  };
}

function canonicalFromJobDefinition(definition: TriggerWorkflowJobDefinitionPayload): CanonicalWorkflow {
  const plan = definition.executionPlan;
  if (isRecord((plan as unknown as Record<string, unknown>).canonical)) {
    return (plan as unknown as Record<string, unknown>).canonical as CanonicalWorkflow;
  }
  if (definition.canonical) return definition.canonical;
  const nodes = plan.operations.map((operation) => ({
    id: operation.nodeId,
    type: operation.type === 'entry' || operation.type === 'schedule' || operation.type === 'webhook'
      ? 'start'
      : operation.type === 'complete' ? 'end'
          : operation.type === 'condition' ? 'condition'
          : operation.type === 'human.approval' ? 'humanTask'
          : operation.type === 'parallel' ? 'parallelFork'
            : operation.type === 'parallelJoin' ? 'parallelJoin'
            : operation.type === 'wait.for' || operation.type === 'wait.until' ? 'timer'
              : 'task',
    sourceType: operation.type,
    name: operation.label,
    config: { ...operation.options, ...(operation.adapter ? { adapter: operation.adapter } : {}) }
  } as CanonicalWorkflow['nodes'][number]));
  return {
    schemaVersion: 1,
    id: definition.modelId,
    code: definition.modelCode,
    name: definition.modelName,
    entryNodeId: plan.entryNodeId,
    nodes,
    edges: plan.operations.flatMap((operation) => operation.next.map((target, index) => ({
      id: `${operation.id}:edge:${index}`,
      source: operation.nodeId,
      target,
      ...(operation.type === 'condition' ? { condition: undefined } : {})
    })))
  };
}

async function executeAdapter(
  operation: TriggerWorkflowJobOperation,
  adapter: TriggerWorkflowTaskJobAdapter,
  runtime: {
    runId: string;
    jobId?: string;
    tenantId: string;
    userId?: string;
    payload: JsonRecord;
    definition: TriggerWorkflowJobDefinitionPayload;
    plan: TriggerWorkflowJobExecutionPlan;
    variables: JsonRecord;
    previousOutput?: unknown;
    executeAdapter?: (
      operation: TriggerWorkflowJobOperation,
      adapter: TriggerWorkflowTaskJobAdapter,
      payload: TriggerWorkflowAdapterPayload
    ) => Promise<unknown>;
  }
) {
  const scope = runtimeScope(runtime);
  const queueName = resolveTriggerWorkflowQueueName(adapter.queue?.name);
  const adapterPayload: TriggerWorkflowAdapterPayload = {
    runId: runtime.runId,
    ...(runtime.jobId ? { jobId: runtime.jobId } : {}),
    tenantId: runtime.tenantId,
    ...(runtime.userId ? { userId: runtime.userId } : {}),
    workflowId: runtime.definition.modelId,
    workflowCode: runtime.definition.modelCode,
    operationId: operation.id,
    nodeId: operation.nodeId,
    payload: assertRecord(interpolateValue(adapter.input, scope), `${operation.id}.input must resolve to an object.`),
    variables: cloneJson(runtime.variables),
    ...(runtime.previousOutput !== undefined
      ? { previousOutput: cloneJson(runtime.previousOutput) }
      : {}),
    adapter
  };

  try {
    if (runtime.executeAdapter) {
      const output = await runtime.executeAdapter(operation, adapter, adapterPayload);
      return applyOutputMapping(output, adapter.outputMapping);
    }
    const childPayload = adapterPayload;
    const executorTaskId = resolveAdapterExecutorTaskId(adapter);
    const result = await tasks.triggerAndWait(executorTaskId, childPayload, {
        ...(adapter.idempotencyKey
          ? { idempotencyKey: String(interpolateValue(adapter.idempotencyKey, scope)) }
          : { idempotencyKey: `trigger-workflow:${runtime.runId}:${operation.id}` }),
        ...(adapter.retry?.maxAttempts !== undefined
          ? { maxAttempts: adapter.retry.maxAttempts }
          : {}),
        ...(queueName ? { queue: queueName } : {}),
        ...(adapter.priority !== undefined ? { priority: adapter.priority } : {}),
        ...(adapter.tags?.length ? { tags: adapter.tags } : {}),
        ...(adapter.timeoutSeconds ? { maxDuration: adapter.timeoutSeconds } : {})
      });
    if (!result.ok) throw result.error;
    return applyOutputMapping(result.output, adapter.outputMapping);
  } catch (error) {
    if (adapter.failureStrategy === 'continue') {
      return { failed: true, error: error instanceof Error ? error.message : String(error) };
    }
    if (adapter.failureStrategy === 'useDefaultOutput') {
      return cloneJson(adapter.defaultOutput);
    }
    throw error;
  }
}

function resolveAdapterExecutorTaskId(adapter: TriggerWorkflowTaskJobAdapter) {
  const expected = TRIGGER_WORKFLOW_ADAPTER_TASK_IDS[adapter.type];
  if (adapter.executorTaskId !== expected) {
    throw new Error(`Workflow ${adapter.type} adapter has an invalid executor Task ID.`);
  }
  return expected;
}

function nextOperation(
  operation: TriggerWorkflowJobOperation,
  operationsByNodeId: Map<string, TriggerWorkflowJobOperation>,
  payload: JsonRecord,
  variables: JsonRecord
) {
  if (!operation.next.length) return undefined;
  if (operation.next.length === 1) return requireOperation(operation.next[0], operationsByNodeId);
  if (operation.type !== 'condition') {
    throw new Error(`Operation ${operation.id} has multiple outgoing paths but is not a condition.`);
  }

  const scope = { payload, variables };
  const branches = Array.isArray(operation.options.branches) ? operation.options.branches : [];
  const selected = branches.find((branch) => {
    if (!isRecord(branch)) return false;
    return matchesCondition(branch.condition, scope);
  });
  const target = isRecord(selected) ? readString(selected.target) : '';
  if (!target) throw new Error(`Condition ${operation.id} did not match any branch.`);
  return requireOperation(target, operationsByNodeId);
}

function matchesCondition(value: unknown, scope: JsonRecord) {
  if (!isRecord(value) || value.type === 'always') return true;
  if (value.type !== 'field') return false;
  const left = getPath(scope, readString(value.field));
  const right = value.value;
  switch (readString(value.operator) || 'eq') {
    case 'eq': return left === right;
    case 'ne': return left !== right;
    case 'gt': return Number(left) > Number(right);
    case 'gte': return Number(left) >= Number(right);
    case 'lt': return Number(left) < Number(right);
    case 'lte': return Number(left) <= Number(right);
    case 'contains': return Array.isArray(left)
      ? left.includes(right)
      : String(left ?? '').includes(String(right ?? ''));
    case 'in': return Array.isArray(right) && right.includes(left);
    default: return false;
  }
}

function runtimeScope(runtime: {
  runId: string;
  jobId?: string;
  tenantId: string;
  userId?: string;
  payload: JsonRecord;
  variables: JsonRecord;
  previousOutput?: unknown;
}) {
  return {
    runId: runtime.runId,
    jobId: runtime.jobId ?? '',
    accountId: runtime.tenantId,
    tenantId: runtime.tenantId,
    userId: runtime.userId ?? '',
    payload: runtime.payload,
    variables: runtime.variables,
    previousOutput: runtime.previousOutput
  };
}

function requireOperation(
  nodeId: string,
  operationsByNodeId: Map<string, TriggerWorkflowJobOperation>
) {
  const operation = operationsByNodeId.get(nodeId);
  if (!operation) throw new Error(`Workflow operation for node ${nodeId} was not found.`);
  return operation;
}

function readWorkflowDefinition(value: unknown): TriggerWorkflowJobDefinitionPayload {
  const definition = assertRecord(value, 'triggerWorkflow definition is required.');
  if (definition.version !== 1) throw new Error('Unsupported triggerWorkflow definition version.');
  const executionPlan = assertRecord(definition.executionPlan, 'triggerWorkflow.executionPlan is required.');
  if (!Array.isArray(executionPlan.operations)) {
    throw new Error('triggerWorkflow.executionPlan.operations must be an array.');
  }
  return definition as TriggerWorkflowJobDefinitionPayload;
}

function stripRunnerMetadata(payload: TriggerWorkflowRunnerPayload) {
  const {
    runId: _runId,
    jobId: _jobId,
    tenantId: _tenantId,
    triggerWorkflow: _definition,
    ...runtimePayload
  } = payload;
  return runtimePayload;
}

async function command(client: SupabaseClient, action: string, payload: JsonRecord) {
  return executeTriggerWorkflowRpc(client, WORKFLOW_JOB_RPC, {
    p_action: action,
    p_payload: payload
  });
}

async function markJobRunFailedBestEffort(
  client: SupabaseClient,
  runId: string,
  error: unknown
) {
  try {
    await command(client, 'finish_run', {
      run_id: runId,
      status: 'failed',
      output: {},
      error_message: error instanceof Error ? error.message : String(error)
    });
  } catch {
    return;
  }
}
