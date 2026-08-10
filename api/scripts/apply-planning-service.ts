import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_MODEL_DEFINITIONS } from '../src/planning-service/planning.models';

const MIGRATION_FILES = [
  'supabase/migrations/20260807140000_planning_service.sql',
  'supabase/migrations/20260808150000_planning_diagnostic_tables.sql',
  'supabase/migrations/20260808160000_planning_extended_models.sql',
  'supabase/migrations/20260808170000_planning_execution_runtime.sql',
  'supabase/migrations/20260810110000_unify_sales_order_status.sql',
  'supabase/migrations/20260810135000_bare_grid_table_options.sql',
  'supabase/migrations/20260809120000_planning_console.sql',
  'supabase/migrations/20260810100000_planning_console_inner_tabs.sql',
  'supabase/migrations/20260810140000_planning_console_grid_tables.sql',
  'supabase/migrations/20260810150000_lowcode_grid_table_associations.sql',
  'supabase/migrations/20260810180000_planning_version_lifecycle_forward_fix.sql',
  'supabase/migrations/20260810181000_planning_console_script_context_forward_fix.sql'
];

function directProjectConnectionString(value: string) {
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
}

function pooledProjectConnectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

async function main() {
  const env = getEnv();
  const explicitDirectUrl = Object.prototype.hasOwnProperty.call(process.env, 'DIRECT_URL')
    ? process.env.DIRECT_URL?.trim()
    : undefined;
  const rawConnectionString = explicitDirectUrl ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');
  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = (await Promise.all(
    MIGRATION_FILES.map((file) => readFile(resolve(repoRoot, file), 'utf8'))
  )).join('\n\n');
  const configuredConnectionString = explicitDirectUrl
    ? directProjectConnectionString(rawConnectionString)
    : pooledProjectConnectionString(rawConnectionString);
  const client = new Client({
    connectionString: configuredConnectionString,
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });
  client.on('error', () => undefined);

  await client.connect();
  try {
    await client.query(migration);
    const { rows } = await client.query<{
      tables: string;
      pages: string;
      entities: string;
      routes: string;
      registry: string;
      root_sidebar: string;
      descendant_navigation_overrides: string;
      console_page: string;
      console_version: string;
      console_route: string;
    }>(`
      select
        (select count(*)::text from pg_catalog.pg_tables where schemaname = 'public' and tablename like 'planning_%') as tables,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-%' escape '\\') as pages,
        (select count(*)::text from public.admin_entities where code like 'planning\\_%' escape '\\') as entities,
        (select count(*)::text from public.admin_routes where (code = 'planning-root' or code like 'planning-%') and status = 'active') as routes,
        (select count(*)::text from public.dynamic_crud_resource_registry where resource_name like 'planning\\_%' escape '\\') as registry,
        (select count(*)::text from public.admin_routes where code = 'planning-root' and metadata->>'navigation' = 'sidebar') as root_sidebar,
        (select count(*)::text from public.admin_routes where code like 'planning-%' and code not in ('planning-root', 'planning-console') and metadata ? 'navigation') as descendant_navigation_overrides,
        (select count(*)::text from public.lowcode_pages where code = 'planning_console' and page_type = 'custom' and status = 'published') as console_page,
        (select count(*)::text from public.lowcode_page_versions version join public.lowcode_pages page on page.id = version.page_id where page.code = 'planning_console' and version.version = page.version) as console_version,
        (select count(*)::text from public.admin_routes route join public.admin_routes parent on parent.id = route.parent_id where route.code = 'planning-console' and route.page_code = 'planning_console' and route.permission_code = 'planning.models.view' and route.status = 'active' and parent.code = 'advanced-root') as console_route
    `);
    const installed = rows[0];
    const expectedModels = PLANNING_MODEL_DEFINITIONS.length;
    if (
      installed?.tables !== String(expectedModels) ||
      installed.pages !== String(expectedModels * 2) ||
      installed.entities !== String(expectedModels) ||
      installed.routes !== String(
        expectedModels + new Set(PLANNING_MODEL_DEFINITIONS.map((model) => model.group)).size + 2
      ) ||
      installed.registry !== String(expectedModels) ||
      installed.root_sidebar !== '1' ||
      installed.descendant_navigation_overrides !== '0' ||
      installed.console_page !== '1' ||
      installed.console_version !== '1' ||
      installed.console_route !== '1'
    ) {
      throw new Error(`Planning service verification failed after commit: ${JSON.stringify(installed)}`);
    }
    console.log(JSON.stringify({ ...installed, applied: true }));
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
