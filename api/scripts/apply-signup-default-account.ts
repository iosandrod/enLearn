import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase/migrations/20260926180000_assign_signup_default_account.sql'
);

async function main() {
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(await readFile(migrationPath, 'utf8'));
    const verificationSql = [
      'select',
      "to_regprocedure('public.assign_signup_default_account(uuid,uuid)') is not null as installed,",
      "has_function_privilege('service_role', 'public.assign_signup_default_account(uuid,uuid)', 'execute') as service_role_can_execute"
    ].join(' ');
    const verification = await client.query<{ installed: boolean; service_role_can_execute: boolean }>(
      verificationSql
    );
    const result = verification.rows[0];
    if (!result?.installed || !result.service_role_can_execute) {
      throw new Error('Signup account RPC verification failed.');
    }
    console.log('Signup default-account RPC applied and verified.');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
