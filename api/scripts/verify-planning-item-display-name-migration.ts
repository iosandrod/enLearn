import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { unwrapMigrationTransaction } from './planning-migration-transaction';

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
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const migration = unwrapMigrationTransaction(await readFile(planningMigrationPath, 'utf8'));
  const mesMigration = unwrapMigrationTransaction(await readFile(mesMigrationPath, 'utf8'));
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    await client.query(migration);
    await client.query(migration);
    const account = await client.query<{ id: string }>(`
      select id from basejump.accounts order by created_at, id limit 1
    `);
    assert.ok(account.rows[0]?.id, 'Display-name verification requires one account.');
    await client.query('savepoint missing_display_name');
    await assert.rejects(
      client.query(`
        insert into public.planning_item (account_id, name)
        values ($1, $2)
      `, [account.rows[0].id, `DISPLAY-NAME-REQUIRED-${Date.now()}`]),
      /display_name.*null value|not-null constraint/i
    );
    await client.query('rollback to savepoint missing_display_name');
    await client.query('release savepoint missing_display_name');
    const mesShape = await client.query<{ installed: boolean }>(`
      select bool_and(to_regclass('public.' || table_name) is not null) as installed
      from unnest(array[
        'mes_work_order',
        'mes_work_order_operation',
        'mes_work_order_component',
        'mes_material_transaction'
      ]) table_name
    `);
    const mesMigrationVerified = mesShape.rows[0]?.installed === true;
    if (mesMigrationVerified) {
      await client.query(mesMigration);
      await client.query(mesMigration);
    }
    const { rows } = await client.query<{
      display_name_default: string | null;
      display_name_required: boolean;
      empty_names: number;
      registry_hash_synced: boolean;
      required_count: number;
    }>(`
      select
        (select column_default
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'planning_item'
           and column_name = 'display_name') as display_name_default,
        (select is_nullable = 'NO'
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'planning_item'
           and column_name = 'display_name') as display_name_required,
        (select count(*)::integer
         from public.planning_item
         where nullif(btrim(display_name), '') is null) as empty_names,
        (select config->>'config_hash' = config_hash
         from public.dynamic_crud_resource_registry
         where resource_name = 'planning_item') as registry_hash_synced,
        (select count(*)::integer
         from jsonb_array_elements_text((
           select config#>'{resources,planning_item,create,required_fields}'
           from public.dynamic_crud_resource_registry
           where resource_name = 'planning_item'
         )) value
         where value = 'display_name') as required_count
    `);
    assert.deepEqual(rows[0], {
      display_name_default: null,
      display_name_required: true,
      empty_names: 0,
      registry_hash_synced: true,
      required_count: 1
    });
    await client.query('rollback');
    console.log(JSON.stringify({
      ...rows[0],
      mesMigrationVerified,
      missingDisplayNameRejected: true,
      reruns: 2,
      transaction: 'verified rollback'
    }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
