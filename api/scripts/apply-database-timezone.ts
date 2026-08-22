import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const MIGRATION_FILE = 'supabase/migrations/20260822120000_set_database_timezone_asia_shanghai.sql';

function directProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  const match = url.username.match(/^postgres\.([a-z0-9]+)$/i);
  if (match && url.hostname.includes('.pooler.supabase.com')) {
    url.hostname = `db.${match[1]}.supabase.co`;
    url.port = '5432';
    url.username = 'postgres';
  }
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const env = getEnv();
  const rawConnectionString =
    process.env.DIRECT_URL?.trim() ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString?.trim()) {
    throw new Error('DIRECT_URL or DATABASE_URL is required.');
  }

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(resolve(repoRoot, MIGRATION_FILE), 'utf8');
  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query('begin');
    await client.query(migration);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }

  const verificationClient = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  verificationClient.on('error', () => undefined);
  await verificationClient.connect();
  try {
    const result = await verificationClient.query<{
      timezone: string;
      postgres_timezone: string | null;
      authenticator_timezone: string | null;
      sample_utc: string | null;
      sample_shanghai: string | null;
    }>(`
      select
        current_setting('TimeZone') as timezone,
        (select rolconfig[array_position(rolconfig, 'TimeZone=Asia/Shanghai')]
           from pg_roles where rolname = 'postgres') as postgres_timezone,
        (select rolconfig[array_position(rolconfig, 'TimeZone=Asia/Shanghai')]
           from pg_roles where rolname = 'authenticator') as authenticator_timezone,
        (select to_char(startdate at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SSOF')
           from public.planning_operationplan
          where id = '83986705-e24a-4e90-b240-0b0da99005f2') as sample_utc,
        (select to_char(startdate, 'YYYY-MM-DD HH24:MI:SSOF')
           from public.planning_operationplan
          where id = '83986705-e24a-4e90-b240-0b0da99005f2') as sample_shanghai
    `);
    console.log(JSON.stringify({ applied: true, ...result.rows[0] }));
  } finally {
    await verificationClient.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
