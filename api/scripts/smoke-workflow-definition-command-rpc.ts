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
  const code = `definition_rpc_smoke_${Date.now()}`;
  let modelId = '';

  const command = async (action: string, payload: JsonRecord) => {
    const { data, error } = await client.rpc('workflow_definition_command', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new Error(`${action}: ${error.message}`);
    return data;
  };

  try {
    const created = await command('save_model', {
      account_id: accountId,
      code,
      name: 'Definition command RPC smoke',
      document_type: 'rpc_smoke',
      draft_schema: { schemaVersion: 1, code, name: 'Definition command RPC smoke', nodes: [], edges: [] }
    });
    assert.ok(isRecord(created));
    modelId = String(created.id);
    assert.equal(created.account_id, accountId);

    const updated = await command('save_model', {
      model_id: modelId,
      account_id: accountId,
      code,
      name: 'Definition command RPC smoke updated',
      document_type: 'rpc_smoke',
      draft_schema: { schemaVersion: 1, code, name: 'Definition command RPC smoke updated', nodes: [], edges: [] }
    });
    assert.ok(isRecord(updated));
    assert.equal(updated.name, 'Definition command RPC smoke updated');

    await assert.rejects(
      () => command('save_model', {
        model_id: randomUUID(),
        account_id: accountId,
        code,
        name: 'Missing model',
        draft_schema: {}
      }),
      /Workflow model not found/
    );

    console.log('Workflow definition command RPC smoke test passed.');
  } finally {
    if (modelId) await client.from('wf_model').delete().eq('id', modelId);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
