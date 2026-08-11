import assert from 'node:assert/strict';
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
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260808110000_service_request_idempotency.sql'
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
    await client.query(await readFile(migrationPath, 'utf8'));
    const { rows } = await client.query<{
      function_count: number;
      table_name: string | null;
    }>(`
      select
        to_regclass('public.service_request_idempotency')::text as table_name,
        (select count(*)::integer
         from pg_catalog.pg_proc procedure
         join pg_catalog.pg_namespace namespace
           on namespace.oid = procedure.pronamespace
         where namespace.nspname = 'public'
           and procedure.proname in (
             'claim_service_request_idempotency',
             'complete_service_request_idempotency',
             'release_service_request_idempotency'
           )) as function_count
    `);
    assert.equal(rows[0]?.table_name, 'service_request_idempotency');
    assert.equal(rows[0]?.function_count, 3);
    console.log(JSON.stringify({ ...rows[0], applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
