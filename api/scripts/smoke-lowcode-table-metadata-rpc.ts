import assert from 'node:assert/strict';
import { createSupabaseClient } from '../src/common/utils/supabase';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function main() {
  const client = createSupabaseClient('admin');
  const command = async (action: string, payload: JsonRecord) => {
    const { data, error } = await client.rpc('read_lowcode_table_metadata', {
      p_action: action,
      p_payload: payload
    });
    if (error) throw new Error(`${action}: ${error.message}`);
    return data;
  };

  const tables = await command('list_tables', {});
  assert.ok(Array.isArray(tables));
  assert.ok(tables.some((row) => isRecord(row) && row.table_name === 'admin_entities'));

  const inspection = await command('inspect_table', {
    schema_name: 'public',
    table_name: 'sales_orders'
  });
  assert.ok(isRecord(inspection));
  assert.ok(isRecord(inspection.table));
  assert.equal(inspection.table.fullName, 'public.sales_orders');
  assert.ok(Array.isArray(inspection.columns));
  assert.ok(inspection.columns.some((row) => isRecord(row) && row.name === 'id'));
  assert.ok(Array.isArray(inspection.childRelations));
  assert.ok(inspection.childRelations.some((row) =>
    isRecord(row) && isRecord(row.childTable) && row.childTable.name === 'sales_order_lines'
  ));

  console.log('Low-code table metadata RPC smoke test passed.');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
