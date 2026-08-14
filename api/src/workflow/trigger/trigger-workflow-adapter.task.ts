import { randomUUID } from 'node:crypto';
import { task } from '@trigger.dev/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { getEnv } from '../../common/utils/env';
import { publishFrontendCommand } from '../../frontend-command/frontend-command.publisher';
import {
  FRONTEND_COMMAND_RUNTIME_VERSION,
  type FrontendCommand,
  type FrontendCommandTarget
} from '../../frontend-command/frontend-command.types';
import {
  assertRecord,
  isRecord,
  readRequiredString,
  readString,
  type JsonRecord
} from './trigger-workflow.helpers';
import { executeTriggerWorkflowFunction } from './trigger-workflow.script-runtime';
import {
  TRIGGER_WORKFLOW_ADAPTER_TASK_IDS,
  type TriggerWorkflowAdapterPayload
} from './trigger-workflow.types';

export const triggerWorkflowFrontendCommandAdapterTask = task({
  id: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand,
  maxDuration: 300,
  run: async (payload: TriggerWorkflowAdapterPayload) => executeFrontendCommandAdapter(payload)
});

export const triggerWorkflowBackendCommandAdapterTask = task({
  id: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand,
  maxDuration: 3600,
  run: async (payload: TriggerWorkflowAdapterPayload) => executeBackendCommandAdapter(payload)
});

export const triggerWorkflowStoredProcedureAdapterTask = task({
  id: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure,
  maxDuration: 3600,
  run: async (payload: TriggerWorkflowAdapterPayload) => executeStoredProcedureAdapter(payload)
});

export async function executeFrontendCommandAdapter(
  input: TriggerWorkflowAdapterPayload,
  dependencies: {
    publish?: typeof publishFrontendCommand;
    now?: () => Date;
  } = {}
) {
  assertAdapterType(input, 'frontendCommand');
  const functionSource = readRequiredString(input.adapter.functionSource, 'adapter.functionSource');
  const result = assertRecord(
    await executeTriggerWorkflowFunction(functionSource, scriptSnapshot(input)),
    'Frontend command function must return an object.'
  );
  const code = readRequiredString(result.code, 'frontend command code');
  if (code !== 'message.show') {
    throw new Error(`Unsupported frontend command code: ${code}.`);
  }

  const params = assertFrontendMessageParams(result.params);
  const target = readFrontendCommandTarget(result.target, input);
  const now = dependencies.now ?? (() => new Date());
  const issuedAt = now().toISOString();
  const command: FrontendCommand = {
    id: randomUUID(),
    runtimeVersion: FRONTEND_COMMAND_RUNTIME_VERSION,
    code: 'message.show',
    params,
    target,
    issuedAt,
    ...(typeof result.expiresAt === 'string' && result.expiresAt.trim()
      ? { expiresAt: result.expiresAt.trim() }
      : {}),
    source: {
      taskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand,
      runId: input.runId
    }
  };
  const published = await (dependencies.publish ?? publishFrontendCommand)(command);

  return {
    handledBy: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand,
    command,
    subscriberCount: published.subscriberCount
  };
}

export async function executeBackendCommandAdapter(
  input: TriggerWorkflowAdapterPayload,
  dependencies: {
    fetch?: typeof fetch;
    supabase?: SupabaseClient;
  } = {}
) {
  assertAdapterType(input, 'backendCommand');
  const functionSource = readRequiredString(input.adapter.functionSource, 'adapter.functionSource');
  const fetchImplementation = dependencies.fetch ?? fetch;
  const supabase = dependencies.supabase ?? createWorkerSupabaseClient(
    TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand
  );

  return executeTriggerWorkflowFunction(
    functionSource,
    scriptSnapshot(input),
    async (name, args) => {
      switch (name) {
        case 'http.request':
          return executeHttpRequest(fetchImplementation, args);
        case 'supabase.rpc':
          return executeSupabaseRpc(supabase, args);
        case 'baseService.invoke':
          return executeBaseServiceInvoke(fetchImplementation, input, args);
        default:
          throw new Error(`Unsupported backend workflow capability: ${name}.`);
      }
    },
    Math.max(1, input.adapter.timeoutSeconds ?? 30) * 1000
  );
}

export async function executeStoredProcedureAdapter(
  input: TriggerWorkflowAdapterPayload,
  dependencies: { supabase?: SupabaseClient } = {}
) {
  assertAdapterType(input, 'storedProcedure');
  const procedureName = readRequiredString(input.adapter.procedureName, 'adapter.procedureName');
  const procedureSchema = readString(input.adapter.procedureSchema) || 'public';
  if (procedureSchema !== 'public') {
    throw new Error('Only public Supabase RPC procedures are supported by this adapter.');
  }
  const supabase = dependencies.supabase ?? createWorkerSupabaseClient(
    TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure
  );
  const { data, error } = await supabase.rpc(procedureName, input.payload);
  if (error) throw new Error(error.message);
  return data;
}

function assertAdapterType(
  input: TriggerWorkflowAdapterPayload,
  expected: TriggerWorkflowAdapterPayload['adapter']['type']
) {
  if (input.adapter.type !== expected) {
    throw new Error(`Expected ${expected} adapter, received ${input.adapter.type}.`);
  }
}

function scriptSnapshot(input: TriggerWorkflowAdapterPayload) {
  return {
    payload: input.payload,
    variables: input.variables,
    previousOutput: input.previousOutput,
    context: {
      accountId: input.tenantId,
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      runId: input.runId,
      jobId: input.jobId ?? null,
      workflowId: input.workflowId,
      workflowCode: input.workflowCode,
      operationId: input.operationId,
      nodeId: input.nodeId
    }
  };
}

function assertFrontendMessageParams(value: unknown): FrontendCommand['params'] {
  const params = assertRecord(value, 'Frontend command params must be an object.');
  const message = readRequiredString(params.message, 'frontend command params.message');
  const type = readString(params.type) || 'info';
  if (!['success', 'info', 'warning', 'error'].includes(type)) {
    throw new Error('Frontend command params.type must be success, info, warning, or error.');
  }
  const duration = params.duration === undefined ? undefined : Number(params.duration);
  if (duration !== undefined && (!Number.isFinite(duration) || duration < 0)) {
    throw new Error('Frontend command params.duration must be a non-negative number.');
  }
  return {
    message,
    type: type as FrontendCommand['params']['type'],
    ...(duration !== undefined ? { duration } : {})
  };
}

function readFrontendCommandTarget(
  value: unknown,
  input: TriggerWorkflowAdapterPayload
): FrontendCommandTarget {
  const target = isRecord(value) ? value : {};
  const accountId = readString(target.accountId) || input.tenantId;
  const socketId = readString(target.socketId);
  const userId = readString(target.userId) || input.userId;
  if (socketId && readString(target.userId)) {
    throw new Error('Frontend command accepts either userId or socketId, not both.');
  }
  if (socketId) return { accountId, socketId };
  if (userId) return { accountId, userId };
  throw new Error('Frontend command requires a target userId or socketId.');
}

async function executeHttpRequest(fetchImplementation: typeof fetch, args: unknown[]) {
  const url = readRequiredString(args[0], 'http.request url');
  const rawInit = isRecord(args[1]) ? args[1] : {};
  const method = (readString(rawInit.method) || 'GET').toUpperCase();
  const headers = isRecord(rawInit.headers)
    ? Object.fromEntries(Object.entries(rawInit.headers).map(([key, value]) => [key, String(value)]))
    : {};
  const body = rawInit.body;
  const response = await fetchImplementation(url, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body !== undefined
      ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
      : {})
  });
  const text = await response.text();
  const parsed = parseResponseBody(text);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  return parsed;
}

async function executeSupabaseRpc(client: SupabaseClient, args: unknown[]) {
  const name = readRequiredString(args[0], 'supabase.rpc name');
  const parameters = isRecord(args[1]) ? args[1] : {};
  const { data, error } = await client.rpc(name, parameters);
  if (error) throw new Error(error.message);
  return data;
}

async function executeBaseServiceInvoke(
  fetchImplementation: typeof fetch,
  input: TriggerWorkflowAdapterPayload,
  args: unknown[]
) {
  const serviceName = readRequiredString(args[0], 'baseService serviceName');
  const serviceMethod = readRequiredString(args[1], 'baseService serviceMethod');
  const postData = isRecord(args[2]) ? args[2] : {};
  const env = getEnv();
  const apiBaseUrl = String(env.WORKFLOW_INTERNAL_API_URL ?? env.API_BASE_URL ?? 'http://127.0.0.1:3002/api')
    .replace(/\/+$/, '');
  const serviceRoleKey = readRequiredString(
    env.SUPABASE_SERVICE_ROLE_KEY,
    'SUPABASE_SERVICE_ROLE_KEY'
  );
  const response = await fetchImplementation(`${apiBaseUrl}/internal/service`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-workflow-internal-key': serviceRoleKey
    },
    body: JSON.stringify({
      serviceName,
      serviceMethod,
      postData,
      context: {
        accountId: input.tenantId,
        userId: input.userId,
        requestId: `workflow:${input.runId}:${input.operationId}`
      }
    })
  });
  const text = await response.text();
  const parsed = parseResponseBody(text);
  if (!response.ok) throw new Error(`Internal service ${response.status}: ${text}`);
  return isRecord(parsed) && 'data' in parsed ? parsed.data : parsed;
}

function parseResponseBody(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { body: text };
  }
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
