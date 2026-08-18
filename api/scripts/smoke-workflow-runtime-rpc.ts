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
  const { data: definition, error: definitionError } = await client
    .from('wf_process_definition')
    .select('id,version')
    .eq('account_id', accountId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  if (definitionError) throw new Error(definitionError.message);
  if (!definition) {
    console.log('Workflow runtime RPC smoke test skipped: no active definition.');
    return;
  }

  const instanceId = randomUUID();
  const nodeInstanceId = randomUUID();
  const taskId = randomUUID();
  const businessKey = `runtime-rpc-smoke:${randomUUID()}`;

  const command = async (action: string, payload: JsonRecord) => {
    const { data, error } = await client.rpc('workflow_runtime_command', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new Error(`${action}: ${error.message}`);
    return data;
  };

  try {
    const created = await command('create_instance', {
      id: instanceId,
      account_id: accountId,
      definition_id: definition.id,
      definition_version: definition.version,
      business_key: businessKey,
      title: 'Workflow runtime RPC smoke',
      variables: { amount: 12.5, approved: false },
      variable_types: { amount: 'number', approved: 'boolean' }
    });
    assert.ok(isRecord(created));
    assert.equal(created.status, 'running');

    const node = await command('create_node_instance', {
      id: nodeInstanceId,
      process_instance_id: instanceId,
      execution_key: 'smoke:approval',
      node_id: 'approval',
      node_type: 'approval',
      name: 'Smoke approval',
      status: 'running'
    });
    assert.ok(isRecord(node));

    const tasks = await command('create_tasks', {
      items: [{
        id: taskId,
        account_id: accountId,
        process_instance_id: instanceId,
        node_instance_id: nodeInstanceId,
        node_id: 'approval',
        title: 'Smoke approval task',
        waitpoint_token_id: `smoke-waitpoint-${randomUUID()}`,
        candidates: []
      }]
    });
    assert.ok(Array.isArray(tasks));
    assert.equal(tasks.length, 1);

    const detail = await command('get_instance', { instance_id: instanceId });
    assert.ok(isRecord(detail));
    assert.ok(Array.isArray(detail.variables));
    assert.ok(Array.isArray(detail.tasks));

    const prepared = await command('prepare_task_decision', {
      task_id: taskId,
      decision_action: 'approve',
      account_id: accountId,
      comment: 'RPC smoke approved',
      variables: { approved: true },
      variable_types: { approved: 'boolean' }
    });
    assert.ok(isRecord(prepared));
    assert.equal(prepared.already_prepared, false);

    const preparedAgain = await command('prepare_task_decision', {
      task_id: taskId,
      decision_action: 'approve',
      account_id: accountId,
      variables: {}
    });
    assert.ok(isRecord(preparedAgain));
    assert.equal(preparedAgain.already_prepared, true);

    const timeline = await command('get_timeline', { instance_id: instanceId });
    assert.ok(Array.isArray(timeline));
    assert.ok(timeline.some((row) => isRecord(row) && row.event_type === 'TASK_COMPLETED'));

    await command('set_instance_status', {
      instance_id: instanceId,
      status: 'approved',
      payload: { smoke: true }
    });
    assert.equal(
      await command('is_instance_running', { instance_id: instanceId }),
      false
    );

    console.log('Workflow runtime RPC smoke test passed.');
  } finally {
    await client.from('wf_process_instance').delete().eq('id', instanceId);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
