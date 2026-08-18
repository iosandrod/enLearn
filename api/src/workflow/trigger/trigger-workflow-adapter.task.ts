import { randomUUID } from 'node:crypto';
import { task } from '@trigger.dev/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
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
import {
  assertWorkflowHttpTarget,
  getWorkflowCapabilityTimeoutMs,
  getWorkflowHttpMaxResponseBytes,
  getWorkflowInternalKey,
  resolveAllowedWorkflowRpcName,
  resolveWorkflowHttpUrl
} from './trigger-workflow-policy';
import {
  createTriggerWorkflowSupabaseClient,
  executeTriggerWorkflowRpc
} from './trigger-workflow-worker-supabase';

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
    assertHttpTarget?: typeof assertWorkflowHttpTarget;
  } = {}
) {
  assertAdapterType(input, 'backendCommand');
  const functionSource = readRequiredString(input.adapter.functionSource, 'adapter.functionSource');
  const fetchImplementation = dependencies.fetch ?? fetch;
  const capabilityTimeoutMs = getWorkflowCapabilityTimeoutMs(input.adapter.timeoutSeconds);
  const supabase = dependencies.supabase ?? createTriggerWorkflowSupabaseClient(
    TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand
  );

  return executeTriggerWorkflowFunction(
    functionSource,
    scriptSnapshot(input),
    async (name, args) => {
      switch (name) {
        case 'http.request':
          return executeHttpRequest(
            fetchImplementation,
            args,
            capabilityTimeoutMs,
            dependencies.assertHttpTarget
          );
        case 'supabase.rpc':
          return executeSupabaseRpc(supabase, args);
        case 'supabase.operation':
          return executeSupabaseOperation(supabase, args);
        case 'baseService.invoke':
          return executeBaseServiceInvoke(
            fetchImplementation,
            input,
            args,
            capabilityTimeoutMs
          );
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
  const procedureName = resolveAllowedWorkflowRpcName(
    readRequiredString(input.adapter.procedureName, 'adapter.procedureName'),
    readString(input.adapter.procedureSchema) || 'public'
  );
  const supabase = dependencies.supabase ?? createTriggerWorkflowSupabaseClient(
    TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure
  );
  return executeTriggerWorkflowRpc(supabase, procedureName, input.payload);
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

async function executeHttpRequest(
  fetchImplementation: typeof fetch,
  args: unknown[],
  timeoutMs: number,
  assertHttpTarget: typeof assertWorkflowHttpTarget = assertWorkflowHttpTarget
) {
  const url = resolveWorkflowHttpUrl(readRequiredString(args[0], 'http.request url'));
  await assertHttpTarget(url);
  const rawInit = isRecord(args[1]) ? args[1] : {};
  const method = (readString(rawInit.method) || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    throw new Error(`Unsupported workflow HTTP method: ${method}.`);
  }
  const headers = isRecord(rawInit.headers)
    ? Object.fromEntries(Object.entries(rawInit.headers).map(([key, value]) => [key, String(value)]))
    : {};
  assertSafeWorkflowHeaders(headers);
  const body = rawInit.body;
  const response = await fetchWithTimeout(fetchImplementation, url, {
    method,
    redirect: 'error',
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers
    },
    ...(body !== undefined
      ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
      : {})
  }, timeoutMs);
  const text = await readBoundedResponseText(response, getWorkflowHttpMaxResponseBytes());
  const parsed = parseResponseBody(text);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
  return parsed;
}

async function executeSupabaseRpc(client: SupabaseClient, args: unknown[]) {
  const name = resolveAllowedWorkflowRpcName(
    readRequiredString(args[0], 'supabase.rpc name')
  );
  const parameters = isRecord(args[1]) ? args[1] : {};
  return executeTriggerWorkflowRpc(client, name, parameters);
}

type SupabaseOperation =
  | { kind: 'property'; name: string }
  | { kind: 'method'; name: string; args: unknown[] };

async function executeSupabaseOperation(client: SupabaseClient, args: unknown[]) {
  if (!Array.isArray(args) || !args.length) {
    throw new Error('supabase.operation requires a non-empty operation path.');
  }

  const path = args[0];
  if (!Array.isArray(path)) {
    throw new Error('supabase.operation path must be an array.');
  }

  let current: unknown = client;
  for (const rawOperation of path) {
    const operation = assertSupabaseOperation(rawOperation);
    if (operation.kind === 'property') {
      if (current === null || current === undefined) {
        throw new Error(`Supabase property "${operation.name}" cannot be read.`);
      }
      current = (current as Record<string, unknown>)[operation.name];
      continue;
    }

    if (current === null || current === undefined) {
      throw new Error(`Supabase method "${operation.name}" has no receiver.`);
    }
    const method = (current as Record<string, unknown>)[operation.name];
    if (typeof method !== 'function') {
      throw new Error(`Supabase method "${operation.name}" is not available.`);
    }

    if (operation.name === 'rpc') {
      const rpcName = resolveAllowedWorkflowRpcName(
        readRequiredString(operation.args[0], 'supabase.rpc name')
      );
      const parameters = isRecord(operation.args[1]) ? operation.args[1] : {};
      current = await executeTriggerWorkflowRpc(
        current as SupabaseClient,
        rpcName,
        parameters
      );
      continue;
    }

    current = method.apply(current, operation.args);
  }

  return await Promise.resolve(current);
}

function assertSupabaseOperation(value: unknown): SupabaseOperation {
  const operation = assertRecord(value, 'supabase.operation contains an invalid operation.');
  const kind = readString(operation.kind);
  const name = readRequiredString(operation.name, 'supabase operation name');
  if (kind === 'property') return { kind, name };
  if (kind === 'method') {
    if (!Array.isArray(operation.args)) {
      throw new Error(`Supabase method "${name}" arguments must be an array.`);
    }
    return { kind, name, args: operation.args };
  }
  throw new Error(`Unsupported Supabase operation kind: ${kind || 'unknown'}.`);
}

async function executeBaseServiceInvoke(
  fetchImplementation: typeof fetch,
  input: TriggerWorkflowAdapterPayload,
  args: unknown[],
  timeoutMs: number
) {
  const serviceName = readRequiredString(args[0], 'baseService serviceName');
  const serviceMethod = readRequiredString(args[1], 'baseService serviceMethod');
  const postData = isRecord(args[2]) ? args[2] : {};
  const env = getEnv();
  const apiBaseUrl = String(env.WORKFLOW_INTERNAL_API_URL ?? env.API_BASE_URL ?? 'http://127.0.0.1:3002/api')
    .replace(/\/+$/, '');
  const response = await fetchWithTimeout(fetchImplementation, `${apiBaseUrl}/internal/service`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      'x-workflow-internal-key': getWorkflowInternalKey()
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
  }, timeoutMs);
  const text = await readBoundedResponseText(response, getWorkflowHttpMaxResponseBytes());
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

async function fetchWithTimeout(
  fetchImplementation: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Workflow capability timed out after ${timeoutMs} ms.`));
  }, timeoutMs);
  try {
    return await fetchImplementation(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedResponseText(response: Response, maxBytes: number) {
  const length = Number(response.headers.get('content-length'));
  if (Number.isFinite(length) && length > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`Workflow HTTP response exceeds ${maxBytes} bytes.`);
  }
  if (!response.body) return '';

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(`Workflow HTTP response exceeds ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function assertSafeWorkflowHeaders(headers: Record<string, string>) {
  const blocked = new Set([
    'authorization',
    'cookie',
    'host',
    'proxy-authorization',
    'x-workflow-internal-key'
  ]);
  const invalid = Object.keys(headers).find((name) => blocked.has(name.toLowerCase()));
  if (invalid) throw new Error(`Workflow HTTP header is not allowed: ${invalid}.`);
}
