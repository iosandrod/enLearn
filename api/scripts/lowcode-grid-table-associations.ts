import type { Client } from 'pg';

export const LOWCODE_GRID_TABLE_SERVICE_MAPPINGS = [
  ['admin', 'listUsers', 'users'],
  ['admin', 'getUser', 'users'],
  ['admin', 'listRoles', 'admin_roles'],
  ['admin', 'getRole', 'admin_roles'],
  ['admin', 'listPermissions', 'admin_permissions'],
  ['admin', 'listRoutes', 'admin_routes'],
  ['admin', 'listRouteTree', 'admin_routes'],
  ['admin', 'listRouteManageTree', 'admin_routes'],
  ['admin', 'listEntities', 'admin_entities'],
  ['admin', 'listPages', 'lowcode_pages'],
  ['admin', 'listOptionSources', 'system_option_sources'],
  ['admin', 'listOptionItems', 'system_option_items'],
  ['admin', 'listSystemExecutionTasks', 'wf_job'],
  ['admin', 'listWorkflowJobs', 'wf_job'],
  ['admin', 'listWorkflowJobRuns', 'wf_job_run'],
  ['admin', 'listWorkflowTimerJobs', 'wf_timer_job'],
  ['lowcode', 'listPages', 'lowcode_pages'],
  ['notification', 'listDeliveries', 'notification_deliveries'],
  ['notification', 'listMessages', 'notification_messages'],
  ['notification', 'getPreferences', 'notification_preferences'],
  ['entityDesign', 'listViews', 'entity_design_views']
] as const;

export const LOWCODE_GRID_WORKFLOW_ITEM_TABLES = {
  models: 'wf_model',
  instances: 'wf_process_instance',
  nodeInstances: 'wf_node_instance',
  tasks: 'wf_task'
} as const;

export const LOWCODE_GRID_PLANNING_DATASET_TABLES = {
  demands: 'planning_demand',
  operationPlans: 'planning_operationplan',
  materials: 'planning_operationplanmaterial',
  planResources: 'planning_operationplanresource',
  resourcePlans: 'planning_resourceplan',
  problems: 'planning_problem',
  constraints: 'planning_constraint',
  runs: 'planning_run'
} as const;

export const LOWCODE_GRID_TABLE_OVERRIDES = {
  'admin-system-entities::entity-grid-permissions-grid': 'admin_permissions',
  'admin-system-entities::entity-grid-routes-grid': 'admin_routes',
  'admin-system-permissions::permission-grid-roles-grid': 'admin_roles',
  'admin-system-roles::role-grid-permissions-grid': 'admin_permissions',
  'admin-system-routes::route-tree-grid-children-grid': 'admin_routes',
  'admin-system-users::user-role-permission-grid': 'users',
  'role-management-list::role-list-grid-permissions-grid': 'admin_permissions',
  'visual-admin-page::records-grid-fields-grid': 'users',
  'visual-admin-query-flow-20260724-0932::records-grid-fields-grid': 'users',
  'visual-admin-query-flow-20260724-style2::records-grid-fields-grid': 'users',
  'visual-admin-query-flow-20260724-style3::records-grid-fields-grid': 'users'
} as const;

// These grids render inline, generated, or cross-table metadata and have no single physical table.
// Leaving tableName empty is intentional because inventing an association would be misleading.
export const LOWCODE_GRID_WITHOUT_SINGLE_TABLE = new Set([
  'admin-system-file-entities::file-entity-main-grid',
  'admin-system-file-entities::file-entity-fields-grid',
  'admin-system-file-entities::file-entity-selected-grid',
  'demo-admin-page::sample-grid',
  'demo-admin-page::sample-grid-fields-grid',
  'entity-views::entity-view-columns-grid',
  'entity-views-edit::entity-view-edit-columns-grid',
  'planning_console::planning_console_preflight_grid'
]);

export const LOWCODE_GRID_EXPECTED_WITHOUT_SINGLE_TABLE_COUNT =
  LOWCODE_GRID_WITHOUT_SINGLE_TABLE.size;

export type LowCodeGridTableAuditRow = {
  page_code: string;
  grid_id: string;
  source_key: string;
  source_type: string;
  table_name: string;
  table_exists: boolean;
};

export type LowCodeGridTableAudit = {
  grids: LowCodeGridTableAuditRow[];
  totalGrids: number;
  associatedGrids: number;
  unresolvedGrids: LowCodeGridTableAuditRow[];
  unknownUnresolvedGrids: LowCodeGridTableAuditRow[];
  invalidAssociations: LowCodeGridTableAuditRow[];
  prefixedAssociations: LowCodeGridTableAuditRow[];
  optionCount: number;
  prefixedOptionCount: number;
  versionMismatchCount: number;
  nullBlockCount: number;
  unexpectedSourceTypeCount: number;
};

type LowCodePlanningSourceAuditRow = {
  source_key: string;
  source_type: string;
  service_name: string;
  service_method: string;
  table_name: string;
};

export function lowCodeGridAssociationKey(pageCode: string, gridId: string) {
  return `${pageCode}::${gridId}`;
}

export async function inspectLowCodeGridTableAssociations(
  client: Pick<Client, 'query'>
): Promise<LowCodeGridTableAudit> {
  const gridResult = await client.query<LowCodeGridTableAuditRow>(`
    select
      page.code as page_code,
      coalesce(block->>'id', '') as grid_id,
      coalesce(block->>'sourceKey', '') as source_key,
      coalesce(block->>'sourceType', '') as source_type,
      coalesce(block->>'tableName', '') as table_name,
      exists (
        select 1
        from pg_catalog.pg_class relation
        join pg_catalog.pg_namespace namespace on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = block->>'tableName'
          and relation.relkind in ('r', 'p', 'f')
      ) as table_exists
    from public.lowcode_pages page
    cross join lateral jsonb_array_elements(
      jsonb_path_query_array(page.schema, 'strict $.** ? (@.kind == "grid")')
    ) as block
    order by page.code, block->>'id'
  `);
  const optionResult = await client.query<{
    option_count: number;
    prefixed_option_count: number;
  }>(`
    select
      count(*)::integer as option_count,
      count(*) filter (
        where value like 'public.%' or label like 'public.%'
      )::integer as prefixed_option_count
    from public.system_physical_table_options
  `);
  const versionResult = await client.query<{ mismatch_count: number }>(`
    select count(*)::integer as mismatch_count
    from public.lowcode_pages page
    where exists (
      select 1
      from jsonb_array_elements(
        jsonb_path_query_array(
          page.schema,
          'strict $.** ? (@.kind == "grid" && exists(@.tableName))'
        )
      ) block
    )
      and not exists (
        select 1
        from public.lowcode_page_versions version
        where version.page_id = page.id
          and version.version = page.version
          and version.schema = page.schema
      )
  `);
  const nullBlockResult = await client.query<{ null_block_count: number }>(`
    select count(*)::integer as null_block_count
    from public.lowcode_pages page
    cross join lateral jsonb_path_query(page.schema, 'strict $.**') node(value)
    where node.value is null
  `);
  const sourceTypeResult = await client.query<{ unexpected_source_type_count: number }>(`
    select count(*)::integer as unexpected_source_type_count
    from public.lowcode_pages page
    cross join lateral jsonb_array_elements(
      jsonb_path_query_array(page.schema, 'strict $.** ? (@.kind == "grid")')
    ) block
    where coalesce(block->>'tableName', '') <> ''
      and coalesce(block->>'sourceType', '') not in ('custom', 'table', 'view')
  `);

  const rows = gridResult.rows;
  const unresolvedGrids = rows.filter((row) => !row.table_name);
  const unknownUnresolvedGrids = unresolvedGrids.filter((row) => (
    !LOWCODE_GRID_WITHOUT_SINGLE_TABLE.has(
      lowCodeGridAssociationKey(row.page_code, row.grid_id)
    )
  ));
  const invalidAssociations = rows.filter((row) => row.table_name && !row.table_exists);
  const prefixedAssociations = rows.filter((row) => row.table_name.includes('.'));

  return {
    grids: rows,
    totalGrids: rows.length,
    associatedGrids: rows.length - unresolvedGrids.length,
    unresolvedGrids,
    unknownUnresolvedGrids,
    invalidAssociations,
    prefixedAssociations,
    optionCount: optionResult.rows[0]?.option_count ?? 0,
    prefixedOptionCount: optionResult.rows[0]?.prefixed_option_count ?? 0,
    versionMismatchCount: versionResult.rows[0]?.mismatch_count ?? 0,
    nullBlockCount: nullBlockResult.rows[0]?.null_block_count ?? 0,
    unexpectedSourceTypeCount:
      sourceTypeResult.rows[0]?.unexpected_source_type_count ?? 0
  };
}

export async function inspectPlanningConsoleAggregateSources(
  client: Pick<Client, 'query'>
) {
  const result = await client.query<LowCodePlanningSourceAuditRow>(`
    select
      source.key as source_key,
      coalesce(source.value->>'sourceType', '') as source_type,
      coalesce(source.value->>'serviceName', '') as service_name,
      coalesce(source.value->>'serviceMethod', '') as service_method,
      coalesce(source.value->>'tableName', '') as table_name
    from public.lowcode_pages page
    cross join lateral jsonb_each(page.schema->'dataSources') source(key, value)
    where page.code = 'planning_console'
      and source.key = any($1::text[])
    order by source.key
  `, [Object.keys(LOWCODE_GRID_PLANNING_DATASET_TABLES)]);
  return result.rows;
}

export function assertPlanningConsoleAggregateSources(
  rows: LowCodePlanningSourceAuditRow[]
) {
  const expectedCount = Object.keys(LOWCODE_GRID_PLANNING_DATASET_TABLES).length;
  if (rows.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} planning aggregate data sources, found ${rows.length}.`);
  }
  const invalid = rows.filter((row) => (
    row.source_type !== 'custom' ||
    row.service_name !== 'planning' ||
    row.service_method !== 'getPlanningConsoleData' ||
    Boolean(row.table_name)
  ));
  if (invalid.length) {
    throw new Error(`Planning aggregate data sources changed unexpectedly: ${JSON.stringify(invalid)}`);
  }
}

export function assertLowCodeGridTableAssociations(audit: LowCodeGridTableAudit) {
  const issues: string[] = [];
  if (audit.unknownUnresolvedGrids.length) {
    issues.push(`unresolved=${JSON.stringify(audit.unknownUnresolvedGrids)}`);
  }
  if (audit.unresolvedGrids.length !== LOWCODE_GRID_EXPECTED_WITHOUT_SINGLE_TABLE_COUNT) {
    issues.push(
      `expectedUnresolved=${LOWCODE_GRID_EXPECTED_WITHOUT_SINGLE_TABLE_COUNT}, actual=${audit.unresolvedGrids.length}`
    );
  }
  if (audit.invalidAssociations.length) {
    issues.push(`invalid=${JSON.stringify(audit.invalidAssociations)}`);
  }
  if (audit.prefixedAssociations.length) {
    issues.push(`prefixed=${JSON.stringify(audit.prefixedAssociations)}`);
  }
  if (audit.optionCount < 1) issues.push('physical-table dropdown is empty');
  if (audit.prefixedOptionCount !== 0) {
    issues.push(`prefixedDropdownOptions=${audit.prefixedOptionCount}`);
  }
  if (audit.versionMismatchCount !== 0) {
    issues.push(`versionMismatches=${audit.versionMismatchCount}`);
  }
  if (audit.nullBlockCount !== 0) {
    issues.push(`nullSchemaNodes=${audit.nullBlockCount}`);
  }
  if (audit.unexpectedSourceTypeCount !== 0) {
    issues.push(`unexpectedSourceTypes=${audit.unexpectedSourceTypeCount}`);
  }
  if (issues.length) {
    throw new Error(`Low-code grid table association verification failed: ${issues.join('; ')}`);
  }
}
