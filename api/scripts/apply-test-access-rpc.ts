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

const migrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260806220000_test_access_rpc.sql'
);

function connectionCandidates(value: string) {
  const normalized = normalizePostgresConnectionString(value);
  const candidates: string[] = [];
  try {
    const base = new URL(normalized);
    base.searchParams.delete('sslmode');
    base.searchParams.delete('uselibpqcompat');

    candidates.push(base.toString());

    const session = new URL(base);
    if (session.hostname.includes('.pooler.supabase.com')) {
      session.port = '5432';
      session.searchParams.delete('pgbouncer');
      candidates.push(session.toString());
    }
  } catch {
    candidates.push(normalized);
  }
  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index);
}

async function apply(connectionString: string, sql: string) {
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

async function main() {
  const sql = await readFile(migrationPath, 'utf8');
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    for (const connectionString of connectionCandidates(rawConnectionString)) {
      try {
        await apply(connectionString, sql);
        console.log('Smoke-test access RPC migration applied.');
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
