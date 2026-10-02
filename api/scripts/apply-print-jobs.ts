import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION = 'supabase/migrations/20261002130000_print_jobs.sql';

async function main() {
  const env = getEnv();
  const connectionString = env.DIRECT_URL?.trim() || env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const url = new URL(normalizePostgresConnectionString(connectionString));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');

  const client = new Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  try {
    await client.connect();
    await client.query(await readFile(resolve(repoRoot, MIGRATION), 'utf8'));
    const { rows } = await client.query<{ jobs: string | null; artifacts: string | null; items: string | null }>(
      "select to_regclass('public.print_jobs')::text as jobs, " +
      "to_regclass('public.print_artifacts')::text as artifacts, " +
      "to_regclass('public.print_job_items')::text as items"
    );
    if (!rows[0]?.jobs || !rows[0]?.artifacts || !rows[0]?.items) {
      throw new Error('Print job migration verification failed.');
    }
    console.log(JSON.stringify({ applied: true, migration: MIGRATION }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
