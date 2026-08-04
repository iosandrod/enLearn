import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  getEnv,
  normalizePostgresConnectionString
} from '../src/common/utils/env';

const migrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260804090000_account_set_login.sql'
);
const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}
const connectionString = normalizePostgresConnectionString(rawConnectionString);

async function main() {
  const sql = await readFile(migrationPath, 'utf8');
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    await client.query(sql);
    await client.query('commit');
    console.log('Account-set migration applied.');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
