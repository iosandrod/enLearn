import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString =
  process.env.DIRECT_URL ?? env.DIRECT_URL ?? process.env.DATABASE_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260829103000_detail_grid_load_data_relation_filters.sql',
);

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const result = await client.query<{ configured: boolean }>(
      "select position('function readDetailRelation(block)' in source_code) > 0 and position('config.enabled === false' in source_code) = 0 as configured from public.lowcode_node_actions where node_type = 'grid' and action_code = 'loadData'",
    );
    if (result.rows[0]?.configured !== true) {
      throw new Error('Grid loadData relation filter was not stored.');
    }
    console.log('Applied and verified detail-grid loadData relation filters.');
  } finally {
    await client.end();
  }
}

void main();
