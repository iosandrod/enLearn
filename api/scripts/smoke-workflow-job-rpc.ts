import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  const client = createSupabaseClient('admin');
  const accountId = '00000000-0000-4000-8000-000000000001';
  const code = `rpc_smoke_${Date.now()}`;
  let jobId = '';
  let runId = '';

  const command = async (action: string, payload: JsonRecord) => {
    const { data, error } = await client.rpc('workflow_job_command', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new Error(`${action}: ${error.message}`);
    return data;
  };

  try {
    const created = await command('create_job', {
      account_id: accountId,
      code,
      name: 'Workflow job RPC smoke',
      type: 'manual',
      trigger_task_id: 'workflow.job.run',
      timezone: 'Asia/Shanghai',
      payload: { smoke: true },
      retry_policy: { maxAttempts: 1 }
    });
    assert.ok(isRecord(created));
    jobId = String(created.id);
    assert.equal(created.account_id, accountId);

    const loaded = await command('get_job', {
      account_id: accountId,
      job_id: jobId
    });
    assert.ok(isRecord(loaded));
    assert.equal(loaded.code, code);

    const createdRun = await command('create_run', {
      account_id: accountId,
      job_id: jobId,
      status: 'queued',
      attempt: 1,
      input: { smoke: true }
    });
    assert.ok(isRecord(createdRun));
    runId = String(createdRun.id);

    const running = await command('mark_run_running', { run_id: runId });
    assert.ok(isRecord(running));
    assert.equal(running.status, 'running');

    const projected = await command('project_trigger_run', {
      account_id: accountId,
      run_id: runId,
      trigger_run_id: `smoke-${randomUUID()}`
    });
    assert.ok(isRecord(projected));

    const finished = await command('finish_run', {
      run_id: runId,
      status: 'succeeded',
      output: { smoke: 'passed' }
    });
    assert.ok(isRecord(finished));
    assert.equal(finished.status, 'succeeded');

    const runs = await command('list_runs', {
      account_id: accountId,
      job_id: jobId,
      limit: 10
    });
    assert.ok(Array.isArray(runs));
    assert.ok(runs.some((row) => isRecord(row) && row.id === runId));

    console.log('Workflow job RPC smoke test passed.');
  } finally {
    if (runId) await client.from('wf_job_run').delete().eq('id', runId);
    if (jobId) await client.from('wf_job').delete().eq('id', jobId);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
