import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const migrationFile = 'supabase/migrations/20260727213000_trigger_workflow_designer_route.sql';

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

function readDotEnv(filePath: string) {
  if (!existsSync(filePath)) return {};

  const env: Record<string, string> = {};
  const text = readFileSync(filePath, 'utf8');

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
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

async function main() {
  const repoRoot = getRepoRoot();
  const env = readDotEnv(resolve(repoRoot, '.env'));
  const connectionString =
    process.argv[2] ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    env.DIRECT_URL ??
    env.DATABASE_URL;

  if (!connectionString) {
    console.error('Missing DIRECT_URL or DATABASE_URL.');
    console.error('Add it to .env or pass a connection string as the first argument.');
    process.exit(1);
  }

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
    const sql = readFileSync(resolve(repoRoot, migrationFile), 'utf8');

    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

    const { rows } = await client.query(
      `
        select
          route.code,
          route.title,
          route.path,
          route.permission_code,
          route.visible,
          route.status,
          route.sort_order,
          parent.code as parent_code,
          parent.title as parent_title
        from public.admin_routes route
        left join public.admin_routes parent on parent.id = route.parent_id
        where route.code = $1
      `,
      ['trigger-workflow-designer']
    );

    console.log('Trigger workflow designer route is ready.');
    console.log(JSON.stringify(rows[0] ?? null, null, 2));
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error('Failed to apply Trigger workflow designer route.');
  if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(error);
  }
  process.exit(1);
});
