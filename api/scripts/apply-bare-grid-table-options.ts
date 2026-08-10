import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260810135000_bare_grid_table_options.sql';

async function main() {
  const env = getEnv();
  const rawConnectionString = env.DIRECT_URL ?? process.env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(migration);
    const result = await client.query<{
      option_count: number;
      prefixed_option_count: number;
    }>(`
      select count(*)::integer as option_count,
             count(*) filter (
               where value like 'public.%' or label like 'public.%'
             )::integer as prefixed_option_count
      from public.system_physical_table_options
    `);
    const installed = result.rows[0];
    if (!installed || installed.option_count < 1 || installed.prefixed_option_count !== 0) {
      throw new Error(`Bare table options were not installed: ${JSON.stringify(installed)}.`);
    }
    console.log(JSON.stringify({ ...installed, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
