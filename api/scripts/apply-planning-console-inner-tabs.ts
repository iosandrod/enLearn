import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_CONSOLE_INNER_TABS_MIGRATION_FILE } from './generate-planning-console-inner-tabs-migration';

async function main() {
  const env = getEnv();
  const rawConnectionString = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!rawConnectionString) throw new Error('DATABASE_URL or DIRECT_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = await readFile(
    resolve(repoRoot, PLANNING_CONSOLE_INNER_TABS_MIGRATION_FILE),
    'utf8'
  );
  const client = new Client({
    connectionString: normalizePostgresConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query(migration);
    const result = await client.query<{ issues_tabs: boolean }>(`
      select exists (
        select 1
        from public.lowcode_pages page
        cross join lateral jsonb_path_query(
          page.schema,
          '$.** ? (@.id == "planning_console_issues_tabs")'
        ) as block
        where page.code = 'planning_console'
      ) as issues_tabs
    `);
    if (result.rows[0]?.issues_tabs !== true) {
      throw new Error('Planning console issues inner tabs were not installed.');
    }
    console.log(JSON.stringify({ issues_tabs: true, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
