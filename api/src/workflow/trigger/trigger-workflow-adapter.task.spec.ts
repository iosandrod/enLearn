import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FrontendCommand } from '../../frontend-command/frontend-command.types';
import {
  executeBackendCommandAdapter,
  executeFrontendCommandAdapter,
  executeStoredProcedureAdapter
} from './trigger-workflow-adapter.task';
import type { TriggerWorkflowAdapterPayload } from './trigger-workflow.types';

async function main() {
  await testFrontendCommandFunctionIsTheSourceOfThePublishedCommand();
  await testBackendCommandUsesRegisteredCapabilities();
  await testStoredProcedureUsesTheConfiguredProcedure();
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
  const calls: Array<{ url: string; method: string }> = [];
  const output = await executeBackendCommandAdapter(
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
      supabase: createSupabaseStub(async () => ({ data: null, error: null }))
    }
  );

  assert.deepEqual(output, { ok: true });
  assert.deepEqual(calls, [{ url: 'https://example.test/orders', method: 'POST' }]);
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
