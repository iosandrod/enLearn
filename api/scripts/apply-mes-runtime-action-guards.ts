import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260812110000_mes_runtime_action_guards.sql'
);

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  for (let attempt = 1; ; attempt += 1) {
    try {
      await client.connect();
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1_000));
    }
  }
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      guarded_actions: number;
      operation_actions: unknown[] | null;
      page_guards: Array<{
        code: string;
        guarded_actions: number;
        status: string;
        total_actions: number;
      }>;
      view_columns: Array<{ column_name: string; ordinal_position: number; table_name: string }>;
    }>(`
      select
        (select coalesce(count(*)::integer, 0)
         from public.lowcode_pages page
         cross join lateral jsonb_path_query(
           page.schema, '$.**.rowActions.actions[*]'
         ) action
         where page.code in (
           'mes_release_console', 'mes_execution_console',
           'mes_production_ledger', 'mes_material_ledger'
         ) and action ? 'visible') as guarded_actions,
        (select schema #> '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions}'
         from public.lowcode_pages
         where code = 'mes_execution_console') as operation_actions,
        (select coalesce(jsonb_agg(to_jsonb(page_guard) order by page_guard.code), '[]'::jsonb)
         from (
           select page.code, page.status,
             count(*)::integer as total_actions,
             count(*) filter (where action ? 'visible')::integer as guarded_actions
           from public.lowcode_pages page
           cross join lateral jsonb_path_query(
             page.schema, '$.**.rowActions.actions[*]'
           ) action
           where page.code in (
             'mes_release_console', 'mes_execution_console',
             'mes_production_ledger', 'mes_material_ledger'
           )
           group by page.code, page.status
         ) page_guard) as page_guards,
        (select coalesce(jsonb_agg(to_jsonb(view_column)
           order by view_column.table_name, view_column.ordinal_position), '[]'::jsonb)
         from (
           select table_name, column_name, ordinal_position
           from information_schema.columns
           where table_schema = 'public'
             and table_name in (
               'mes_work_order_operation_runtime_view',
               'mes_work_order_component_runtime_view',
               'mes_production_transaction_runtime_view',
               'mes_material_transaction_runtime_view'
             )
         ) view_column) as view_columns
    `);
    const verification = rows[0];
    const pageGuards = verification?.page_guards ?? [];
    const operationActions = verification?.operation_actions ?? [];
    const expectedPageGuards = new Map([
      ['mes_execution_console', 9],
      ['mes_material_ledger', 1],
      ['mes_production_ledger', 1],
      ['mes_release_console', 0]
    ]);
    const requiredTrailingColumns = new Map([
      ['mes_work_order_component_runtime_view', 'work_order_status'],
      ['mes_production_transaction_runtime_view', 'work_order_status'],
      ['mes_material_transaction_runtime_view', 'work_order_status']
    ]);
    const viewColumns = verification?.view_columns ?? [];
    const trailingColumnsValid = [...requiredTrailingColumns].every(([tableName, columnName]) => {
      const columns = viewColumns.filter((column) => column.table_name === tableName);
      return columns.at(-1)?.column_name === columnName;
    });
    const validPageGuards = pageGuards.length === expectedPageGuards.size
      && pageGuards.every((page) => (
        page.status === 'published'
        && page.guarded_actions === expectedPageGuards.get(page.code)
      ));
    if (
      verification?.guarded_actions !== 11
      || operationActions.length !== 5
      || !validPageGuards
      || !trailingColumnsValid
    ) {
      const { rows: diagnostics } = await client.query(`
        select code, version, jsonb_typeof(schema->'blocks') as blocks_type,
          jsonb_array_length(coalesce(schema->'blocks', '[]'::jsonb)) as block_count,
          schema->>'code' as schema_code
          ,(select jsonb_agg(jsonb_build_object('index', ordinality - 1, 'id', block->>'id', 'kind', block->>'kind'))
            from jsonb_array_elements(schema->'blocks') with ordinality as blocks(block, ordinality)) as blocks
        from public.lowcode_pages
        where code like 'mes_%'
        order by code
      `);
      throw new Error(
        `MES runtime-action verification failed: ${JSON.stringify({ result: verification, diagnostics })}`
      );
    }
    console.log(JSON.stringify({
      guarded_actions: verification.guarded_actions,
      operation_actions: operationActions.length,
      page_guards: pageGuards,
      view_column_contract: true,
      applied: true
    }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
