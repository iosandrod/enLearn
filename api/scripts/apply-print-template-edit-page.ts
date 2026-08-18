import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Client } from 'pg';

const migrationFile = 'supabase/migrations/20260803200000_print_template_edit_page.sql';

function getRepoRoot() {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, 'supabase/migrations'))) return cwd;

  const parent = resolve(cwd, '..');
  if (existsSync(resolve(parent, 'supabase/migrations'))) return parent;

  throw new Error('Could not find supabase/migrations from the current directory.');
}

function readDotEnv(filePath: string) {
  if (!existsSync(filePath)) return {};

  const env: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
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

async function main() {
  const repoRoot = getRepoRoot();
  const env = readDotEnv(resolve(repoRoot, '.env'));
  const connectionString =
    process.argv[2] ??
    process.env.DIRECT_URL ??
    process.env.DATABASE_URL ??
    env.DIRECT_URL ??
    env.DATABASE_URL;

  if (!connectionString) throw new Error('Missing DIRECT_URL or DATABASE_URL.');

  const client = new Client({
    connectionString,
    connectionTimeoutMillis: 10_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    try {
      await client.query(readFileSync(resolve(repoRoot, migrationFile), 'utf8'));
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    }

    const { rows } = await client.query(`
      select
        list_page.code as list_code,
        edit_page.code as edit_code,
        edit_page.page_type as edit_page_type
      from public.lowcode_pages as list_page
      left join public.lowcode_pages as edit_page on edit_page.id = list_page.edit_page_id
      where list_page.code = 'print-templates'
    `);
    console.log(JSON.stringify(rows[0] ?? null));
  } finally {
    await client.end().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
