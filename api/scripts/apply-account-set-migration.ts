import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import {
  getEnv,
  normalizePostgresConnectionString
} from '../src/common/utils/env';

const migrationPaths = [
  '20260804090000_account_set_login.sql',
  '20260804160000_remove_personal_accounts.sql'
].map((migration) => resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  migration
));
const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}
const connectionString = normalizePostgresConnectionString(rawConnectionString);

async function main() {
  const migrations = await Promise.all(
    migrationPaths.map(async (path) => ({ path, sql: await readFile(path, 'utf8') }))
  );
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
    for (const migration of migrations) {
      await client.query(migration.sql);
      console.log(`Applied ${migration.path.split(/[\\/]/).at(-1)}.`);
    }
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
