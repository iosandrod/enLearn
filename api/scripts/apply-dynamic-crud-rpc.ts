import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  getEnv,
  normalizePostgresConnectionString
} from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.'
);
const migrationPaths = [
  '20260806120000_dynamic_crud_rpc.sql',
  '20260813120000_dynamic_crud_incremental_details.sql',
  '20260827130000_dynamic_crud_detail_update_foreign_key.sql',
  '20260901113000_dynamic_crud_normalize_empty_typed_values.sql',
  '20260906210000_normalize_uuid_empty_strings.sql'
].map((name) => resolve(repoRoot, 'supabase', 'migrations', name));

function directProjectConnectionString(value: string) {
  try {
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
  } catch {
    return normalizePostgresConnectionString(value);
  }
}

function poolerConnectionString(value: string) {
  const normalized = normalizePostgresConnectionString(value);
  try {
    const url = new URL(normalized);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalized;
  }
}

function sessionPoolerConnectionString(value: string) {
  const normalized = normalizePostgresConnectionString(value);
  try {
    const url = new URL(normalized);
    if (url.hostname.includes('.pooler.supabase.com')) url.port = '5432';
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    url.searchParams.delete('pgbouncer');
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
    keepAliveInitialDelayMillis: 5_000,
    ssl: { rejectUnauthorized: false }
  });

  // pg may emit a socket error between connect/query boundaries. Attaching a
  // listener keeps transient network failures rejectable and eligible for retry.
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

async function main() {
  const sql = (await Promise.all(
    migrationPaths.map((migrationPath) => readFile(migrationPath, 'utf8'))
  )).join('\n\n');
  const connections = [
    directProjectConnectionString(rawConnectionString),
    sessionPoolerConnectionString(rawConnectionString),
    poolerConnectionString(rawConnectionString)
  ].filter((value, index, values) => values.indexOf(value) === index);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    for (const connectionString of connections) {
      try {
        await applyMigration(connectionString, sql);
        console.log('Dynamic CRUD RPC migration applied.');
        return;
      } catch (error) {
        lastError = error;
        const code = (error as NodeJS.ErrnoException | undefined)?.code;
        if (!['ECONNRESET', 'ETIMEDOUT', 'EPIPE', '57P01', '57P02', '57P03'].includes(code ?? '')) {
          throw error;
        }
      }
    }
    if (attempt < 5) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1_000));
    }
  }

  throw lastError;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
