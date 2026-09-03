import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const raw = env.DATABASE_URL ?? env.DIRECT_URL;
if (!raw) throw new Error('DATABASE_URL or DIRECT_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase',
  'migrations',
  '20260903100000_fix_planning_operation_container_account_scope.sql'
);

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(raw),
    connectionTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const view = await client.query(`
      select pg_get_viewdef('public.planning_operation_container'::regclass, true) as definition
    `);
    const columns = await client.query(`
      select column_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'planning_operation_container'
      order by ordinal_position
    `);
    const metadata = await client.query(`
      select code, status, definition_sql, metadata
      from public.entity_design_views
      where schema_name = 'public' and view_name = 'planning_operation_container'
    `);
    const optionSources = await client.query(`
      select code, source_type, source_config, status
      from public.system_option_sources
      where source_config::text ilike '%planning_operation_container%'
    `);
    const pages = await client.query(`
      select code, route, schema
      from public.lowcode_pages
      where schema::text ilike '%planning_operation_container%'
    `);
    console.log(JSON.stringify({
      definition: view.rows[0]?.definition,
      columns: columns.rows.map((row) => row.column_name),
      metadata: metadata.rows,
      optionSources: optionSources.rows,
      pages: pages.rows.map((row) => ({ code: row.code, route: row.route }))
    }));
  } finally {
    await client.end();
  }
}

void main();
