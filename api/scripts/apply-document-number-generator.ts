import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260812210000_document_number_generator.sql',
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000,
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      rule_table: string | null;
      counter_table: string | null;
      allocation_table: string | null;
      generator_exists: boolean;
      context_rpc_exists: boolean;
      sales_order_default: boolean;
    }>(`
      select
        to_regclass('public.document_number_rules')::text as rule_table,
        to_regclass('public.document_number_counters')::text as counter_table,
        to_regclass('public.document_number_allocations')::text as allocation_table,
        to_regprocedure('public.generate_document_number(jsonb)') is not null
          as generator_exists,
        to_regprocedure(
          'public.read_lowcode_default_value_procedure(text,text,jsonb)'
        ) is not null as context_rpc_exists,
        exists (
          select 1
          from public.lowcode_pages pages,
            lateral jsonb_array_elements(pages.schema->'blocks') block_item,
            lateral jsonb_array_elements(block_item->'schema'->'fields') field_item
          where pages.code = 'sales-orders-edit'
            and block_item->>'id' = 'sales-order-edit-form'
            and field_item->>'field' = 'doc_no'
            and field_item->>'defaultValueType' = 'procedure'
            and field_item->>'defaultValueProcedure' = 'public.generate_document_number'
        ) as sales_order_default
    `);
    const result = rows[0];
    assert.equal(result?.rule_table, 'document_number_rules');
    assert.equal(result?.counter_table, 'document_number_counters');
    assert.equal(result?.allocation_table, 'document_number_allocations');
    assert.equal(result?.generator_exists, true);
    assert.equal(result?.context_rpc_exists, true);
    assert.equal(result?.sales_order_default, true);
    console.log(JSON.stringify({ ...result, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
