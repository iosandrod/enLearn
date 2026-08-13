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
const planningMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260813090000_planning_item_display_name.sql'
);
const mesMigrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260813091000_mes_item_display_name.sql'
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
    await client.query(await readFile(planningMigrationPath, 'utf8'));

    const mesShape = await client.query<{ installed: boolean }>(`
      select bool_and(to_regclass('public.' || table_name) is not null) as installed
      from unnest(array[
        'mes_work_order',
        'mes_work_order_operation',
        'mes_work_order_component',
        'mes_material_transaction'
      ]) table_name
    `);
    const mesMigrationApplied = mesShape.rows[0]?.installed === true;
    if (mesMigrationApplied) {
      await client.query(await readFile(mesMigrationPath, 'utf8'));
    }

    const { rows } = await client.query<{
      display_name_required: boolean;
      empty_names: number;
      edit_field: unknown;
      list_column: unknown;
      registry_required: boolean;
      registry_hash_synced: boolean;
    }>(`
      select
        (select is_nullable = 'NO'
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'planning_item'
           and column_name = 'display_name') as display_name_required,
        (select count(*)::integer
         from public.planning_item
         where nullif(btrim(display_name), '') is null) as empty_names,
        (select field_item
         from public.lowcode_pages page
         cross join lateral jsonb_path_query(
           page.schema,
           '$.**.fields[*] ? (@.field == "display_name")'
         ) field_item
         where page.code = 'planning_item-edit'
         limit 1) as edit_field,
        (select column_item
         from public.lowcode_pages page
         cross join lateral jsonb_path_query(
           page.schema,
           '$.**.columns[*] ? (@.field == "display_name")'
         ) column_item
         where page.code = 'planning_item-list'
         limit 1) as list_column,
        (select config#>'{resources,planning_item,create,required_fields}'
          @> '["display_name"]'::jsonb
         from public.dynamic_crud_resource_registry
         where resource_name = 'planning_item') as registry_required,
        (select config->>'config_hash' = config_hash
         from public.dynamic_crud_resource_registry
         where resource_name = 'planning_item') as registry_hash_synced
    `);
    const installed = rows[0];
    if (
      installed?.display_name_required !== true ||
      installed.empty_names !== 0 ||
      !installed.edit_field ||
      !installed.list_column ||
      installed.registry_required !== true ||
      installed.registry_hash_synced !== true
    ) {
      throw new Error(`Planning item display-name verification failed: ${JSON.stringify(installed)}`);
    }
    console.log(JSON.stringify({ ...installed, applied: true, mesMigrationApplied }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
