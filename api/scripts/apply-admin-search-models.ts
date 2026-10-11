import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DIRECT_URL ?? env.DATABASE_URL;
if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(repoRoot, 'supabase/migrations/20261012130000_admin_search_models.sql');

async function main() {
  const url = new URL(normalizePostgresConnectionString(rawConnectionString));
  const usesLocalDatabase = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: usesLocalDatabase ? false : { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const result = await client.query<{
      table_exists: boolean;
      active_index_exists: boolean;
      foreign_key_exists: boolean;
      required_columns: number;
      rls_enabled: boolean;
      resource_configured: boolean;
      function_exists: boolean;
      action_configured: boolean;
    }>(`
      select
        to_regclass('public.admin_search_models') is not null as table_exists,
        to_regclass('public.admin_search_models_one_active_idx') is not null as active_index_exists,
        exists (
          select 1 from pg_constraint
          where conrelid = 'public.admin_search_models'::regclass
            and confrelid = 'public.lowcode_pages'::regclass
            and contype = 'f'
        ) as foreign_key_exists,
        (
          select count(*)::int from information_schema.columns
          where table_schema = 'public' and table_name = 'admin_search_models'
            and column_name in ('user_id', 'page_code', 'query_values', 'active')
        ) as required_columns,
        coalesce((
          select relrowsecurity from pg_class where oid = 'public.admin_search_models'::regclass
        ), false) as rls_enabled,
        exists (
          select 1 from public.service_resource_metadata
          where service_name = 'lowcode' and resource_name = 'admin_search_models' and enabled
        ) as resource_configured,
        to_regprocedure('public.save_admin_search_model(text,jsonb,uuid,text)') is not null
          as function_exists,
        exists (
          select 1 from public.lowcode_node_actions
          where node_type = 'grid' and action_code = 'loadData'
            and position('searchModel.save' in source_code) > 0
        ) as action_configured
    `);
    const verification = result.rows[0];
    if (
      !verification?.table_exists
      || !verification.active_index_exists
      || !verification.foreign_key_exists
      || verification.required_columns !== 4
      || !verification.rls_enabled
      || !verification.resource_configured
      || !verification.function_exists
      || !verification.action_configured
    ) {
      throw new Error(`Admin search model verification failed: ${JSON.stringify(verification)}`);
    }
    console.log('Applied and verified admin search models.');
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
