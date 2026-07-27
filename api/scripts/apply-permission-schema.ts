import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const connectionString = process.argv[2] ?? process.env.DATABASE_URL;

const migrationFiles = [
  'supabase/migrations/20260722100000_admin_metadata.sql',
  'supabase/migrations/20260726090000_basejump_permissions.sql',
  'supabase/migrations/20260727010000_switch_user_table_to_permission_fields.sql'
];

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'supabase/migrations'))) {
    return cwd;
  }

  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'supabase/migrations'))) {
    return parent;
  }

  throw new Error('Could not find supabase/migrations from the current directory.');
}

function maskConnectionString(value: string) {
  try {
    const url = new URL(value);
    if (url.password) {
      url.password = '****';
    }
    return url.toString();
  } catch {
    return value.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@');
  }
}

async function runMigration(client: Client, repoRoot: string, file: string) {
  const filePath = resolve(repoRoot, file);
  const sql = readFileSync(filePath, 'utf8');

  console.log(`Applying ${file}`);
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('commit');
    console.log(`Applied ${file}`);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function main() {
  if (!connectionString) {
    console.error('Missing database URL.');
    console.error('Usage: pnpm db:apply-permissions "<postgresql://user:password@host:5432/database>"');
    console.error('Or set DATABASE_URL before running this command.');
    process.exit(1);
  }

  const repoRoot = getRepoRoot();
  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: {
      rejectUnauthorized: false
    }
  });

  console.log(`Connecting to ${maskConnectionString(connectionString)}`);
  await client.connect();

  try {
    for (const file of migrationFiles) {
      await runMigration(client, repoRoot, file);
    }
  } finally {
    await client.end().catch(() => undefined);
  }

  console.log('Permission schema is ready.');
}

main().catch((error) => {
  console.error('Failed to apply permission schema.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
