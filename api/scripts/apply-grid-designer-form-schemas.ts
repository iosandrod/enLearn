import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { getEnv, normalizePostgresConnectionString } from '../src/common/utils/env';

const gridDesignerFormCode = 'grid-designer';
const legacyFormCodes = [
  'grid-designer-columns',
  'grid-designer-business-info',
  'grid-designer-grid-options',
  'grid-designer-form-settings',
  'grid-designer-row-config',
  'grid-designer-column-config',
  'grid-designer-events',
  'grid-designer-extra-props',
  'grid-designer-pager-config',
  'grid-designer-toolbar-config',
  'grid-designer-proxy-config',
  'grid-designer-edit-config',
  'grid-designer-checkbox-config',
  'grid-designer-radio-config',
  'grid-designer-sort-config',
  'grid-designer-filter-config',
  'grid-designer-tree-config',
  'grid-designer-expand-config',
  'grid-designer-column-size-align',
  'grid-designer-column-display',
  'grid-designer-column-filters',
  'grid-designer-column-renderers',
  'grid-designer-detail-config',
] as const;

const env = getEnv();
const rawConnectionStrings = [
  process.env.DIRECT_URL,
  env.DIRECT_URL,
  process.env.DATABASE_URL,
  env.DATABASE_URL,
]
  .filter((value): value is string => Boolean(value?.trim()))
  .filter((value, index, values) => values.indexOf(value) === index);

if (!rawConnectionStrings.length) {
  throw new Error('DIRECT_URL or DATABASE_URL is required.');
}

const repoRoot = process.cwd().toLowerCase().endsWith('api')
  ? resolve(process.cwd(), '..')
  : process.cwd();
const migrationPaths = [
  resolve(repoRoot, 'supabase/migrations/20260826130000_grid_designer_form_schemas.sql'),
  resolve(repoRoot, 'supabase/migrations/20260826143000_grid_detail_schema_save.sql'),
];

function connectionString(value: string) {
  const url = new URL(normalizePostgresConnectionString(value));
  url.searchParams.delete('pgbouncer');
  url.searchParams.delete('sslmode');
  url.searchParams.delete('uselibpqcompat');
  return url.toString();
}

function unwrapMigration(sql: string) {
  return sql
    .replace(/^\uFEFF?\s*begin;\s*/i, '')
    .replace(/\s*commit;\s*$/i, '');
}

type VerificationResult = {
  database_name: string;
  master_definition_count: number;
  legacy_definition_count: number;
  section_count: number;
  root_tab_count: number;
  root_layout_kind: string | null;
  columns_component: string | null;
  events_component: string | null;
  detail_component: string | null;
  has_directive_placeholder: boolean;
  sales_foreign_key: string | null;
  sales_parent_key: string | null;
  sales_update_mode: string | null;
  option_foreign_key: string | null;
  option_parent_key: string | null;
  option_update_mode: string | null;
  sales_uses_generic_save: boolean;
  sales_uses_grid_changes_script: boolean;
};

async function applyMigration(rawConnectionString: string, migrationSql: string) {
  const client = new Client({
    connectionString: connectionString(rawConnectionString),
    connectionTimeoutMillis: 30_000,
    keepAlive: true,
    ssl: { rejectUnauthorized: false },
  });
  client.on('error', () => undefined);
  let stage = 'connect';

  try {
    await client.connect();
    stage = 'begin transaction';
    await client.query('begin');
    stage = 'configure transaction timeouts';
    await client.query(`set local lock_timeout = '5s'`);
    await client.query(`set local statement_timeout = '15s'`);
    stage = 'execute migration';
    await client.query(migrationSql);

    stage = 'verify migration';
    const { rows } = await client.query<VerificationResult>(`
      with master as (
        select schema
        from public.lowcode_form_definitions
        where code = $1
          and enabled = true
      ), page_grids as (
        select
          page.code,
          block
        from public.lowcode_pages page
        cross join lateral jsonb_path_query(page.schema, '$.** ? (@.kind == "grid")') block
        where page.code in ('sales-orders-edit', 'admin-system-options-edit')
      ), sales_save as (
        select action ->> 'script' as script
        from public.lowcode_pages page
        cross join lateral jsonb_path_query(
          page.schema,
          '$.** ? (@.id == "sales-order-edit-actions")'
        ) action_block
        cross join lateral jsonb_array_elements(coalesce(action_block -> 'actions', '[]'::jsonb)) action
        where page.code = 'sales-orders-edit'
          and action ->> 'code' = 'save'
        limit 1
      )
      select
        current_database() as database_name,
        (select count(*)::int from master) as master_definition_count,
        (
          select count(*)::int
          from public.lowcode_form_definitions
          where code = any($2::text[])
        ) as legacy_definition_count,
        coalesce((select jsonb_array_length(schema -> 'fields') from master), 0)::int
          as section_count,
        coalesce((select jsonb_array_length(schema #> '{layout,0,tabs}') from master), 0)::int
          as root_tab_count,
        (select schema #>> '{layout,0,kind}' from master) as root_layout_kind,
        (
          select section #>> '{props,schema,fields,0,component}'
          from master
          cross join lateral jsonb_array_elements(schema -> 'fields') section
          where section ->> 'field' = 'grid-designer-columns'
        ) as columns_component,
        (
          select section #>> '{props,schema,fields,0,component}'
          from master
          cross join lateral jsonb_array_elements(schema -> 'fields') section
          where section ->> 'field' = 'grid-designer-events'
        ) as events_component,
        (
          select section ->> 'component'
          from master
          cross join lateral jsonb_array_elements(schema -> 'fields') section
          where section ->> 'field' = 'grid-designer-detail-config'
        ) as detail_component,
        coalesce((
          select (section #>> '{props,schema,fields,0,props,columns,5,props,placeholder}')
            like '%"type": "setDataSource"%'
          from master
          cross join lateral jsonb_array_elements(schema -> 'fields') section
          where section ->> 'field' = 'grid-designer-events'
        ), false) as has_directive_placeholder,
        (
          select max(block #>> '{schema,detailConfig,foreignKey}')
          from page_grids
          where code = 'sales-orders-edit'
            and block ->> 'id' = 'sales-order-lines-grid'
        ) as sales_foreign_key,
        (
          select max(block #>> '{schema,detailConfig,parentKey}')
          from page_grids
          where code = 'sales-orders-edit'
            and block ->> 'id' = 'sales-order-lines-grid'
        ) as sales_parent_key,
        (
          select max(block #>> '{schema,detailConfig,updateMode}')
          from page_grids
          where code = 'sales-orders-edit'
            and block ->> 'id' = 'sales-order-lines-grid'
        ) as sales_update_mode,
        (
          select max(block #>> '{schema,detailConfig,foreignKey}')
          from page_grids
          where code = 'admin-system-options-edit'
            and block ->> 'id' = 'option-source-items-grid'
        ) as option_foreign_key,
        (
          select max(block #>> '{schema,detailConfig,parentKey}')
          from page_grids
          where code = 'admin-system-options-edit'
            and block ->> 'id' = 'option-source-items-grid'
        ) as option_parent_key,
        (
          select max(block #>> '{schema,detailConfig,updateMode}')
          from page_grids
          where code = 'admin-system-options-edit'
            and block ->> 'id' = 'option-source-items-grid'
        ) as option_update_mode,
        coalesce((select script like '%executeFunction({ name: "save"%' from sales_save), false)
          as sales_uses_generic_save,
        coalesce((select script like '%getChanges%' from sales_save), false)
          as sales_uses_grid_changes_script
    `, [gridDesignerFormCode, legacyFormCodes]);
    const result = rows[0];

    if (
      !result
      || result.master_definition_count !== 1
      || result.legacy_definition_count !== 0
      || result.section_count !== legacyFormCodes.length
      || result.root_tab_count !== 4
      || result.root_layout_kind !== 'tabs'
      || result.columns_component !== 'lc-array-table'
      || result.events_component !== 'lc-array-table'
      || result.detail_component !== 'lc-sub-form'
      || result.has_directive_placeholder !== true
      || result.sales_foreign_key !== 'order_id'
      || result.sales_parent_key !== 'id'
      || result.sales_update_mode !== 'changes'
      || result.option_foreign_key !== 'source_code'
      || result.option_parent_key !== 'code'
      || result.option_update_mode !== 'changes'
      || result.sales_uses_generic_save !== true
      || result.sales_uses_grid_changes_script !== false
    ) {
      throw new Error(`Grid designer form schema verification failed: ${JSON.stringify(result)}`);
    }

    stage = 'commit transaction';
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${stage}: ${message}`);
  } finally {
    await client.end();
  }
}

async function main() {
  const migrationSql = (
    await Promise.all(migrationPaths.map((path) => readFile(path, 'utf8')))
  ).map(unwrapMigration).join('\n\n');
  let connectionError: unknown;

  for (const rawConnectionString of rawConnectionStrings) {
    try {
      const result = await applyMigration(rawConnectionString, migrationSql);
      console.log(JSON.stringify(result));
      return;
    } catch (error) {
      connectionError = error;
    }
  }

  throw connectionError;
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
