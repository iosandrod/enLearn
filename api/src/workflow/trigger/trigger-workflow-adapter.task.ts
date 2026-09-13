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
  getWorkflowCapabilityTimeoutMs,
  getWorkflowHttpMaxResponseBytes,
  getWorkflowInternalKey,
  resolveAllowedWorkflowRpcName
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
  } = {}
) {
  assertAdapterType(input, 'backendCommand');
  if (input.adapter.commandCode?.trim()) {
    return executeRegisteredBackendCommand(
      dependencies.fetch ?? fetch,
      input,
      input.adapter.commandCode.trim(),
      getWorkflowCapabilityTimeoutMs(input.adapter.timeoutSeconds)
    );
  }
  throw new Error('Backend command adapter requires a database-registered commandCode.');
}

async function executeRegisteredBackendCommand(
  fetchImplementation: typeof fetch,
  input: TriggerWorkflowAdapterPayload,
  commandCode: string,
  timeoutMs: number
) {
  const env = getEnv();
  const apiBaseUrl = String(env.WORKFLOW_INTERNAL_API_URL ?? env.API_BASE_URL ?? 'http://127.0.0.1:3002/api')
    .replace(/\/+$/, '');
  const response = await fetchWithTimeout(fetchImplementation, `${apiBaseUrl}/internal/workflow-command`, {
    method: 'POST',
    redirect: 'error',
    headers: {
      'content-type': 'application/json',
      'x-workflow-internal-key': getWorkflowInternalKey()
    },
    body: JSON.stringify({
      commandCode,
      postData: input.payload,
      context: {
        accountId: input.tenantId,
        userId: input.userId,
        requestId: `workflow:${input.runId}:${input.operationId}`
      }
    })
  }, timeoutMs);
  const text = await readBoundedResponseText(response, getWorkflowHttpMaxResponseBytes());
  const parsed = parseResponseBody(text);
  if (!response.ok) throw new Error(`Registered backend command ${commandCode} failed with HTTP ${response.status}: ${text}`);
  return isRecord(parsed) && 'data' in parsed ? parsed.data : parsed;
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
