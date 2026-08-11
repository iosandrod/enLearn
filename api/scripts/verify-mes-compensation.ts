import assert from 'node:assert/strict';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
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
           )) as transaction_columns
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

    console.log(JSON.stringify(installed));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
