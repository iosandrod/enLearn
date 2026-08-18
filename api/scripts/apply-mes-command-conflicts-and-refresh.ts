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
  'supabase/migrations/20260812170000_mes_command_conflicts_and_refresh.sql'
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
      conflict_functions: number;
      stale_conflict_functions: number;
      refresh_directives: number;
      complete_refresh_directives: number;
    }>(`
      with command_functions as (
        select pg_catalog.pg_get_functiondef(procedure.oid) as definition
        from pg_catalog.pg_proc procedure
        join pg_catalog.pg_namespace namespace
          on namespace.oid = procedure.pronamespace
        where namespace.nspname = 'public'
          and procedure.proname in (
            'mes_complete_command', 'mes_start_operation',
            'mes_report_production', 'mes_issue_material',
            'mes_complete_operation', 'mes_pause_operation',
            'mes_resume_operation', 'mes_return_material',
            'mes_reverse_production', 'mes_reverse_material'
          )
      ), refresh_paths as (
        select array(
          select jsonb_array_elements_text(path.value)
        ) as value
        from jsonb_array_elements(
          '[
            ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","0","directives","1"],
            ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","1","directives","0","confirmDirectives","1"],
            ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","2","directives","1"],
            ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","3","directives","0","confirmDirectives","1"],
            ["blocks","3","tabs","0","blocks","0","schema","rowActions","actions","4","directives","1"],
            ["blocks","3","tabs","1","blocks","0","schema","rowActions","actions","0","directives","0","confirmDirectives","1"],
            ["blocks","3","tabs","1","blocks","0","schema","rowActions","actions","1","directives","0","confirmDirectives","1"],
            ["blocks","3","tabs","2","blocks","0","schema","rowActions","actions","0","directives","0","confirmDirectives","1"],
            ["blocks","3","tabs","3","blocks","0","schema","rowActions","actions","0","directives","0","confirmDirectives","1"]
          ]'::jsonb
        ) path
      ), refresh_directives as (
        select jsonb_extract_path(page.schema, variadic path.value) as directive
        from public.lowcode_pages page
        cross join refresh_paths path
        where page.code = 'mes_execution_console'
      )
      select
        (select count(*)::integer from command_functions
         where definition like '%errcode = ''PT409''%') as conflict_functions,
        (select count(*)::integer from command_functions
         where definition like '%errcode = ''40001''%') as stale_conflict_functions,
        (select count(*)::integer from refresh_directives) as refresh_directives,
        (select count(*)::integer from refresh_directives
         where directive->'sourceKeys' =
           '["workOrders","operations","components","productionTransactions","materialTransactions"]'::jsonb)
          as complete_refresh_directives
    `);
    const verification = rows[0];
    if (
      verification?.conflict_functions !== 10
      || verification.stale_conflict_functions !== 0
      || verification.refresh_directives !== 9
      || verification.complete_refresh_directives !== 9
    ) {
      throw new Error(`MES conflict migration verification failed: ${JSON.stringify(verification)}`);
    }
    console.log(JSON.stringify({ ...verification, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
