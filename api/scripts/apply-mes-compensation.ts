import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260811180000_mes_compensation_commands.sql'),
  resolve(repoRoot, 'supabase/migrations/20260811190000_mes_lowcode_pages.sql')
];

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
    for (const migrationPath of migrationPaths) {
      await client.query(await readFile(migrationPath, 'utf8'));
    }
    const { rows } = await client.query<{
      command_functions: string;
      pages: string;
      production_root_parented: string;
      routes: string;
      runtime_views: string;
      reversal_indexes: string;
    }>(`
      select
        (select count(*)::text
         from pg_catalog.pg_proc procedure
         join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
         where namespace.nspname = 'public'
           and procedure.proname in (
             'mes_pause_operation', 'mes_resume_operation', 'mes_return_material',
             'mes_reverse_production', 'mes_reverse_material'
           )) as command_functions,
        (select count(*)::text from public.lowcode_pages
         where code in (
           'mes_release_console', 'mes_execution_console',
           'mes_production_ledger', 'mes_material_ledger'
         )) as pages,
        (select count(*)::text from public.admin_routes
         where code in (
           'production-root', 'production-release', 'production-execution',
           'production-ledger', 'production-material-ledger'
         )) as routes,
        (select count(*)::text
         from public.admin_routes production_root
         join public.admin_routes business_root on business_root.id = production_root.parent_id
         where production_root.code = 'production-root'
           and business_root.code = 'business-root'
           and production_root.metadata->>'navigation' = 'sidebar')
          as production_root_parented,
        (select count(*)::text from pg_catalog.pg_views
         where schemaname = 'public' and viewname in (
           'mes_work_order_runtime_view', 'mes_work_order_operation_runtime_view',
           'mes_work_order_component_runtime_view',
           'mes_production_transaction_runtime_view',
           'mes_material_transaction_runtime_view'
         )) as runtime_views,
        (select count(*)::text from pg_catalog.pg_indexes
         where schemaname = 'public' and indexname in (
           'uq_mes_production_single_reversal', 'uq_mes_material_single_reversal'
         )) as reversal_indexes
    `);
    const installed = rows[0];
    if (
      installed?.command_functions !== '5'
      || installed.pages !== '4'
      || installed.routes !== '5'
      || installed.production_root_parented !== '1'
      || installed.runtime_views !== '5'
      || installed.reversal_indexes !== '2'
    ) {
      throw new Error(`MES compensation verification failed: ${JSON.stringify(installed)}`);
    }
    console.log(JSON.stringify({ ...installed, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
