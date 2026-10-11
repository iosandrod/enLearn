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
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20261012120000_grid_search_query_logic.sql',
);

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
    const result = await client.query<{ configured: boolean }>(`
      select
        position('function buildSearchFilters(values, queryLogic)' in source_code) > 0
        and position('function searchFormTargetsSource(candidate, sourceKey, blocks, dataSources)' in source_code) > 0
        as configured
      from public.lowcode_node_actions
      where node_type = 'grid' and action_code = 'loadData'
    `);
    if (result.rows[0]?.configured !== true) {
      throw new Error('grid.loadData query logic update was not stored.');
    }
    console.log('Applied and verified grid search query logic.');
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
