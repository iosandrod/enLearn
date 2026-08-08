import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_MODEL_DEFINITIONS } from '../src/planning-service/planning.models';
import {
  assertTransactionActive,
  unwrapMigrationTransaction
} from './planning-migration-transaction';

const MIGRATION_FILES = [
  'supabase/migrations/20260807140000_planning_service.sql',
  'supabase/migrations/20260808160000_planning_extended_models.sql'
];

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
  const env = getEnv();
  const rawConnectionString = process.env.DIRECT_URL ?? env.DIRECT_URL ?? env.DATABASE_URL;
  if (!rawConnectionString) throw new Error('DIRECT_URL or DATABASE_URL is required.');

  const repoRoot = process.cwd().toLowerCase().endsWith('api')
    ? resolve(process.cwd(), '..')
    : process.cwd();
  const migration = (await Promise.all(
    MIGRATION_FILES.map(async (file) => unwrapMigrationTransaction(
      await readFile(resolve(repoRoot, file), 'utf8')
    ))
  )).join('\n\n');
  const client = new Client({
    connectionString: directProjectConnectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  try {
    await client.query('begin');
    await client.query(migration);
    await assertTransactionActive(client);

    const { rows } = await client.query<{
      table_count: string;
      rls_count: string;
      policy_count: string;
      list_page_count: string;
      edit_page_count: string;
      linked_page_count: string;
      entity_count: string;
      leaf_route_count: string;
      group_route_count: string;
      permission_count: string;
      role_permission_count: string;
      same_account_fk_count: string;
      crud_registry_count: string;
      root_sidebar_count: string;
      descendant_navigation_override_count: string;
    }>(`
      select
        (select count(*)::text from pg_catalog.pg_tables where schemaname = 'public' and tablename like 'planning_%') as table_count,
        (select count(*)::text from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'planning_%' and c.relrowsecurity) as rls_count,
        (select count(*)::text from pg_catalog.pg_policies where schemaname = 'public' and tablename like 'planning_%') as policy_count,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-list' escape '\\') as list_page_count,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-edit' escape '\\') as edit_page_count,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-list' escape '\\' and edit_page_id is not null) as linked_page_count,
        (select count(*)::text from public.admin_entities where code like 'planning\\_%' escape '\\') as entity_count,
        (select count(*)::text from public.admin_routes where code like 'planning-%' and route_type = 'page') as leaf_route_count,
        (select count(*)::text from public.admin_routes where code = 'planning-root' or (code ~ '^planning-[0-9]+$' and route_type = 'group')) as group_route_count,
        (select count(*)::text from public.admin_permissions where code in ('planning.models.view','planning.models.manage')) as permission_count,
        (select count(*)::text from public.admin_role_permissions rp join public.admin_roles r on r.id = rp.role_id join public.admin_permissions p on p.id = rp.permission_id where r.code in ('system_admin','operations_admin') and p.code in ('planning.models.view','planning.models.manage')) as role_permission_count,
        (select count(*)::text from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid = c.conrelid join pg_catalog.pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and t.relname like 'planning_%' and c.contype = 'f' and c.conname like '%_account_fk') as same_account_fk_count,
        (select count(*)::text from public.dynamic_crud_resource_registry where resource_name like 'planning\\_%' escape '\\') as crud_registry_count,
        (select count(*)::text from public.admin_routes where code = 'planning-root' and metadata->>'navigation' = 'sidebar') as root_sidebar_count,
        (select count(*)::text from public.admin_routes where code like 'planning-%' and code <> 'planning-root' and metadata ? 'navigation') as descendant_navigation_override_count
    `);

    const installed = rows[0];
    const expectedModels = PLANNING_MODEL_DEFINITIONS.length;
    const expectedRelations = PLANNING_MODEL_DEFINITIONS.reduce(
      (count, model) => count + model.fields.filter((field) => field.kind === 'relation').length,
      0
    );
    const expected = {
      table_count: String(expectedModels),
      rls_count: String(expectedModels),
      policy_count: String(expectedModels * 4),
      list_page_count: String(expectedModels),
      edit_page_count: String(expectedModels),
      linked_page_count: String(expectedModels),
      entity_count: String(expectedModels),
      leaf_route_count: String(expectedModels),
      group_route_count: String(new Set(PLANNING_MODEL_DEFINITIONS.map((model) => model.group)).size + 1),
      permission_count: '2',
      role_permission_count: '4',
      same_account_fk_count: String(expectedRelations),
      crud_registry_count: String(expectedModels),
      root_sidebar_count: '1',
      descendant_navigation_override_count: '0'
    };

    if (Object.entries(expected).some(([key, value]) => installed?.[key as keyof typeof installed] !== value)) {
      throw new Error(`Planning migration verification failed: ${JSON.stringify({ installed, expected })}`);
    }

    await client.query('rollback');
    console.log(JSON.stringify({ ...installed, transaction: 'verified rollback' }));
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
