import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  'supabase/migrations/20260826220000_database_node_actions.sql',
  'supabase/migrations/20260903090000_planning_flow_node_action.sql',
].map((file) => resolve(repoRoot, file));

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

async function main() {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
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
    await client.query(`select pg_advisory_xact_lock(hashtext('database-node-actions'))`);
    await client.query(`set local lock_timeout = '10s'`);
    await client.query(`set local statement_timeout = '60s'`);

    stage = 'execute migration';
    const { rows: actionTableRows } = await client.query<{ exists: boolean }>(`
      select exists (
        select 1
        from information_schema.tables
        where table_schema = 'public' and table_name = 'lowcode_node_actions'
      ) as exists
    `);
    let hasPlanningFlowAction = false;
    if (actionTableRows[0]?.exists) {
      const { rows } = await client.query<{ exists: boolean }>(`
        select exists (
          select 1
          from public.lowcode_node_actions
          where node_type = 'planningFlow' and action_code = 'loadData'
        ) as exists
      `);
      hasPlanningFlowAction = rows[0]?.exists === true;
    }
    const migrationsToApply = hasPlanningFlowAction
      ? migrationPaths.slice(1)
      : migrationPaths;
    for (const migrationPath of migrationsToApply) {
      const migration = unwrapMigration(await readFile(migrationPath, 'utf8'));
      await client.query(migration);
    }

    stage = 'verify migration';
    const { rows } = await client.query<{
      database_name: string;
      action_count: number;
      node_type_count: number;
      page_scoped_column_count: number;
      legacy_option_source_count: number;
    }>(`
      select
        current_database() as database_name,
        (
          select count(*)::int
          from public.lowcode_node_actions
          where enabled and is_system
        ) as action_count,
        (
          select count(distinct node_type)::int
          from public.lowcode_node_actions
          where enabled and is_system
        ) as node_type_count,
        (
          select count(*)::int
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'lowcode_node_actions'
            and column_name in ('page_id', 'version')
        ) as page_scoped_column_count,
        (
          select count(*)::int
          from public.system_option_sources
          where code in (
            'lowcode_node_action_method',
            'lowcode_node_action_form_method',
            'lowcode_node_action_search_form_method',
            'lowcode_node_action_grid_method',
            'lowcode_node_action_modal_method',
            'lowcode_node_action_drawer_method'
          )
        ) as legacy_option_source_count
    `);
    const result = rows[0];
    if (
      !result
      || result.action_count !== 20
      || result.node_type_count !== 6
      || result.page_scoped_column_count !== 0
      || result.legacy_option_source_count !== 0
    ) {
      throw new Error(`Database node action verification failed: ${JSON.stringify(result)}`);
    }

    stage = 'commit transaction';
    await client.query('commit');
    console.log(JSON.stringify(result));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`);
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
