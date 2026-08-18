import assert from 'node:assert/strict';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const connectionStrings = [
  process.env.DIRECT_URL,
  env.DIRECT_URL,
  process.env.DATABASE_URL,
  env.DATABASE_URL
].filter((value, index, values): value is string => (
  Boolean(value?.trim()) && values.indexOf(value) === index
));
if (!connectionStrings.length) throw new Error('DIRECT_URL or DATABASE_URL is required.');

async function connect() {
  let lastError: unknown;
  for (const connectionString of connectionStrings) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const client = new Client({
        connectionString: normalizePostgresConnectionString(connectionString),
        connectionTimeoutMillis: 30_000,
        keepAlive: true,
        ssl: { rejectUnauthorized: false }
      });
      client.on('error', () => undefined);
      try {
        await client.connect();
        return client;
      } catch (error) {
        lastError = error;
        await client.end().catch(() => undefined);
        if (attempt < 2) {
          await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_000));
        }
      }
    }
  }
  throw lastError ?? new Error('Could not connect to the MES database.');
}

async function main() {
  const client = await connect();
  try {
    const { rows } = await client.query<{
      commands: string[];
      pages: Array<{ code: string; status: string; title: string }>;
      routes: Array<{
        code: string;
        navigation: string | null;
        page_code: string | null;
        parent_code: string | null;
        sort_order: number;
        title: string;
      }>;
      views: string[];
      reversal_indexes: string[];
      transaction_columns: Array<{ table_name: string; column_name: string }>;
      action_guards: Array<{
        code: string;
        guarded_actions: number;
        status: string;
        total_actions: number;
      }>;
      operation_actions: number;
      runtime_view_columns: Array<{
        column_name: string;
        ordinal_position: number;
        table_name: string;
      }>;
    }>(`
      select
        (select jsonb_agg(procedure.proname order by procedure.proname)
         from pg_catalog.pg_proc procedure
         join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
         where namespace.nspname = 'public'
           and procedure.proname in (
             'mes_pause_operation', 'mes_resume_operation', 'mes_return_material',
             'mes_reverse_production', 'mes_reverse_material'
           )) as commands,
        (select jsonb_agg(jsonb_build_object(
           'code', page.code, 'title', page.title, 'status', page.status
         ) order by page.code)
         from public.lowcode_pages page
         where page.code in (
           'mes_release_console', 'mes_execution_console',
           'mes_production_ledger', 'mes_material_ledger'
         )) as pages,
        (select jsonb_agg(jsonb_build_object(
           'code', route.code, 'title', route.title, 'page_code', route.page_code,
           'parent_code', parent.code, 'sort_order', route.sort_order,
           'navigation', route.metadata->>'navigation'
         ) order by route.sort_order)
         from public.admin_routes route
         left join public.admin_routes parent on parent.id = route.parent_id
         where route.code in (
           'production-root', 'production-release', 'production-execution',
           'production-ledger', 'production-material-ledger'
         )) as routes,
        (select jsonb_agg(viewname order by viewname)
         from pg_catalog.pg_views
         where schemaname = 'public' and viewname in (
           'mes_work_order_runtime_view', 'mes_work_order_operation_runtime_view',
           'mes_work_order_component_runtime_view',
           'mes_production_transaction_runtime_view',
           'mes_material_transaction_runtime_view'
         )) as views,
        (select jsonb_agg(indexname order by indexname)
         from pg_catalog.pg_indexes
         where schemaname = 'public' and indexname in (
           'uq_mes_production_single_reversal', 'uq_mes_material_single_reversal'
         )) as reversal_indexes,
        (select jsonb_agg(jsonb_build_object(
           'table_name', column_metadata.table_name,
           'column_name', column_metadata.column_name
         ) order by column_metadata.table_name, column_metadata.column_name)
         from information_schema.columns column_metadata
         where column_metadata.table_schema = 'public'
           and (
             (column_metadata.table_name = 'mes_production_transaction'
               and column_metadata.column_name = 'original_transaction_id')
             or (column_metadata.table_name = 'mes_material_transaction'
               and column_metadata.column_name in ('original_transaction_id', 'reason_code'))
           )) as transaction_columns,
        (select jsonb_agg(to_jsonb(page_guard) order by page_guard.code)
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
         ) page_guard) as action_guards,
        (select jsonb_array_length(coalesce(
          schema #> '{blocks,3,tabs,0,blocks,0,schema,rowActions,actions}',
          '[]'::jsonb
        ))
         from public.lowcode_pages
         where code = 'mes_execution_console') as operation_actions,
        (select jsonb_agg(jsonb_build_object(
           'table_name', column_metadata.table_name,
           'column_name', column_metadata.column_name,
           'ordinal_position', column_metadata.ordinal_position
         ) order by column_metadata.table_name, column_metadata.ordinal_position)
         from information_schema.columns column_metadata
         where column_metadata.table_schema = 'public'
           and column_metadata.table_name in (
             'mes_work_order_operation_runtime_view',
             'mes_work_order_component_runtime_view',
             'mes_production_transaction_runtime_view',
             'mes_material_transaction_runtime_view'
           )) as runtime_view_columns
    `);

    const installed = rows[0];
    assert.equal(installed.commands.length, 5);
    assert.equal(installed.views.length, 5);
    assert.equal(installed.pages.length, 4);
    assert.ok(installed.pages.every((page) => page.status === 'published'));
    assert.equal(installed.routes.length, 5);
    const productionRoot = installed.routes.find((route) => route.code === 'production-root');
    assert.equal(productionRoot?.parent_code, 'business-root');
    assert.equal(productionRoot?.navigation, 'sidebar');
    assert.equal(installed.reversal_indexes.length, 2);
    assert.equal(installed.transaction_columns.length, 3);
    assert.equal(installed.operation_actions, 5);
    assert.equal(
      installed.action_guards.reduce((total, page) => total + page.guarded_actions, 0),
      11
    );
    assert.ok(installed.action_guards.every((page) => page.status === 'published'));
    for (const tableName of [
      'mes_work_order_component_runtime_view',
      'mes_production_transaction_runtime_view',
      'mes_material_transaction_runtime_view'
    ]) {
      const columns = installed.runtime_view_columns.filter(
        (column) => column.table_name === tableName
      );
      assert.equal(columns.at(-1)?.column_name, 'work_order_status');
    }

    console.log(JSON.stringify({
      commands: installed.commands,
      pages: installed.pages,
      routes: installed.routes,
      views: installed.views,
      reversal_indexes: installed.reversal_indexes,
      transaction_columns: installed.transaction_columns,
      action_guards: installed.action_guards,
      operation_actions: installed.operation_actions,
      runtime_view_column_contract: true
    }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
