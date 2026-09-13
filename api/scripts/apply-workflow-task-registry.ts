import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const source = env.WORKFLOW_MIGRATION_DATABASE_URL
  ?? env.DIRECT_URL
  ?? env.DATABASE_URL;

if (!source) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();

const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260911010000_workflow_task_registry.sql'
);
const optionSourceMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260911011000_workflow_backend_command_option_source.sql'
);
const retireLegacyMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912010000_retire_workflow_command_registry.sql'
);
const taskRegistryMenuMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912020000_workflow_task_registry_menu.sql'
);
const taskRegistryEditFormMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912030000_workflow_task_registry_edit_form.sql'
);
const taskRegistryRlsMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912030000_workflow_task_registry_rls.sql'
);
const taskRegistryFormRefinementMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912031000_workflow_task_registry_form_refinement.sql'
);
const taskRegistryMoveFormMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912032000_workflow_task_registry_move_form_to_edit_page.sql'
);
const taskRegistrySaveServiceMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260912034000_workflow_task_registry_save_service.sql'
);

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(source),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  client.on('error', () => undefined);
  try {
    await client.connect();
    for (const migrationPathToApply of [
      migrationPath,
      optionSourceMigrationPath,
      retireLegacyMigrationPath,
      taskRegistryMenuMigrationPath,
      taskRegistryEditFormMigrationPath,
      taskRegistryRlsMigrationPath,
      taskRegistryFormRefinementMigrationPath,
      taskRegistryMoveFormMigrationPath,
      taskRegistrySaveServiceMigrationPath
    ]) {
      console.log(`Applying ${migrationPathToApply}`);
      await client.query(await readFile(migrationPathToApply, 'utf8'));
    }
    const { rows } = await client.query<{
      row_count: string;
      enabled_backend_command_count: string;
      option_source_count: string;
      view_exists: boolean;
      legacy_table_exists: boolean;
    }>(
      `select
        (select count(*)::text from public.wf_task_registry) as row_count,
        (select count(*)::text from public.workflow_backend_command_options) as enabled_backend_command_count,
        (select count(*)::text from public.system_option_sources where code = 'workflow_backend_command') as option_source_count,
        to_regclass('public.workflow_backend_command_options') is not null as view_exists,
        to_regclass('public.wf_command_registry') is not null as legacy_table_exists`
    );
    console.log(JSON.stringify({
      migration: '20260911010000_workflow_task_registry',
      table: 'public.wf_task_registry',
      rowCount: rows[0]?.row_count ?? '0',
      enabledBackendCommandCount: rows[0]?.enabled_backend_command_count ?? '0',
      optionSourceCount: rows[0]?.option_source_count ?? '0',
      viewExists: rows[0]?.view_exists ?? false,
      legacyTableExists: rows[0]?.legacy_table_exists ?? false
    }, null, 2));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
