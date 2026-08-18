import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  executeTriggerWorkflowRpc,
  isTransientSupabaseError
} from './trigger-workflow-worker-supabase';

async function main() {
  await testTransientFailureIsRetried();
  await testDatabaseErrorIsNotRetried();
  await testTimeoutIsRetriedWithinTheLimit();
  console.log('workflow Trigger worker Supabase retry tests passed');
}

async function testTransientFailureIsRetried() {
  let calls = 0;
  const client = createClientStub(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return { data: { ok: true }, error: null };
  });
  const retries: number[] = [];
  const output = await executeTriggerWorkflowRpc(client, 'workflow_job_command', {}, {
    retryDelaysMs: [0],
    sleep: async (milliseconds) => { retries.push(milliseconds); }
  });
  assert.deepEqual(output, { ok: true });
  assert.equal(calls, 2);
  assert.deepEqual(retries, [0]);
}

async function testDatabaseErrorIsNotRetried() {
  let calls = 0;
  const client = createClientStub(async () => {
    calls += 1;
    return { data: null, error: { code: '23505', message: 'duplicate key' } };
  });
  await assert.rejects(
    () => executeTriggerWorkflowRpc(client, 'workflow_job_command', {}, {
      retryDelaysMs: [0, 0]
    }),
    /duplicate key/
  );
  assert.equal(calls, 1);
}

async function testTimeoutIsRetriedWithinTheLimit() {
  let calls = 0;
  const client = createClientStub(async () => {
    calls += 1;
    return new Promise(() => undefined);
  });
  await assert.rejects(
    () => executeTriggerWorkflowRpc(client, 'workflow_job_command', {}, {
      timeoutMs: 5,
      retryDelaysMs: [0],
      sleep: async () => undefined
    }),
    /timed out/
  );
  assert.equal(calls, 2);
  assert.equal(isTransientSupabaseError(new TypeError('fetch failed')), true);
  assert.equal(isTransientSupabaseError({ code: '23505', message: 'duplicate key' }), false);
}

function createClientStub(
  rpc: () => Promise<{ data: unknown; error: { code?: string; message: string } | null }>
) {
  return { rpc } as unknown as SupabaseClient;
}

void main();
