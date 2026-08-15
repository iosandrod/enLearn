import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configure, runs, tasks } from '@trigger.dev/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { io, type Socket } from 'socket.io-client';
import {
  FRONTEND_COMMAND_EVENT,
  type FrontendCommand
} from '../src/frontend-command/frontend-command.types';
import { getWorkflowEnv } from '../src/workflow/common/env';
import {
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS,
  TRIGGER_WORKFLOW_RUNNER_TASK_ID,
  type TriggerWorkflowJobDefinitionPayload,
  type TriggerWorkflowTaskJobAdapter
} from '../src/workflow/trigger/trigger-workflow.types';
import { getTriggerWorkflowExecutionPlanSignature } from '../src/workflow/trigger/trigger-workflow-policy';

const DEFAULT_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';
const WORKFLOW_JOB_RPC = 'workflow_job_command';
const timeoutMs = Number(process.env.TRIGGER_WORKFLOW_ADAPTER_SMOKE_TIMEOUT_MS ?? 90_000);

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});

async function main() {
  const env = getWorkflowEnv();
  const triggerApiUrl = requireValue(env.TRIGGER_API_URL, 'TRIGGER_API_URL');
  const triggerSecretKey = requireValue(env.TRIGGER_SECRET_KEY, 'TRIGGER_SECRET_KEY');
  const supabaseUrl = requireValue(
    env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_PROJECT_URL,
    'SUPABASE_URL'
  );
  const serviceRoleKey = requireValue(env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY');
  const accountId = process.env.TRIGGER_WORKFLOW_ADAPTER_SMOKE_ACCOUNT_ID ?? DEFAULT_ACCOUNT_ID;
  const apiUrl = String(
    process.env.TRIGGER_WORKFLOW_ADAPTER_SMOKE_API_URL ?? 'http://127.0.0.1:3002'
  ).replace(/\/+$/, '');
  const auth = await signIn(apiUrl, accountId, {
    email: process.env.TRIGGER_WORKFLOW_ADAPTER_SMOKE_EMAIL ?? 'admin',
    password: process.env.TRIGGER_WORKFLOW_ADAPTER_SMOKE_PASSWORD ?? '123456'
  });
  const userId = auth.user.id;

  configure({ baseURL: triggerApiUrl, accessToken: triggerSecretKey });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const socket = io(`${apiUrl}/chat`, {
    auth: { token: auth.session.access_token, accountId },
    transports: ['websocket', 'polling'],
    withCredentials: true
  });

  try {
    const connected = await waitForEvent<{ userId: string; accountId: string }>(
      socket,
      'chat:connected',
      timeoutMs
    );
    assert.equal(connected.userId, userId);
    assert.equal(connected.accountId, accountId);

    const results: Array<Record<string, unknown>> = [];
    for (const testCase of createCases()) {
      results.push(await runCase(supabase, accountId, userId, testCase, socket));
    }

    console.log(JSON.stringify({ ok: true, results }, null, 2));
  } finally {
    socket.disconnect();
  }
}

async function runCase(
  supabase: SupabaseClient,
  accountId: string,
  userId: string,
  testCase: AdapterSmokeCase,
  socket: Socket
) {
  const suffix = randomUUID();
  const definition = createDefinition(testCase, suffix);
  const runRow = await createJobRun(supabase, accountId, {
    smokeCase: testCase.type,
    triggerWorkflow: definition
  });

  try {
    const commandPromise = testCase.type === 'frontendCommand'
      ? waitForEvent<FrontendCommand>(socket, FRONTEND_COMMAND_EVENT, timeoutMs)
      : undefined;
    const handle = await tasks.trigger(
      TRIGGER_WORKFLOW_RUNNER_TASK_ID,
      {
        runId: runRow.id,
        tenantId: accountId,
        userId,
        smokeCase: testCase.type,
        triggerWorkflow: definition
      },
      { idempotencyKey: `trigger-workflow-adapter-smoke:${testCase.type}:${suffix}` }
    );
    const triggerRun = await waitForTriggerRun(handle.id, timeoutMs);
    assert.equal(
      triggerRun.status,
      'COMPLETED',
      `${testCase.type} Trigger.dev run failed (${handle.id}): ${readTriggerRunError(triggerRun)}`
    );

    const projected = await waitForProjectedRun(supabase, runRow.id, timeoutMs);
    assert.equal(projected.status, 'succeeded');
    assert.equal(projected.output?.handledBy, TRIGGER_WORKFLOW_RUNNER_TASK_ID);
    const operationOutput = readRecord(projected.output?.operationOutputs)?.task;
    testCase.assertOutput(operationOutput);
    const command = commandPromise ? await commandPromise : undefined;
    if (command) {
      assert.equal(command.code, 'message.show');
      assert.equal(command.target.accountId, accountId);
      assert.equal('userId' in command.target ? command.target.userId : undefined, userId);
      assert.equal(command.source?.taskId, TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand);
      assert.equal(command.source?.runId, runRow.id);
    }

    return {
      type: testCase.type,
      runnerTaskId: TRIGGER_WORKFLOW_RUNNER_TASK_ID,
      executorTaskId: testCase.adapter.executorTaskId,
      triggerRunId: handle.id,
      projectedStatus: projected.status,
      ...(command ? { frontendCommandId: command.id, sourceTaskId: command.source?.taskId } : {})
    };
  } finally {
    await supabase.from('wf_job_run').delete().eq('id', runRow.id);
  }
}

async function signIn(
  apiUrl: string,
  accountId: string,
  credentials: { email: string; password: string }
) {
  const response = await fetch(`${apiUrl}/api/auth/signin`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...credentials, accountId })
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Sign-in failed (${response.status}): ${text}`);
  const auth = JSON.parse(text) as AuthResponse;
  assert.equal(auth.activeAccount.account_id, accountId);
  return auth;
}

function createCases(): AdapterSmokeCase[] {
  return [
    {
      type: 'frontendCommand',
      adapter: {
        type: 'frontendCommand',
        executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand,
        input: { message: '{{payload.smokeCase}}' },
        functionSource: `async ({ payload }) => ({
          code: 'message.show',
          params: { message: 'Adapter smoke: ' + payload.message, type: 'success' }
        })`
      },
      assertOutput(output) {
        const result = requireRecord(output, 'frontendCommand output');
        assert.equal(result.handledBy, TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand);
        const command = requireRecord(result.command, 'frontendCommand command');
        assert.equal(command.code, 'message.show');
        assert.equal(requireRecord(command.source, 'frontendCommand source').taskId,
          TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand);
      }
    },
    {
      type: 'backendCommand',
      adapter: {
        type: 'backendCommand',
        executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand,
        input: {},
        functionSource: `async ({ context }) => ({
          configHash: await context.supabase.rpc('get_dynamic_crud_resource_hash', {
            p_resource_name: 'planning_buffer',
            p_table_name: 'planning_buffer'
          }),
          inventoryBuffers: await context.baseService.invoke(
            'planning',
            'listInventoryBuffers',
            { limit: 1 }
          )
        })`
      },
      assertOutput(output) {
        const result = requireRecord(output, 'backendCommand output');
        assert.match(String(result.configHash), /^[0-9a-f]{64}$/);
        assert.ok(Array.isArray(result.inventoryBuffers));
        assert.ok(result.inventoryBuffers.length <= 1);
      }
    },
    {
      type: 'storedProcedure',
      adapter: {
        type: 'storedProcedure',
        executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure,
        input: {
          p_resource_name: 'planning_buffer',
          p_table_name: 'planning_buffer'
        },
        procedureName: 'get_dynamic_crud_resource_hash',
        procedureSchema: 'public'
      },
      assertOutput(output) {
        assert.match(String(output), /^[0-9a-f]{64}$/);
      }
    },
    {
      type: 'registeredTask',
      adapter: {
        type: 'registeredTask',
        executorTaskId: 'workflow.timer.fire',
        input: { smokeCase: '{{payload.smokeCase}}' }
      },
      assertOutput(output) {
        const result = requireRecord(output, 'registeredTask output');
        assert.equal(result.handledBy, 'workflow.timer.fire');
        assert.equal(requireRecord(result.payload, 'registeredTask payload').smokeCase, 'registeredTask');
      }
    }
  ];
}

function createDefinition(
  testCase: AdapterSmokeCase,
  suffix: string
): TriggerWorkflowJobDefinitionPayload {
  const code = `adapter_smoke_${testCase.type}_${suffix}`;
  const definition: TriggerWorkflowJobDefinitionPayload = {
    version: 1,
    modelId: code,
    modelCode: code,
    modelName: `Adapter smoke ${testCase.type}`,
    planSignature: '',
    executionPlan: {
      workflowId: code,
      workflowCode: code,
      workflowName: `Adapter smoke ${testCase.type}`,
      entryNodeId: 'start',
      operations: [
        operation('start', 'entry', ['task']),
        { ...operation('task', 'task.trigger', ['end']), adapter: testCase.adapter },
        operation('end', 'complete', [])
      ]
    }
  };
  definition.planSignature = getTriggerWorkflowExecutionPlanSignature(
    definition.executionPlan
  );
  return definition;
}

function operation(nodeId: string, type: string, next: string[]) {
  return {
    id: `op_${nodeId}`,
    nodeId,
    type,
    label: nodeId,
    dependsOn: [],
    next,
    options: {}
  };
}

async function createJobRun(
  supabase: SupabaseClient,
  accountId: string,
  input: Record<string, unknown>
) {
  const { data, error } = await supabase.rpc(WORKFLOW_JOB_RPC, {
    p_action: 'create_run',
    p_payload: {
      account_id: accountId,
      status: 'queued',
      attempt: 1,
      input
    }
  });
  if (error) throw new Error(error.message);
  return requireRecord(data, 'created workflow Job run') as { id: string };
}

async function waitForTriggerRun(runId: string, timeout: number) {
  const deadline = Date.now() + timeout;
  let snapshot = await runs.retrieve(runId);
  while (!isTerminalTriggerStatus(snapshot.status) && Date.now() < deadline) {
    await delay(500);
    snapshot = await runs.retrieve(runId);
  }
  if (!isTerminalTriggerStatus(snapshot.status)) {
    throw new Error(`Timed out waiting for Trigger.dev run ${runId}.`);
  }
  return snapshot;
}

async function waitForProjectedRun(
  supabase: SupabaseClient,
  runId: string,
  timeout: number
) {
  const deadline = Date.now() + timeout;
  while (Date.now() <= deadline) {
    const { data, error } = await supabase
      .from('wf_job_run')
      .select('status, output, error_message')
      .eq('id', runId)
      .single();
    if (error) throw new Error(error.message);
    if (['succeeded', 'failed', 'canceled'].includes(String(data.status))) {
      if (data.status !== 'succeeded') {
        throw new Error(`Workflow Job run ${runId} failed: ${String(data.error_message ?? '')}`);
      }
      return data as {
        status: string;
        output?: Record<string, unknown>;
        error_message?: string;
      };
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for projected workflow Job run ${runId}.`);
}

function isTerminalTriggerStatus(status: string) {
  return ['COMPLETED', 'FAILED', 'CANCELED', 'CRASHED', 'EXPIRED', 'TIMED_OUT'].includes(status);
}

function readTriggerRunError(run: unknown) {
  const record = readRecord(run);
  const error = readRecord(record?.error);
  return String(
    error?.message ??
    record?.errorMessage ??
    record?.failureReason ??
    'No Trigger.dev error detail was returned.'
  );
}

function requireValue(value: string | undefined, name: string) {
  const result = value?.trim();
  if (!result) throw new Error(`${name} is required.`);
  return result;
}

function readRecord(value: unknown) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function requireRecord(value: unknown, name: string) {
  const result = readRecord(value);
  if (!result) throw new Error(`${name} must be an object.`);
  return result;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function waitForEvent<T>(
  target: {
    once(event: string, handler: (payload: T) => void): unknown;
    off(event: string, handler: (payload: T) => void): unknown;
  },
  event: string,
  timeout: number
) {
  return new Promise<T>((resolve, reject) => {
    const handleEvent = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      target.off(event, handleEvent);
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeout);
    target.once(event, handleEvent);
  });
}

type AdapterSmokeCase = {
  type: TriggerWorkflowTaskJobAdapter['type'];
  adapter: TriggerWorkflowTaskJobAdapter;
  assertOutput(output: unknown): void;
};

type AuthResponse = {
  user: { id: string };
  activeAccount: { account_id: string };
  session: { access_token: string };
};
