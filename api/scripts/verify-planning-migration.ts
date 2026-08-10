import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';
import { PLANNING_CONSOLE_GRID_TABLES } from '../src/planning-service/planning-console.schema';
import { PLANNING_MODEL_DEFINITIONS } from '../src/planning-service/planning.models';
import {
  assertLowCodeGridTableAssociations,
  assertPlanningConsoleAggregateSources,
  inspectLowCodeGridTableAssociations,
  inspectPlanningConsoleAggregateSources
} from './lowcode-grid-table-associations';
import {
  assertTransactionActive,
  unwrapMigrationTransaction
} from './planning-migration-transaction';

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
  'supabase/migrations/20260810150000_lowcode_grid_table_associations.sql'
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

function pooledProjectConnectionString(value: string) {
  try {
    const url = new URL(normalizePostgresConnectionString(value));
    url.searchParams.delete('sslmode');
    url.searchParams.delete('uselibpqcompat');
    return url.toString();
  } catch {
    return normalizePostgresConnectionString(value);
  }
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
    MIGRATION_FILES.map(async (file) => unwrapMigrationTransaction(
      await readFile(resolve(repoRoot, file), 'utf8')
    ))
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
      console_page_count: string;
      console_version_count: string;
      console_route_count: string;
    }>(`
      select
        (select count(*)::text from pg_catalog.pg_tables where schemaname = 'public' and tablename like 'planning_%') as table_count,
        (select count(*)::text from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname like 'planning_%' and c.relrowsecurity) as rls_count,
        (select count(*)::text from pg_catalog.pg_policies where schemaname = 'public' and tablename like 'planning_%') as policy_count,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-list' escape '\\') as list_page_count,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-edit' escape '\\') as edit_page_count,
        (select count(*)::text from public.lowcode_pages where code like 'planning\\_%\\-list' escape '\\' and edit_page_id is not null) as linked_page_count,
        (select count(*)::text from public.admin_entities where code like 'planning\\_%' escape '\\') as entity_count,
        (select count(*)::text from public.admin_routes where code like 'planning-%' and route_type = 'page' and status = 'active') as leaf_route_count,
        (select count(*)::text from public.admin_routes where status = 'active' and (code = 'planning-root' or (code ~ '^planning-[0-9]+$' and route_type = 'group'))) as group_route_count,
        (select count(*)::text from public.admin_permissions where code in ('planning.models.view','planning.models.manage')) as permission_count,
        (select count(*)::text from public.admin_role_permissions rp join public.admin_roles r on r.id = rp.role_id join public.admin_permissions p on p.id = rp.permission_id where r.code in ('system_admin','operations_admin') and p.code in ('planning.models.view','planning.models.manage')) as role_permission_count,
        (select count(*)::text from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid = c.conrelid join pg_catalog.pg_namespace n on n.oid = t.relnamespace where n.nspname = 'public' and t.relname like 'planning_%' and c.contype = 'f' and c.conname like '%_account_fk') as same_account_fk_count,
        (select count(*)::text from public.dynamic_crud_resource_registry where resource_name like 'planning\\_%' escape '\\') as crud_registry_count,
        (select count(*)::text from public.admin_routes where code = 'planning-root' and metadata->>'navigation' = 'sidebar') as root_sidebar_count,
        (select count(*)::text from public.admin_routes where code like 'planning-%' and code not in ('planning-root', 'planning-console') and metadata ? 'navigation') as descendant_navigation_override_count,
        (select count(*)::text from public.lowcode_pages where code = 'planning_console' and page_type = 'custom' and status = 'published') as console_page_count,
        (select count(*)::text from public.lowcode_page_versions version join public.lowcode_pages page on page.id = version.page_id where page.code = 'planning_console' and version.version = page.version and version.schema = page.schema) as console_version_count,
        (select count(*)::text from public.admin_routes route join public.admin_routes parent on parent.id = route.parent_id where route.code = 'planning-console' and route.path = '/dashboard/advanced/planning-console' and route.page_code = 'planning_console' and route.permission_code = 'planning.models.view' and route.status = 'active' and parent.code = 'advanced-root') as console_route_count
    `);

    const installed = rows[0];
    const expectedModels = PLANNING_MODEL_DEFINITIONS.length;
    const readOnlyModels = PLANNING_MODEL_DEFINITIONS.filter((model) => model.access === 'view').length;
    const expectedRelations = new Set(
      PLANNING_MODEL_DEFINITIONS.flatMap((model) => model.fields
        .filter((field) => field.kind === 'relation')
        .map((field) => `${model.key}.${field.name}`))
    ).size;
    const expected = {
      table_count: String(expectedModels),
      rls_count: String(expectedModels),
      policy_count: String(expectedModels * 4 - readOnlyModels * 3),
      list_page_count: String(expectedModels),
      edit_page_count: String(expectedModels),
      linked_page_count: String(expectedModels),
      entity_count: String(expectedModels),
      leaf_route_count: String(expectedModels + 1),
      group_route_count: String(new Set(PLANNING_MODEL_DEFINITIONS.map((model) => model.group)).size + 1),
      permission_count: '2',
      role_permission_count: '4',
      same_account_fk_count: String(expectedRelations),
      crud_registry_count: String(expectedModels),
      root_sidebar_count: '1',
      descendant_navigation_override_count: '0',
      console_page_count: '1',
      console_version_count: '1',
      console_route_count: '1'
    };

    if (Object.entries(expected).some(([key, value]) => installed?.[key as keyof typeof installed] !== value)) {
      throw new Error(`Planning migration verification failed: ${JSON.stringify({ installed, expected })}`);
    }

    const consoleGridTables = await client.query<{
      grid_id: string;
      table_name: string;
      source_type: string;
    }>(`
      select block->>'id' as grid_id,
             block->>'tableName' as table_name,
             block->>'sourceType' as source_type
      from public.lowcode_pages page
      cross join lateral jsonb_path_query(
        page.schema,
        'strict $.** ? (@.kind == "grid" && exists(@.tableName))'
      ) as block
      where page.code = 'planning_console'
        and block->>'id' = any($1::text[])
      order by block->>'id'
    `, [Object.keys(PLANNING_CONSOLE_GRID_TABLES)]);
    const linkedGridTables = Object.fromEntries(
      consoleGridTables.rows.map((row) => [row.grid_id, row])
    );
    for (const [gridId, tableName] of Object.entries(PLANNING_CONSOLE_GRID_TABLES)) {
      assert.equal(linkedGridTables[gridId]?.table_name, tableName);
      assert.equal(linkedGridTables[gridId]?.source_type, 'custom');
      assert.equal(linkedGridTables[gridId]?.table_name.startsWith('public.'), false);
    }
    const linkedGridIds = new Set(consoleGridTables.rows.map((row) => row.grid_id));
    assert.equal(linkedGridIds.size, Object.keys(PLANNING_CONSOLE_GRID_TABLES).length);

    const aggregateSources = await client.query<{
      source_type: string;
      service_name: string;
      service_method: string;
      table_name: string | null;
    }>(`
      select source.value->>'sourceType' as source_type,
             source.value->>'serviceName' as service_name,
             source.value->>'serviceMethod' as service_method,
             source.value->>'tableName' as table_name
      from public.lowcode_pages page
      cross join lateral jsonb_each(page.schema->'dataSources') as source(key, value)
      where page.code = 'planning_console'
        and source.key = any($1::text[])
    `, [[
      'demands',
      'operationPlans',
      'materials',
      'planResources',
      'resourcePlans',
      'problems',
      'constraints',
      'runs'
    ]]);
    assert.equal(aggregateSources.rows.length, Object.keys(PLANNING_CONSOLE_GRID_TABLES).length);
    for (const source of aggregateSources.rows) {
      assert.equal(source.source_type, 'custom');
      assert.equal(source.service_name, 'planning');
      assert.equal(source.service_method, 'getPlanningConsoleData');
      assert.equal(source.table_name, null);
    }

    const gridTableAudit = await inspectLowCodeGridTableAssociations(client);
    assertLowCodeGridTableAssociations(gridTableAudit);
    const planningAggregateAudit = await inspectPlanningConsoleAggregateSources(client);
    assertPlanningConsoleAggregateSources(planningAggregateAudit);

    const referenceIndexes = await client.query<{
      columns: string;
      index_name: string;
      is_unique: boolean;
      predicate: string | null;
    }>(`
      select index_class.relname as index_name,
             index_meta.indisunique as is_unique,
             pg_get_expr(index_meta.indpred, index_meta.indrelid) as predicate,
             array_to_string(array(
               select attribute.attname
               from unnest(index_meta.indkey) with ordinality as key(attnum, position)
               join pg_catalog.pg_attribute attribute
                 on attribute.attrelid = index_meta.indrelid and attribute.attnum = key.attnum
               order by key.position
             ), ',') as columns
      from pg_catalog.pg_index index_meta
      join pg_catalog.pg_class table_class on table_class.oid = index_meta.indrelid
      join pg_catalog.pg_namespace namespace on namespace.oid = table_class.relnamespace
      join pg_catalog.pg_class index_class on index_class.oid = index_meta.indexrelid
      where namespace.nspname = 'public'
        and table_class.relname = 'planning_operationplan'
        and index_class.relname in (
          'planning_operationplan_manual_reference_key',
          'planning_operationplan_version_reference_key'
        )
      order by index_class.relname
    `);
    const byName = new Map(referenceIndexes.rows.map((row) => [row.index_name, row]));
    const manualReference = byName.get('planning_operationplan_manual_reference_key');
    const versionReference = byName.get('planning_operationplan_version_reference_key');
    assert.equal(manualReference?.is_unique, true);
    assert.equal(manualReference?.columns, 'account_id,reference');
    assert.match(manualReference?.predicate ?? '', /plan_version_id IS NULL/i);
    assert.equal(versionReference?.is_unique, true);
    assert.equal(versionReference?.columns, 'account_id,plan_version_id,reference');
    assert.match(versionReference?.predicate ?? '', /plan_version_id IS NOT NULL/i);

    const legacyReferenceConstraint = await client.query<{ count: string }>(`
      select count(*)::text
      from pg_catalog.pg_constraint constraint_meta
      where constraint_meta.conrelid = 'public.planning_operationplan'::regclass
        and constraint_meta.contype = 'u'
        and array(
          select attribute.attname
          from unnest(constraint_meta.conkey) with ordinality as key(attnum, position)
          join pg_catalog.pg_attribute attribute
            on attribute.attrelid = constraint_meta.conrelid and attribute.attnum = key.attnum
          order by key.position
        ) = array['account_id', 'reference']::name[]
    `);
    assert.equal(legacyReferenceConstraint.rows[0]?.count, '0');

    await client.query('rollback');
    console.log(JSON.stringify({
      ...installed,
      console_grid_tables: linkedGridIds.size,
      lowcode_grid_tables: gridTableAudit.associatedGrids,
      lowcode_grids_without_single_table: gridTableAudit.unresolvedGrids.length,
      physical_table_options: gridTableAudit.optionCount,
      operationplan_reference_scope: 'baseline/version',
      transaction: 'verified rollback'
    }));
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
