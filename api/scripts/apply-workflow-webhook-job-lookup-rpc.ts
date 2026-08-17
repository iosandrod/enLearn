import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionStrings = [...new Set(
  [process.env.DIRECT_URL, env.DIRECT_URL, process.env.DATABASE_URL, env.DATABASE_URL]
    .filter((value): value is string => Boolean(value?.trim()))
)];

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const migrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260816100000_workflow_webhook_job_lookup_rpc.sql'
);

function normalizeConnection(value: string) {
  const normalized = normalizePostgresConnectionString(value);
  try {
    const url = new URL(normalized);
    url.searchParams.delete('pgbouncer');
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalized;
  }
}

async function applyMigration(connectionString: string, sql: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function verify(connectionString: string) {
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    const result = await client.query<{
      procedure: string | null;
      matched: Record<string, unknown> | null;
    }>(
      `
        select
          to_regprocedure('public.find_workflow_webhook_job(uuid,text,text)') as procedure,
          public.find_workflow_webhook_job($1::uuid, $2::text, $3::text) as matched
      `,
      [
        process.env.WORKFLOW_WEBHOOK_VERIFY_ACCOUNT_ID
          ?? '00000000-0000-4000-8000-000000000001',
        process.env.WORKFLOW_WEBHOOK_VERIFY_SERVICE_NAME ?? 'admin',
        process.env.WORKFLOW_WEBHOOK_VERIFY_SERVICE_METHOD ?? 'listItem1'
      ]
    );
    return result.rows[0];
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  const sql = await readFile(migrationPath, 'utf8');
  let lastError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    const connectionString = normalizeConnection(rawConnectionString);
    try {
      await applyMigration(connectionString, sql);
      const result = await verify(connectionString);
      console.log(JSON.stringify({
        migration: migrationPath,
        procedure: result?.procedure ?? null,
        matched: result?.matched ?? null
      }, null, 2));
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
