import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL
  ?? env.DIRECT_URL
  ?? process.env.DATABASE_URL
  ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260831140000_lowcode_page_runtime.sql'),
  resolve(repoRoot, 'supabase/migrations/20260831150000_lowcode_page_runtime_schema_functions.sql'),
  resolve(repoRoot, 'supabase/migrations/20260831160000_lowcode_page_runtime_remote_effects.sql'),
  resolve(repoRoot, 'supabase/migrations/20260901090000_restore_sales_order_print_designer_button.sql'),
  resolve(repoRoot, 'supabase/migrations/20260903090000_planning_flow_node_action.sql'),
];
const MAX_MIGRATION_ATTEMPTS = 3;

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function unwrapMigration(sql: string) {
  return sql
    .replace(/^\uFEFF?\s*begin;\s*/i, '')
    .replace(/\s*commit;\s*$/i, '');
}

async function applyMigrations(migrations: string[]) {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    application_name: 'lowcode-page-runtime-migration',
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);

  let stage = 'connect';
  try {
    await client.connect();
    stage = 'begin transaction';
    await client.query('begin');
    const { rows: lockRows } = await client.query<{ acquired: boolean }>(
      `select pg_try_advisory_xact_lock(hashtext('lowcode-page-runtime')) as acquired`,
    );
    if (!lockRows[0]?.acquired) {
      throw new Error('Another low-code page runtime migration currently holds the database lock.');
    }
    await client.query(`set local lock_timeout = '10s'`);
    await client.query(`set local statement_timeout = '60s'`);

    const { rows: tableRows } = await client.query<{ table_name: string | null }>(
      `select to_regclass('public.lowcode_page_runtime')::text as table_name`,
    );
    const initialized = tableRows[0]?.table_name
      ? ((await client.query<{ count: number }>(
          `select count(*)::int as count from public.lowcode_page_runtime where is_system`,
        )).rows[0]?.count ?? 0) >= 140
      : false;
    const pendingMigrations = initialized ? migrations.slice(1) : migrations;
    for (const [index, migration] of pendingMigrations.entries()) {
      const pathIndex = migrations.length - pendingMigrations.length + index;
      stage = `execute migration ${basename(migrationPaths[pathIndex])}`;
      await client.query(migration);
    }

    stage = 'verify migration';
    const { rows } = await client.query<{
      database_name: string;
      total_count: number;
      page_function_count: number;
      button_rule_count: number;
      directive_count: number;
      integration_count: number;
      capability_count: number;
      schema_function_count: number;
      remote_system_page_function_count: number;
      native_system_page_function_count: number;
      configured_directive_count: number;
      remote_effect_capability_count: number;
      invalid_script_count: number;
      node_action_count: number;
      invalid_node_action_count: number;
      published_count: number;
    }>(`
      select
        current_database() as database_name,
        (select count(*)::int from public.lowcode_page_runtime) as total_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'page_function' and is_system) as page_function_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'button_rule' and is_system) as button_rule_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'directive' and is_system) as directive_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'integration' and is_system) as integration_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'capability' and is_system) as capability_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'page_function' and not is_system) as schema_function_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'page_function' and is_system and execution_mode = 'script') as remote_system_page_function_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'page_function' and is_system and execution_mode = 'native') as native_system_page_function_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'directive' and is_system and nullif(runtime_spec->>'handler', '') is not null) as configured_directive_count,
        (select count(*)::int from public.lowcode_page_runtime where function_type = 'capability' and is_system and runtime_key like 'system:capability:%' and function_name in ('form.prepare','form.submit','message.show','page.exit','page.navigateToEdit','page.print','page.setMode','records.delete','records.update','service.invoke')) as remote_effect_capability_count,
        (select count(*)::int from public.lowcode_page_runtime where execution_mode = 'script' and length(btrim(source_code)) = 0) as invalid_script_count,
        (select count(*)::int from public.lowcode_node_actions where enabled and is_system) as node_action_count,
        (select count(*)::int from public.lowcode_node_actions where enabled and is_system and length(btrim(source_code)) = 0) as invalid_node_action_count,
        (select count(*)::int from public.lowcode_page_runtime where status = 'published' and enabled) as published_count
    `);
    const result = rows[0];
    if (
      !result ||
      result.page_function_count !== 21 ||
      result.button_rule_count !== 52 ||
      result.directive_count !== 32 ||
      result.integration_count !== 14 ||
      result.capability_count !== 31 ||
      result.remote_system_page_function_count !== 20 ||
      result.native_system_page_function_count !== 1 ||
      result.configured_directive_count !== 32 ||
      result.remote_effect_capability_count !== 10 ||
      result.invalid_script_count !== 0 ||
      result.node_action_count !== 20 ||
      result.invalid_node_action_count !== 0 ||
      result.total_count < 150 ||
      result.published_count < 150
    ) {
      throw new Error(`Low-code page runtime verification failed: ${JSON.stringify(result)}`);
    }

    stage = 'commit transaction';
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`);
  } finally {
    await client.end();
  }
}

function isTransientConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNRESET|ETIMEDOUT|EPIPE|Connection terminated|timeout expired/i.test(message);
}

async function main() {
  const migrations = await Promise.all(
    migrationPaths.map(async (path) => unwrapMigration(await readFile(path, 'utf8'))),
  );
  for (let attempt = 1; attempt <= MAX_MIGRATION_ATTEMPTS; attempt += 1) {
    try {
      console.log(JSON.stringify(await applyMigrations(migrations)));
      return;
    } catch (error) {
      if (attempt === MAX_MIGRATION_ATTEMPTS || !isTransientConnectionError(error)) throw error;
      console.warn(`Migration connection interrupted; retrying (${attempt}/${MAX_MIGRATION_ATTEMPTS}).`);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 750));
    }
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
