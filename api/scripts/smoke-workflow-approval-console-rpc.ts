import assert from 'node:assert/strict';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  const client = createSupabaseClient('admin');
  const { data, error } = await client.rpc('workflow_approval_console_command', {
    p_action: 'list',
    p_payload: {
      account_id: '00000000-0000-4000-8000-000000000001',
      limit: 2,
      offset: 0
    }
  });
  if (error) throw new Error(error.message);
  assert.ok(isRecord(data));
  assert.ok(Array.isArray(data.rows));
  assert.ok(Array.isArray(data.definitions));
  assert.ok(isRecord(data.summary));
  assert.equal(typeof data.total, 'number');
  console.log('Workflow approval console RPC smoke test passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
