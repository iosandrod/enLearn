import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = env.DIRECT_URL ?? process.env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260809110000_dynamic_grid_association_options.sql'
);

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 30_000
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query(`
      select
        count(*) filter (where code in ('physical_table_name', 'database_view_name'))::integer as source_count,
        (
          select count(*)::integer
          from public.system_option_items
          where source_code in ('physical_table_name', 'database_view_name')
        ) as item_count,
        pg_catalog.to_regclass('public.system_physical_table_options')::text as table_view,
        pg_catalog.to_regclass('public.system_database_view_options')::text as database_view,
        (select count(*)::integer from public.system_physical_table_options) as table_option_count,
        (
          select count(*)::integer
          from public.lowcode_pages page,
          lateral jsonb_array_elements(page.schema#>'{blocks,1,schema,grid,columns}') column_item
          where page.code = 'admin-system-options'
            and column_item->>'field' = 'source_target'
        ) as page_column_count
      from public.system_option_sources
    `);
    const result = rows[0];
    if (
      result?.source_count !== 2 ||
      result?.item_count !== 0 ||
      result?.table_view !== 'system_physical_table_options' ||
      result?.database_view !== 'system_database_view_options' ||
      result?.table_option_count < 1 ||
      result?.page_column_count !== 1
    ) {
      throw new Error(`Dynamic option verification failed: ${JSON.stringify(result)}`);
    }
    await client.query('commit');
    console.log(JSON.stringify(result));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
