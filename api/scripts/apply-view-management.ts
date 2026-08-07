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

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPath = resolve(
  repoRoot,
  'supabase',
  'migrations',
  '20260807090000_view_management.sql'
);

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

async function main() {
  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 5_000,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    await client.query(await readFile(migrationPath, 'utf8'));

    const { rows } = await client.query<{
      metadata_table: string | null;
      rpc_count: string;
      list_page: string | null;
      edit_page: string | null;
      edit_page_id: string | null;
      menu_code: string | null;
      navigation: string | null;
      version_table: string | null;
    }>(`
      select
        pg_catalog.to_regclass('public.entity_design_views')::text as metadata_table,
        (
          select count(*)::text
          from pg_catalog.pg_proc procedure
          join pg_catalog.pg_namespace namespace on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname in (
              'entity_design_list_views',
              'entity_design_list_view_columns',
              'entity_design_validate_view',
              'entity_design_save_view',
              'entity_design_publish_view',
              'entity_design_archive_view',
              'entity_design_delete_view'
            )
        ) as rpc_count,
        list_page.code as list_page,
        edit_page.code as edit_page,
        list_page.edit_page_id::text,
        route.code as menu_code,
        route.metadata->>'navigation' as navigation,
        pg_catalog.to_regclass('public.entity_design_view_versions')::text as version_table
      from public.lowcode_pages list_page
      left join public.lowcode_pages edit_page on edit_page.id = list_page.edit_page_id
      left join public.admin_routes route on route.page_code = list_page.code
      where list_page.code = 'entity-views'
    `);
    const installed = rows[0];
    if (
      installed?.metadata_table !== 'entity_design_views' ||
      installed.rpc_count !== '7' ||
      installed.list_page !== 'entity-views' ||
      installed.edit_page !== 'entity-views-edit' ||
      !installed.edit_page_id ||
      installed.menu_code !== 'entity-views' ||
      installed.navigation !== 'sidebar' ||
      installed.version_table !== null
    ) {
      throw new Error(`View management verification failed: ${JSON.stringify(installed)}`);
    }

    await client.query('commit');
    console.log(JSON.stringify(installed));
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
