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
  '20260804183000_system_settings_lowcode_page.sql'
);
const systemConfigMigrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260729173000_system_config.sql'
);
const editPageMigrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260804190000_system_settings_edit_page.sql'
);
const tablePreferencesMigrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260805103000_system_settings_table_preferences.sql'
);
const timezoneUtcMigrationPath = resolve(
  process.cwd(),
  process.cwd().toLowerCase().endsWith('api') ? '..' : '.',
  'supabase',
  'migrations',
  '20260823110000_system_config_timezone_utc.sql'
);
const env = getEnv();
const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;

if (!rawConnectionString) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

async function main() {
  const connectionString = normalizePostgresConnectionString(rawConnectionString);
  const createClient = () => {
    const nextClient = new Client({
      connectionString,
      connectionTimeoutMillis: 30_000,
      keepAlive: true,
      ssl: { rejectUnauthorized: false }
    });
    nextClient.on('error', () => {
      // Query-level retries below handle transient connection resets.
    });
    return nextClient;
  };
  let client = createClient();

  await client.connect();
  try {
    const relationResult = await client.query<{ system_config_table: string | null }>(
      `select to_regclass('public.system_config')::text as system_config_table`
    );
    const migrationSql = [
      ...(relationResult.rows[0]?.system_config_table
        ? []
        : [await readFile(systemConfigMigrationPath, 'utf8')]),
      await readFile(migrationPath, 'utf8'),
      await readFile(editPageMigrationPath, 'utf8'),
      await readFile(tablePreferencesMigrationPath, 'utf8'),
      await readFile(timezoneUtcMigrationPath, 'utf8')
    ];

    for (const sql of migrationSql) {
      let completed = false;

      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          await client.query(sql);
          completed = true;
          break;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (!['ECONNRESET', '57P01', '57P02', '57P03'].includes(code ?? '') || attempt === 3) {
            throw error;
          }

          await client.end().catch(() => undefined);
          await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
          client = createClient();
          await client.connect();
        }
      }

      if (!completed) {
        throw new Error('Database migration did not complete.');
      }
    }

    const { rows } = await client.query(`
      select
        page.code as page_code,
        page.route,
        page.status,
        page.edit_page_id,
        edit_page.code as edit_page_code,
        edit_page.route as edit_page_route,
        jsonb_array_length(edit_page.schema -> 'blocks') as edit_page_block_count,
        route.code as menu_code,
        route.title as menu_title,
        parent.code as parent_code,
        route.visible,
        (
          select config.locale_config ->> 'timezone'
          from public.system_config as config
          order by config.updated_at desc
          limit 1
        ) as system_timezone
      from public.lowcode_pages as page
      left join public.lowcode_pages as edit_page on edit_page.id = page.edit_page_id
      left join public.admin_routes as route on route.page_code = page.code
      left join public.admin_routes as parent on parent.id = route.parent_id
      where page.code = 'system-settings'
    `);

    console.log(JSON.stringify(rows[0] ?? null));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
