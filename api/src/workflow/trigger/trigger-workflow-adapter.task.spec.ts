import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FrontendCommand } from '../../frontend-command/frontend-command.types';
import {
  assertWorkflowHttpTarget,
  resolveWorkflowHttpUrl
} from './trigger-workflow-policy';
import {
  executeBackendCommandAdapter,
  executeFrontendCommandAdapter,
  executeStoredProcedureAdapter
} from './trigger-workflow-adapter.task';
import type { TriggerWorkflowAdapterPayload } from './trigger-workflow.types';

async function main() {
  await testFrontendCommandFunctionIsTheSourceOfThePublishedCommand();
  await testBackendCommandUsesRegisteredCapabilities();
  await testBackendCommandRejectsUntrustedOrigins();
  await testWorkflowHttpTargetRejectsPrivateDnsAnswers();
  await testWorkflowHttpTargetAllowsConfiguredPublicAnswers();
  await testBackendCommandRejectsOversizedStreamingResponse();
  await testBackendCommandRejectsUnlistedRpc();
  await testBackendCommandInvokesTheInternalCapabilityBridge();
  await testStoredProcedureUsesTheConfiguredProcedure();
  await testStoredProcedureRejectsUnlistedProcedure();
  console.log('workflow-api typed Trigger workflow adapter tests passed');
}

async function testFrontendCommandFunctionIsTheSourceOfThePublishedCommand() {
  let command: FrontendCommand | undefined;
  const output = await executeFrontendCommandAdapter(
    createPayload({
      type: 'frontendCommand',
      executorTaskId: 'workflow.adapter.frontend-command',
      input: {},
      functionSource: `async ({ payload, context }) => ({
        code: 'message.show',
        params: { message: payload.message, type: 'warning', duration: 3210 },
        target: { userId: context.userId }
      })`
    }, { message: '来自当前节点函数' }),
    {
      publish: async (value) => {
        command = value;
        return { subscriberCount: 2 };
      },
      now: () => new Date('2026-08-14T00:00:00.000Z')
    }
  );

  assert.equal(command?.params.message, '来自当前节点函数');
  assert.equal(command?.params.type, 'warning');
  assert.equal(command?.params.duration, 3210);
  assert.equal(output.subscriberCount, 2);
  assert.equal(JSON.stringify(output).includes('接受指令成功'), false);
}

async function testBackendCommandUsesRegisteredCapabilities() {
  const previousOrigins = process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS;
  process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS = 'https://example.test';
  const calls: Array<{ url: string; method: string }> = [];
  let output: unknown;
  try {
    output = await executeBackendCommandAdapter(
      createPayload({
        type: 'backendCommand',
        executorTaskId: 'workflow.adapter.backend-command',
        input: {},
        functionSource: `async ({ context }) => {
          return await context.http.post('https://example.test/orders', { id: 'order-1' });
        }`
      }),
      {
        fetch: async (input, init) => {
          calls.push({ url: String(input), method: String(init?.method) });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        },
        assertHttpTarget: async () => undefined,
        supabase: createSupabaseStub(async () => ({ data: null, error: null }))
      }
    );
  } finally {
    if (previousOrigins === undefined) delete process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS;
    else process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS = previousOrigins;
  }

  assert.deepEqual(output, { ok: true });
  assert.deepEqual(calls, [{ url: 'https://example.test/orders', method: 'POST' }]);
}

async function testBackendCommandRejectsUntrustedOrigins() {
  await assert.rejects(
    () => executeBackendCommandAdapter(
      createPayload({
        type: 'backendCommand',
        executorTaskId: 'workflow.adapter.backend-command',
        input: {},
        functionSource: `async ({ context }) => context.http.get('http://169.254.169.254/latest/meta-data')`
      }),
      {
        fetch: async () => {
          throw new Error('Untrusted requests must not reach fetch.');
        },
        supabase: createSupabaseStub(async () => ({ data: null, error: null }))
      }
    ),
    /origin is not allowed/
  );
}

async function testWorkflowHttpTargetRejectsPrivateDnsAnswers() {
  const url = resolveWorkflowHttpUrl(
    'https://allowed.example.test/orders',
    ['https://allowed.example.test']
  );
  await assert.rejects(
    () => assertWorkflowHttpTarget(url, async () => [
      { address: '169.254.169.254', family: 4 as const }
    ]),
    /private or reserved address/
  );
}

async function testWorkflowHttpTargetAllowsConfiguredPublicAnswers() {
  const url = resolveWorkflowHttpUrl(
    'https://allowed.example.test/orders',
    ['https://allowed.example.test']
  );
  await assert.doesNotReject(
    () => assertWorkflowHttpTarget(url, async () => [
      { address: '104.18.38.10', family: 4 as const }
    ])
  );
}

async function testBackendCommandRejectsOversizedStreamingResponse() {
  const previousOrigins = process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS;
  const previousLimit = process.env.WORKFLOW_HTTP_MAX_RESPONSE_BYTES;
  process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS = 'https://example.test';
  process.env.WORKFLOW_HTTP_MAX_RESPONSE_BYTES = '4';
  try {
    await assert.rejects(
      () => executeBackendCommandAdapter(
        createPayload({
          type: 'backendCommand',
          executorTaskId: 'workflow.adapter.backend-command',
          input: {},
          functionSource: `async ({ context }) => context.http.get('https://example.test/large')`
        }),
        {
          fetch: async () => new Response('12345', { status: 200 }),
          assertHttpTarget: async () => undefined,
          supabase: createSupabaseStub(async () => ({ data: null, error: null }))
        }
      ),
      /response exceeds 4 bytes/
    );
  } finally {
    if (previousOrigins === undefined) delete process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS;
    else process.env.WORKFLOW_HTTP_ALLOWED_ORIGINS = previousOrigins;
    if (previousLimit === undefined) delete process.env.WORKFLOW_HTTP_MAX_RESPONSE_BYTES;
    else process.env.WORKFLOW_HTTP_MAX_RESPONSE_BYTES = previousLimit;
  }
}

async function testBackendCommandRejectsUnlistedRpc() {
  await assert.rejects(
    () => executeBackendCommandAdapter(
      createPayload({
        type: 'backendCommand',
        executorTaskId: 'workflow.adapter.backend-command',
        input: {},
        functionSource: `async ({ context }) => context.supabase.rpc('workflow_job_command', {})`
      }),
      {
        supabase: createSupabaseStub(async () => {
          throw new Error('Unlisted RPC calls must not reach Supabase.');
        })
      }
    ),
    /RPC is not allowed/
  );
}

async function testBackendCommandInvokesTheInternalCapabilityBridge() {
  const previousKey = process.env.WORKFLOW_INTERNAL_KEY;
  process.env.WORKFLOW_INTERNAL_KEY = 'adapter-test-internal-key';
  let request: { url: string; init?: RequestInit } | undefined;
  try {
    const output = await executeBackendCommandAdapter(
      createPayload({
        type: 'backendCommand',
        executorTaskId: 'workflow.adapter.backend-command',
        input: {},
        functionSource: `async ({ context }) => context.baseService.invoke(
          'planning',
          'listInventoryBuffers',
          { itemId: 'item-1', limit: 20 }
        )`
      }),
      {
        fetch: async (input, init) => {
          request = { url: String(input), init };
          return new Response(JSON.stringify({ success: true, data: [{ id: 'buffer-1' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        },
        supabase: createSupabaseStub(async () => ({ data: null, error: null }))
      }
    );
    assert.deepEqual(output, [{ id: 'buffer-1' }]);
    assert.equal(request?.url, 'http://127.0.0.1:3002/api/internal/service');
    assert.equal(
      (request?.init?.headers as Record<string, string>)['x-workflow-internal-key'],
      'adapter-test-internal-key'
    );
    const body = JSON.parse(String(request?.init?.body)) as Record<string, unknown>;
    assert.equal(body.serviceName, 'planning');
    assert.equal(body.serviceMethod, 'listInventoryBuffers');
    assert.deepEqual(body.postData, { itemId: 'item-1', limit: 20 });
    assert.deepEqual(body.context, {
      accountId: 'account-1',
      userId: 'user-1',
      requestId: 'workflow:run-1:op-task'
    });
  } finally {
    if (previousKey === undefined) delete process.env.WORKFLOW_INTERNAL_KEY;
    else process.env.WORKFLOW_INTERNAL_KEY = previousKey;
  }
}

async function testStoredProcedureUsesTheConfiguredProcedure() {
  let called: { name: string; args: Record<string, unknown> } | undefined;
  const output = await executeStoredProcedureAdapter(
    createPayload({
      type: 'storedProcedure',
      executorTaskId: 'workflow.adapter.stored-procedure',
      input: {},
      procedureName: 'planning_publish_plan_version',
      procedureSchema: 'public'
    }, { p_version_id: 'version-1' }),
    {
      supabase: createSupabaseStub(async (name, args) => {
        called = { name, args: args as Record<string, unknown> };
        return { data: { published: true }, error: null };
      })
    }
  );

  assert.deepEqual(called, {
    name: 'planning_publish_plan_version',
    args: { p_version_id: 'version-1' }
  });
  assert.deepEqual(output, { published: true });
}

async function testStoredProcedureRejectsUnlistedProcedure() {
  await assert.rejects(
    () => executeStoredProcedureAdapter(
      createPayload({
        type: 'storedProcedure',
        executorTaskId: 'workflow.adapter.stored-procedure',
        input: {},
        procedureName: 'workflow_job_command',
        procedureSchema: 'public'
      }),
      {
        supabase: createSupabaseStub(async () => {
          throw new Error('Unlisted stored procedures must not reach Supabase.');
        })
      }
    ),
    /RPC is not allowed/
  );
}

function createPayload(
  adapter: TriggerWorkflowAdapterPayload['adapter'],
  payload: Record<string, unknown> = {}
): TriggerWorkflowAdapterPayload {
  return {
    runId: 'run-1',
    jobId: 'job-1',
    tenantId: 'account-1',
    userId: 'user-1',
    workflowId: 'model-1',
    workflowCode: 'typed-workflow',
    operationId: 'op-task',
    nodeId: 'task',
    payload,
    variables: {},
    adapter
  };
}

function createSupabaseStub(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
) {
  return { rpc } as unknown as SupabaseClient;
}

void main();
