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
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260811170000_mes_core.sql'
);

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
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      tables: string;
      command_functions: string;
      permissions: string;
      immutable_triggers: string;
    }>(`
      select
        (select count(*)::text from pg_catalog.pg_tables
          where schemaname = 'public' and tablename like 'mes\\_%' escape '\\') as tables,
        (select count(*)::text from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public' and procedure.proname in (
            'mes_release_work_order', 'mes_start_operation', 'mes_report_production',
            'mes_issue_material', 'mes_complete_operation'
          )) as command_functions,
        (select count(*)::text from public.admin_permissions
          where code in ('mes.execution.view', 'mes.execution.manage')) as permissions,
        (select count(*)::text from pg_catalog.pg_trigger
          where not tgisinternal and tgname in (
            'mes_production_transaction_immutable', 'mes_material_transaction_immutable'
          )) as immutable_triggers
    `);
    const installed = rows[0];
    if (
      installed?.tables !== '8'
      || installed.command_functions !== '5'
      || installed.permissions !== '2'
      || installed.immutable_triggers !== '2'
    ) {
      throw new Error(`MES core verification failed: ${JSON.stringify(installed)}`);
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
