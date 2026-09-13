import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FrontendCommand } from '../../frontend-command/frontend-command.types';
import { executeBackendCommandAdapter, executeFrontendCommandAdapter, executeStoredProcedureAdapter } from './trigger-workflow-adapter.task';
import { TRIGGER_WORKFLOW_ADAPTER_TASK_IDS, type TriggerWorkflowAdapterPayload } from './trigger-workflow.types';

async function main() {
  let command: FrontendCommand | undefined;
  const front = await executeFrontendCommandAdapter(payload({ type: 'frontendCommand', executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.frontendCommand, input: {}, functionSource: "async ({ payload }) => ({ code: 'message.show', params: { message: payload.message, type: 'success' } })" }, { message: 'ok' }), { publish: async value => { command = value; return { subscriberCount: 1 }; } });
  assert.equal(command?.params.message, 'ok'); assert.equal(front.subscriberCount, 1);

  const previousKey = process.env.WORKFLOW_INTERNAL_KEY; process.env.WORKFLOW_INTERNAL_KEY = 'adapter-test-key';
  let request: { url: string; init?: RequestInit } | undefined;
  try {
    const output = await executeBackendCommandAdapter(payload({ type: 'backendCommand', executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand, commandCode: 'coverage.echo_this_service', input: {} }, { value: 42 }), { fetch: async (input, init) => { request = { url: String(input), init }; return new Response(JSON.stringify({ success: true, data: { serviceInstance: true } }), { status: 200 }); } });
    assert.deepEqual(output, { serviceInstance: true }); assert.match(request?.url ?? '', /\/internal\/workflow-command$/); assert.equal((request?.init?.headers as Record<string, string>)['x-workflow-internal-key'], 'adapter-test-key');
    const body = JSON.parse(String(request?.init?.body)) as Record<string, any>; assert.equal(body.commandCode, 'coverage.echo_this_service'); assert.deepEqual(body.postData, { value: 42 });
  } finally { if (previousKey === undefined) delete process.env.WORKFLOW_INTERNAL_KEY; else process.env.WORKFLOW_INTERNAL_KEY = previousKey; }

  await assert.rejects(() => executeBackendCommandAdapter(payload({ type: 'backendCommand', executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.backendCommand, input: {} } as any)), /database-registered commandCode/);
  let called: { name: string; args: Record<string, unknown> } | undefined;
  const stored = await executeStoredProcedureAdapter(payload({ type: 'storedProcedure', executorTaskId: TRIGGER_WORKFLOW_ADAPTER_TASK_IDS.storedProcedure, input: {}, procedureName: 'planning_publish_plan_version', procedureSchema: 'public' }, { p_version_id: 'version-1' }), { supabase: { rpc: async (name: string, args: Record<string, unknown>) => { called = { name, args }; return { data: { published: true }, error: null }; } } as unknown as SupabaseClient });
  assert.deepEqual(called, { name: 'planning_publish_plan_version', args: { p_version_id: 'version-1' } }); assert.deepEqual(stored, { published: true });
  console.log('workflow-api typed Trigger workflow adapter tests passed');
}

function payload(adapter: TriggerWorkflowAdapterPayload['adapter'], data: Record<string, unknown> = {}): TriggerWorkflowAdapterPayload { return { runId: 'run-1', jobId: 'job-1', tenantId: 'account-1', userId: 'user-1', workflowId: 'model-1', workflowCode: 'typed-workflow', operationId: 'op-task', nodeId: 'task', payload: data, variables: {}, adapter }; }
void main();
