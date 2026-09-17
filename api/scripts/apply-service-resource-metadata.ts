import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const connectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
if (!connectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260916190000_service_resource_metadata.sql'
);

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(connectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);
  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{ service_name: string; resource_count: number }>(`
      select service_name, count(*)::integer as resource_count
      from public.service_resource_metadata
      where enabled = true
      group by service_name
      order by service_name
    `);
    assert.equal(rows.reduce((sum, row) => sum + row.resource_count, 0), 101);
    console.log(JSON.stringify({ applied: true, services: rows }, null, 2));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
