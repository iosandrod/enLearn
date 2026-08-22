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
  inspectLowCodePageVersionMismatches,
  inspectPlanningConsoleAggregateSources
} from './lowcode-grid-table-associations';
import {
  assertTransactionActive,
  unwrapMigrationTransaction
} from './planning-migration-transaction';

const CATEGORY_MIGRATION_FILE =
  'supabase/migrations/20260810210000_planning_master_categories.sql';
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
  'supabase/migrations/20260810181000_planning_console_script_context_forward_fix.sql',
  'supabase/migrations/20260821110000_planning_console_runtime_capabilities_forward_fix.sql',
  'supabase/migrations/20260821113000_planning_console_select_submitted_version.sql',
  'supabase/migrations/20260821123000_planning_console_gantt_delivery_plans.sql',
  'supabase/migrations/20260822100000_planning_console_script_context_payload_fix.sql',
  CATEGORY_MIGRATION_FILE,
  'supabase/migrations/20260811120000_planning_structure_pages.sql',
  'supabase/migrations/20260813090000_planning_item_display_name.sql'
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

let expectedCategoryFailure = 0;

async function assertCategoryMutationRejected(
  client: Client,
  mutation: () => Promise<unknown>,
  pattern: RegExp,
  label: string
) {
  expectedCategoryFailure += 1;
  const savepoint = `planning_category_guard_${expectedCategoryFailure}`;
  await client.query(`savepoint ${savepoint}`);
  await assert.rejects(mutation, pattern, label);
  await client.query(`rollback to savepoint ${savepoint}`);
  await client.query(`release savepoint ${savepoint}`);
}

type LegacyCategoryFixture = {
  accountId: string;
  itemId: string;
  rootName: string;
  leafName: string;
  suffix: string;
};

async function seedLegacyCategoryFixture(client: Client): Promise<LegacyCategoryFixture> {
  const accountResult = await client.query<{ id: string }>(`
    select id from basejump.accounts order by created_at, id limit 1
  `);
  const accountId = accountResult.rows[0]?.id;
  assert.ok(accountId, 'Category verification requires at least one account.');
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const rootName = `Legacy root ${suffix}`;
  const leafName = `Legacy leaf ${suffix}`;
  const itemName = `Category verify legacy ${suffix}`;
  const displayNameColumn = await client.query<{ exists: boolean }>(`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'planning_item'
        and column_name = 'display_name'
    ) as exists
  `);
  const legacy = displayNameColumn.rows[0]?.exists
    ? await client.query<{ id: string }>(`
        insert into public.planning_item (
          account_id, name, display_name, category, subcategory
        )
        values ($1, $2, $2, $3, $4)
        returning id
      `, [accountId, itemName, rootName, leafName])
    : await client.query<{ id: string }>(`
        insert into public.planning_item (account_id, name, category, subcategory)
        values ($1, $2, $3, $4)
        returning id
      `, [accountId, itemName, rootName, leafName]);
  return {
    accountId,
    itemId: legacy.rows[0]!.id,
    rootName,
    leafName,
    suffix
  };
}

async function verifyPlanningCategories(
  client: Client,
  legacyFixture: LegacyCategoryFixture
) {
  const shape = await client.query<{
    category_table: string;
    category_columns: string;
    rls_enabled: boolean;
    policy_count: string;
    category_fk_count: string;
    restrictive_fk_count: string;
    category_indexes: string;
  }>(`
    select
      to_regclass('public.planning_category')::text as category_table,
      (select count(*)::text from information_schema.columns
       where table_schema = 'public' and table_name = 'planning_category') as category_columns,
      (select relrowsecurity from pg_catalog.pg_class
       where oid = 'public.planning_category'::regclass) as rls_enabled,
      (select count(*)::text from pg_catalog.pg_policies
       where schemaname = 'public' and tablename = 'planning_category') as policy_count,
      (select count(*)::text from pg_catalog.pg_constraint
       where conname in (
         'planning_item_category_id_account_fk',
         'planning_customer_category_id_account_fk',
         'planning_supplier_category_id_account_fk',
         'planning_category_parent_id_account_fk'
       )) as category_fk_count,
      (select count(*)::text from pg_catalog.pg_constraint
       where conname in (
         'planning_item_category_id_account_fk',
         'planning_customer_category_id_account_fk',
         'planning_supplier_category_id_account_fk',
         'planning_category_parent_id_account_fk'
       ) and confdeltype = 'r') as restrictive_fk_count,
      (select count(*)::text from pg_catalog.pg_indexes
       where schemaname = 'public' and indexname in (
         'idx_planning_category_account',
         'idx_planning_category_updated',
         'idx_planning_category_tree',
         'idx_planning_item_category',
         'idx_planning_customer_category',
         'idx_planning_supplier_category'
       )) as category_indexes
  `);
  assert.deepEqual(shape.rows[0], {
    category_table: 'planning_category',
    category_columns: '16',
    rls_enabled: true,
    policy_count: '4',
    category_fk_count: '4',
    restrictive_fk_count: '4',
    category_indexes: '6'
  });

  const { accountId, itemId, rootName: legacyRoot, leafName: legacyLeaf, suffix } =
    legacyFixture;
  const legacyBackfill = await client.query<{
    category: string;
    subcategory: string;
    category_id: string;
    target_type: string;
    parent_name: string;
  }>(`
    select item.category, item.subcategory, item.category_id::text,
           leaf.target_type, parent.name as parent_name
    from public.planning_item item
    join public.planning_category leaf
      on leaf.account_id = item.account_id and leaf.id = item.category_id
    left join public.planning_category parent
      on parent.account_id = leaf.account_id and parent.id = leaf.parent_id
    where item.account_id = $1 and item.id = $2
  `, [accountId, itemId]);
  assert.ok(legacyBackfill.rows[0], 'Legacy category backfill must resolve the fixture item.');
  assert.equal(legacyBackfill.rows[0]?.category, legacyRoot);
  assert.equal(legacyBackfill.rows[0]?.subcategory, legacyLeaf);
  assert.equal(legacyBackfill.rows[0]?.target_type, 'item');
  assert.equal(legacyBackfill.rows[0]?.parent_name, legacyRoot);

  const normalizedCodes = await client.query<{
    chinese_code: string;
    latin_code: string;
  }>(`
    select public.planning_normalize_category_code('纯中文类别') as chinese_code,
           public.planning_normalize_category_code('Raw Materials') as latin_code
  `);
  assert.match(normalizedCodes.rows[0]?.chinese_code ?? '', /^CAT_[A-F0-9]{12}$/);
  assert.equal(normalizedCodes.rows[0]?.latin_code, 'RAW_MATERIALS');

  const categories = await client.query<{
    item_root: string;
    item_middle: string;
    item_leaf: string;
    customer_root: string;
    inactive_item: string;
  }>(`
    with item_root as (
      insert into public.planning_category (account_id, target_type, code, name)
      values ($1, 'item', $2, $3) returning id
    ), item_middle as (
      insert into public.planning_category (account_id, target_type, code, name, parent_id)
      select $1, 'item', $4, $5, id from item_root returning id
    ), item_leaf as (
      insert into public.planning_category (account_id, target_type, code, name, parent_id)
      select $1, 'item', $6, $7, id from item_middle returning id
    ), customer_root as (
      insert into public.planning_category (account_id, target_type, code, name)
      values ($1, 'customer', $8, $9) returning id
    ), inactive_item as (
      insert into public.planning_category (account_id, target_type, code, name, status)
      values ($1, 'item', $10, $11, 'inactive') returning id
    )
    select item_root.id::text as item_root,
           item_middle.id::text as item_middle,
           item_leaf.id::text as item_leaf,
           customer_root.id::text as customer_root,
           inactive_item.id::text as inactive_item
    from item_root, item_middle, item_leaf, customer_root, inactive_item
  `, [
    accountId,
    `VERIFY_ITEM_ROOT_${suffix}`, `Verify root ${suffix}`,
    `VERIFY_ITEM_MIDDLE_${suffix}`, `Verify middle ${suffix}`,
    `VERIFY_ITEM_LEAF_${suffix}`, `Verify leaf ${suffix}`,
    `VERIFY_CUSTOMER_${suffix}`, `Verify customer ${suffix}`,
    `VERIFY_INACTIVE_${suffix}`, `Verify inactive ${suffix}`
  ]);
  const category = categories.rows[0];
  assert.ok(category);

  const assigned = await client.query<{
    id: string;
    category: string;
    subcategory: string;
  }>(`
    insert into public.planning_item (account_id, name, display_name, category_id)
    values ($1, $2, $2, $3)
    returning id, category, subcategory
  `, [accountId, `Category verify assigned ${suffix}`, category.item_leaf]);
  assert.equal(assigned.rows[0]?.category, `Verify root ${suffix}`);
  assert.equal(assigned.rows[0]?.subcategory, `Verify leaf ${suffix}`);

  await client.query(`
    update public.planning_item
    set category = $1, subcategory = $2
    where account_id = $3 and id = $4
  `, [`Drifted root ${suffix}`, `Drifted leaf ${suffix}`, accountId, assigned.rows[0]?.id]);
  const compatibilityProtected = await client.query<{
    category: string;
    subcategory: string;
  }>(`
    select category, subcategory from public.planning_item
    where account_id = $1 and id = $2
  `, [accountId, assigned.rows[0]?.id]);
  assert.equal(compatibilityProtected.rows[0]?.category, `Verify root ${suffix}`);
  assert.equal(compatibilityProtected.rows[0]?.subcategory, `Verify leaf ${suffix}`);

  await client.query(`
    update public.planning_category set name = $1 where account_id = $2 and id = $3
  `, [`Verify renamed root ${suffix}`, accountId, category.item_root]);
  const resynced = await client.query<{ category: string; subcategory: string }>(`
    select category, subcategory from public.planning_item
    where account_id = $1 and id = $2
  `, [accountId, assigned.rows[0]?.id]);
  assert.equal(resynced.rows[0]?.category, `Verify renamed root ${suffix}`);
  assert.equal(resynced.rows[0]?.subcategory, `Verify leaf ${suffix}`);

  await client.query(`
    update public.planning_item set category_id = null
    where account_id = $1 and id = $2
  `, [accountId, assigned.rows[0]?.id]);
  const cleared = await client.query<{ category: string | null; subcategory: string | null }>(`
    select category, subcategory from public.planning_item
    where account_id = $1 and id = $2
  `, [accountId, assigned.rows[0]?.id]);
  assert.equal(cleared.rows[0]?.category, null);
  assert.equal(cleared.rows[0]?.subcategory, null);

  await assertCategoryMutationRejected(
    client,
    () => client.query(`
      insert into public.planning_item (account_id, name, display_name, category_id)
      values ($1, $2, $2, $3)
    `, [accountId, `Category verify inactive assignment ${suffix}`, category.inactive_item]),
    /Inactive categories cannot be newly assigned/,
    'Inactive category assignment must be rejected.'
  );
  await assertCategoryMutationRejected(
    client,
    () => client.query(`
      insert into public.planning_item (account_id, name, display_name, category_id)
      values ($1, $2, $2, $3)
    `, [accountId, `Category verify wrong type ${suffix}`, category.customer_root]),
    /cannot be assigned to item/,
    'Cross-type category assignment must be rejected.'
  );
  await assertCategoryMutationRejected(
    client,
    () => client.query(`
      insert into public.planning_category (account_id, target_type, code, name, parent_id)
      values ($1, 'supplier', $2, $3, $4)
    `, [accountId, `VERIFY_WRONG_PARENT_${suffix}`, `Verify wrong parent ${suffix}`, category.customer_root]),
    /same account and target type/,
    'Cross-type category parent must be rejected.'
  );
  await assertCategoryMutationRejected(
    client,
    () => client.query(`
      update public.planning_category set parent_id = $1
      where account_id = $2 and id = $3
    `, [category.item_leaf, accountId, category.item_root]),
    /cannot contain a cycle/,
    'Category hierarchy cycles must be rejected.'
  );
  await assertCategoryMutationRejected(
    client,
    () => client.query(`
      delete from public.planning_category where account_id = $1 and id = $2
    `, [accountId, category.item_middle]),
    /foreign key constraint|still referenced/i,
    'Categories with children must not be deleted.'
  );
  await client.query(`
    update public.planning_item set category_id = $1 where account_id = $2 and id = $3
  `, [category.item_leaf, accountId, assigned.rows[0]?.id]);
  await assertCategoryMutationRejected(
    client,
    () => client.query(`
      delete from public.planning_category where account_id = $1 and id = $2
    `, [accountId, category.item_leaf]),
    /foreign key constraint|still referenced/i,
    'Assigned categories must not be deleted.'
  );

  return {
    shape: shape.rows[0],
    legacyBackfill: true,
    legacyTextProtection: true,
    deepHierarchy: true,
    integrityGuards: 6
  };
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
  const migrationParts = await Promise.all(
    MIGRATION_FILES.map(async (file) => ({
      file,
      sql: unwrapMigrationTransaction(await readFile(resolve(repoRoot, file), 'utf8'))
    }))
  );
  const categoryMigrationIndex = migrationParts.findIndex(
    ({ file }) => file === CATEGORY_MIGRATION_FILE
  );
  assert.ok(categoryMigrationIndex >= 0, 'Category migration is missing from verifier input.');
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
    const baselineVersionMismatches = await inspectLowCodePageVersionMismatches(client);
    await client.query('begin');
    for (const { sql } of migrationParts.slice(0, categoryMigrationIndex)) {
      await client.query(sql);
    }
    await client.query('set constraints all immediate');
    const legacyCategoryFixture = await seedLegacyCategoryFixture(client);
    for (const { sql } of migrationParts.slice(categoryMigrationIndex)) {
      await client.query(sql);
    }
    await assertTransactionActive(client);
    const categoryVerification = await verifyPlanningCategories(
      client,
      legacyCategoryFixture
    );

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
      leaf_route_count: String(expectedModels + 3),
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

    const itemDisplayNameShape = await client.query<{
      display_name_required: boolean;
      duplicate_registry_fields: number;
      registry_hash_synced: boolean;
    }>(`
      with registry_fields as (
        select field_path, field_value
        from public.dynamic_crud_resource_registry registry
        cross join lateral (values
          ('create.allowed_fields', registry.config#>'{resources,planning_item,create,allowed_fields}'),
          ('create.input_allowed_fields', registry.config#>'{resources,planning_item,create,input_allowed_fields}'),
          ('create.required_fields', registry.config#>'{resources,planning_item,create,required_fields}'),
          ('update.allowed_fields', registry.config#>'{resources,planning_item,update,allowed_fields}'),
          ('update.input_allowed_fields', registry.config#>'{resources,planning_item,update,input_allowed_fields}')
        ) paths(field_path, fields)
        cross join lateral jsonb_array_elements_text(coalesce(paths.fields, '[]'::jsonb)) field_value
        where registry.resource_name = 'planning_item'
      )
      select
        (select is_nullable = 'NO'
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'planning_item'
           and column_name = 'display_name') as display_name_required,
        (select count(*)::integer
         from (
           select expected.field_path
           from (values
             ('create.allowed_fields'),
             ('create.input_allowed_fields'),
             ('create.required_fields'),
             ('update.allowed_fields'),
             ('update.input_allowed_fields')
           ) expected(field_path)
           left join registry_fields fields
             on fields.field_path = expected.field_path
            and fields.field_value = 'display_name'
           group by expected.field_path
           having count(fields.field_value) <> 1
         ) invalid_fields) as duplicate_registry_fields,
        (select registry.config->>'config_hash' = registry.config_hash
         from public.dynamic_crud_resource_registry registry
         where registry.resource_name = 'planning_item') as registry_hash_synced
    `);
    assert.deepEqual(itemDisplayNameShape.rows[0], {
      display_name_required: true,
      duplicate_registry_fields: 0,
      registry_hash_synced: true
    });

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
    assertLowCodeGridTableAssociations(gridTableAudit, {
      versionMismatchBaseline: baselineVersionMismatches
    });
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
      preexisting_lowcode_page_version_mismatches: baselineVersionMismatches,
      physical_table_options: gridTableAudit.optionCount,
      planning_categories: categoryVerification,
      planning_item_display_name: itemDisplayNameShape.rows[0],
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
