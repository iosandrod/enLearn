import { task, tasks, wait } from '@trigger.dev/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../common/utils/env';
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
  TRIGGER_WORKFLOW_RUNNER_TASK_ID,
  type TriggerWorkflowAdapterPayload,
  type TriggerWorkflowJobDefinitionPayload,
  type TriggerWorkflowJobExecutionPlan,
  type TriggerWorkflowJobOperation,
  type TriggerWorkflowRunnerPayload,
  type TriggerWorkflowTaskJobAdapter
} from './trigger-workflow.types';
import { resolveTriggerWorkflowQueueName } from './trigger-workflow-queues';

const WORKFLOW_JOB_RPC = 'workflow_job_command';

export const triggerWorkflowRunnerTask = task({
  id: TRIGGER_WORKFLOW_RUNNER_TASK_ID,
  maxDuration: 3600,
  run: async (payload: TriggerWorkflowRunnerPayload) => {
    const runId = readRequiredString(payload.runId, 'runId');
    const tenantId = readRequiredString(payload.tenantId, 'tenantId');
    const definition = readWorkflowDefinition(payload.triggerWorkflow);
    const supabase = createWorkerSupabaseClient(TRIGGER_WORKFLOW_RUNNER_TASK_ID);
    let started = false;

    try {
      const running = await command(supabase, 'mark_run_running', { run_id: runId });
      if (!running) throw new Error('Workflow job run not found.');
      started = true;

      const runtimePayload = stripRunnerMetadata(payload);
      const output = await executeTriggerWorkflowJobPlan({
        runId,
        jobId: readString(payload.jobId) || undefined,
        tenantId,
        userId: readString(payload.userId) || undefined,
        payload: runtimePayload,
        definition
      });
      await command(supabase, 'finish_run', {
        run_id: runId,
        status: 'succeeded',
        output
      });
      return output;
    } catch (error) {
      if (started) await markJobRunFailedBestEffort(supabase, runId, error);
      throw error;
    }
  }
});

export async function executeTriggerWorkflowJobPlan(input: {
  runId: string;
  jobId?: string;
  tenantId: string;
  userId?: string;
  payload: JsonRecord;
  definition: TriggerWorkflowJobDefinitionPayload;
  executeAdapter?: (
    operation: TriggerWorkflowJobOperation,
    adapter: TriggerWorkflowTaskJobAdapter,
    payload: TriggerWorkflowAdapterPayload
  ) => Promise<unknown>;
}) {
  const plan = input.definition.executionPlan;
  const operationsByNodeId = new Map(plan.operations.map((operation) => [operation.nodeId, operation]));
  const entry = operationsByNodeId.get(plan.entryNodeId);
  if (!entry) throw new Error(`Workflow entry operation ${plan.entryNodeId} was not found.`);

  const variables: JsonRecord = {};
  const operationOutputs: JsonRecord = {};
  const visited = new Set<string>();
  let previousOutput: unknown;
  let current: TriggerWorkflowJobOperation | undefined = entry;

  while (current) {
    if (visited.has(current.nodeId)) {
      throw new Error(`Workflow Job contains a cycle at node ${current.nodeId}.`);
    }
    visited.add(current.nodeId);

    switch (current.type) {
      case 'entry':
      case 'schedule':
      case 'webhook':
        current = nextOperation(current, operationsByNodeId, input.payload, variables);
        break;
      case 'task.trigger':
      case 'task.triggerAndWait': {
        if (!current.adapter) throw new Error(`Operation ${current.id} has no Job adapter.`);
        const result = await executeAdapter(current, current.adapter, {
          ...input,
          plan,
          variables,
          previousOutput,
          executeAdapter: input.executeAdapter
        });
        previousOutput = result;
        operationOutputs[current.nodeId] = cloneJson(result);
        if (current.adapter.outputPath) {
          setPath(variables, current.adapter.outputPath, result);
        }
        current = nextOperation(current, operationsByNodeId, input.payload, variables);
        break;
      }
      case 'wait.for': {
        const seconds = parseIsoDurationSeconds(current.options.duration);
        if (seconds > 0) {
          await wait.for({
            seconds,
            idempotencyKey: `trigger-workflow:${input.runId}:${current.id}:wait`
          });
        }
        current = nextOperation(current, operationsByNodeId, input.payload, variables);
        break;
      }
      case 'wait.until': {
        const date = new Date(readRequiredString(current.options.until, `${current.id}.until`));
        if (Number.isNaN(date.getTime())) throw new Error(`Operation ${current.id} has an invalid wait date.`);
        if (date.getTime() > Date.now()) {
          await wait.until({
            date,
            idempotencyKey: `trigger-workflow:${input.runId}:${current.id}:until`
          });
        }
        current = nextOperation(current, operationsByNodeId, input.payload, variables);
        break;
      }
      case 'condition':
        current = nextOperation(current, operationsByNodeId, input.payload, variables);
        break;
      case 'complete':
        current = undefined;
        break;
      default:
        throw new Error(`Workflow Job operation ${current.type} is not supported.`);
    }
  }

  return {
    handledBy: TRIGGER_WORKFLOW_RUNNER_TASK_ID,
    workflowId: input.definition.modelId,
    workflowCode: input.definition.modelCode,
    planSignature: input.definition.planSignature,
    variables,
    operationOutputs
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
    const childPayload = adapter.type === 'registeredTask'
      ? adapterPayload.payload
      : adapterPayload;
    const result = await tasks.triggerAndWait(adapter.executorTaskId, childPayload, {
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
  const { data, error } = await client.rpc(WORKFLOW_JOB_RPC, {
    p_action: action,
    p_payload: payload
  });
  if (error) throw new Error(error.message);
  return data;
}

function createWorkerSupabaseClient(taskName: string) {
  const env = getEnv();
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !serviceRoleKey?.trim()) {
    throw new Error(`SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required by ${taskName}.`);
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
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
