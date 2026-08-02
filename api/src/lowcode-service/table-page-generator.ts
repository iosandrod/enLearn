import type { PoolClient } from 'pg';
import { migrateLowCodePageSchema, type LowCodePageSchema } from './lowcode.schema';

export type DatabaseTableRef = {
  schema: string;
  name: string;
  fullName: string;
};

export type DatabaseColumn = {
  name: string;
  ordinalPosition: number;
  dataType: string;
  udtName: string;
  isNullable: boolean;
  hasDefault: boolean;
  comment: string;
  isPrimaryKey: boolean;
};

export type DatabaseChildRelation = {
  constraintName: string;
  childTable: DatabaseTableRef;
  childColumns: string[];
  parentColumns: string[];
};

export type DatabaseTableOption = {
  label: string;
  value: string;
  tableName: string;
  schema: string;
  name: string;
  title: string;
  comment: string;
  entityCode?: string;
  pageCode?: string;
  routePath?: string;
  primaryKey?: string;
};

type TablePageSchemaOptions = {
  table: DatabaseTableRef;
  columns: DatabaseColumn[];
  childRelations: Array<DatabaseChildRelation & { columns: DatabaseColumn[]; title: string }>;
  code?: string;
  route?: string;
  title?: string;
  description?: string;
  status?: 'draft' | 'published' | 'archived';
  primaryKey?: string;
  entityCode?: string;
};

const INTERNAL_SCHEMAS = new Set([
  'auth',
  'extensions',
  'graphql',
  'graphql_public',
  'information_schema',
  'net',
  'pg_catalog',
  'pgsodium',
  'realtime',
  'storage',
  'supabase_functions',
  'vault'
]);

const textFormatter = { type: 'text', emptyText: '-' };
const numberFormatter = { type: 'number', locale: 'zh-CN', emptyText: '0' };
const datetimeFormatter = { type: 'datetime', locale: 'zh-CN', emptyText: '-' };
const dateFormatter = { type: 'date', locale: 'zh-CN', emptyText: '-' };
const booleanFormatter = {
  type: 'enum',
  map: { true: '是', false: '否' },
  emptyText: '-'
};

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${fieldName} must be a valid identifier.`);
  }
}

export function readTableRef(value: unknown, fieldName = 'tableName'): DatabaseTableRef {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${fieldName} is required.`);
  }

  const parts = value.trim().split('.');
  if (parts.length > 2) {
    throw new Error(`${fieldName} must be table or schema.table.`);
  }

  const schema = parts.length === 2 ? parts[0] : 'public';
  const name = parts.length === 2 ? parts[1] : parts[0];
  assertIdentifier(schema, `${fieldName}.schema`);
  assertIdentifier(name, `${fieldName}.name`);

  return {
    schema,
    name,
    fullName: `${schema}.${name}`
  };
}

function normalizeIdentifier(value: string, fallback: string) {
  const normalized = value
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  return normalized || fallback;
}

function toCamelish(value: string) {
  return normalizeIdentifier(value, 'value')
    .split('_')
    .filter(Boolean)
    .map((part, index) =>
      index === 0 ? part.toLowerCase() : `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`
    )
    .join('');
}

function humanizeIdentifier(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function tableTitle(table: DatabaseTableRef, comment = '') {
  return comment.trim() || humanizeIdentifier(table.name);
}

function columnTitle(column: DatabaseColumn) {
  return column.comment.trim() || humanizeIdentifier(column.name);
}

function sourceKeyFor(table: DatabaseTableRef, suffix = 'rows') {
  return `${toCamelish(`${table.schema}_${table.name}`)}${suffix ? `${suffix.slice(0, 1).toUpperCase()}${suffix.slice(1)}` : ''}`;
}

function preferredPrimaryKey(columns: DatabaseColumn[], fallback = 'id') {
  return (
    columns.find((column) => column.isPrimaryKey)?.name ??
    columns.find((column) => column.name === 'id')?.name ??
    columns[0]?.name ??
    fallback
  );
}

function formatterForColumn(column: DatabaseColumn) {
  const dataType = column.dataType.toLowerCase();
  const udtName = column.udtName.toLowerCase();

  if (dataType.includes('timestamp') || udtName.startsWith('timestamp')) return datetimeFormatter;
  if (dataType === 'date') return dateFormatter;
  if (dataType === 'boolean') return booleanFormatter;
  if (
    ['integer', 'bigint', 'smallint', 'numeric', 'real', 'double precision'].includes(dataType) ||
    ['int2', 'int4', 'int8', 'numeric', 'float4', 'float8'].includes(udtName)
  ) {
    return numberFormatter;
  }

  return textFormatter;
}

function widthForColumn(column: DatabaseColumn) {
  if (column.name === 'id' || column.name.endsWith('_id')) return 230;
  if (column.dataType.includes('timestamp')) return 180;
  if (column.dataType === 'boolean') return 90;
  if (column.dataType.includes('json')) return 260;
  return undefined;
}

function gridColumn(column: DatabaseColumn, index: number) {
  return {
    field: column.name,
    title: columnTitle(column),
    ...(index === 0 ? { fixed: 'left' } : {}),
    ...(widthForColumn(column)
      ? { width: widthForColumn(column) }
      : { minWidth: column.name.length > 18 ? 220 : 150 }),
    showOverflow: 'tooltip',
    formatter: formatterForColumn(column)
  };
}

function visibleGridColumns(columns: DatabaseColumn[]) {
  const nonLargeColumns = columns.filter(
    (column) => !['json', 'jsonb', 'bytea'].includes(column.udtName.toLowerCase())
  );
  const candidates = nonLargeColumns.length ? nonLargeColumns : columns;
  return candidates.slice(0, 12).map(gridColumn);
}

function buildGridConfig(
  columns: DatabaseColumn[],
  keyField: string,
  height: number | string
) {
  return {
    border: true,
    stripe: true,
    showOverflow: true,
    height,
    rowConfig: { keyField, isCurrent: true },
    columns: visibleGridColumns(columns)
  };
}

function statusFilterActions(sourceKey: string, columns: DatabaseColumn[]) {
  if (!columns.some((column) => column.name === 'status')) return [];

  return [
    {
      code: `show-active-${sourceKey}`,
      label: '启用',
      directives: [
        { type: 'setSearchFilters', sourceKey, mode: 'replace', values: { status: 'active' } }
      ]
    },
    {
      code: `show-inactive-${sourceKey}`,
      label: '停用',
      directives: [
        { type: 'setSearchFilters', sourceKey, mode: 'replace', values: { status: 'inactive' } }
      ]
    }
  ];
}

export async function listDatabaseTableOptions(
  client: PoolClient
): Promise<DatabaseTableOption[]> {
  const { rows } = await client.query<{
    table_schema: string;
    table_name: string;
    table_comment: string | null;
    entity_code: string | null;
    entity_title: string | null;
    route_path: string | null;
    page_code: string | null;
    primary_key: string | null;
  }>(`
    select
      ns.nspname as table_schema,
      cls.relname as table_name,
      obj_description(cls.oid, 'pg_class') as table_comment,
      entities.code as entity_code,
      entities.title as entity_title,
      entities.route_path,
      entities.page_code,
      entities.primary_key
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    left join public.admin_entities entities
      on entities.table_name in (ns.nspname || '.' || cls.relname, cls.relname)
    where cls.relkind in ('r', 'p', 'v', 'm')
      and ns.nspname <> all($1::text[])
    order by
      case when entities.sort_order is null then 1 else 0 end,
      entities.sort_order nulls last,
      ns.nspname,
      cls.relname
  `, [[...INTERNAL_SCHEMAS]]);

  return rows.map((row) => {
    const table: DatabaseTableRef = {
      schema: row.table_schema,
      name: row.table_name,
      fullName: `${row.table_schema}.${row.table_name}`
    };
    const title = row.entity_title?.trim() || tableTitle(table, row.table_comment ?? '');

    return {
      label: `${title} (${table.fullName})`,
      value: table.fullName,
      tableName: table.fullName,
      schema: table.schema,
      name: table.name,
      title,
      comment: row.table_comment ?? '',
      ...(row.entity_code ? { entityCode: row.entity_code } : {}),
      ...(row.page_code ? { pageCode: row.page_code } : {}),
      ...(row.route_path ? { routePath: row.route_path } : {}),
      ...(row.primary_key ? { primaryKey: row.primary_key } : {})
    };
  });
}

export async function readTableColumns(
  client: PoolClient,
  table: DatabaseTableRef
): Promise<DatabaseColumn[]> {
  const { rows } = await client.query<{
    column_name: string;
    ordinal_position: number;
    data_type: string;
    udt_name: string;
    is_nullable: string;
    column_default: string | null;
    column_comment: string | null;
    is_primary_key: boolean;
  }>(`
    select
      cols.column_name,
      cols.ordinal_position,
      cols.data_type,
      cols.udt_name,
      cols.is_nullable,
      cols.column_default,
      col_description(cls.oid, attr.attnum) as column_comment,
      exists (
        select 1
        from information_schema.table_constraints tc
        join information_schema.key_column_usage kcu
          on kcu.constraint_schema = tc.constraint_schema
          and kcu.constraint_name = tc.constraint_name
          and kcu.table_schema = tc.table_schema
          and kcu.table_name = tc.table_name
        where tc.constraint_type = 'PRIMARY KEY'
          and tc.table_schema = cols.table_schema
          and tc.table_name = cols.table_name
          and kcu.column_name = cols.column_name
      ) as is_primary_key
    from information_schema.columns cols
    join pg_namespace ns on ns.nspname = cols.table_schema
    join pg_class cls on cls.relnamespace = ns.oid and cls.relname = cols.table_name
    join pg_attribute attr on attr.attrelid = cls.oid and attr.attname = cols.column_name
    where cols.table_schema = $1
      and cols.table_name = $2
    order by cols.ordinal_position
  `, [table.schema, table.name]);

  return rows.map((row) => ({
    name: row.column_name,
    ordinalPosition: row.ordinal_position,
    dataType: row.data_type,
    udtName: row.udt_name,
    isNullable: row.is_nullable === 'YES',
    hasDefault: Boolean(row.column_default),
    comment: row.column_comment ?? '',
    isPrimaryKey: row.is_primary_key === true
  }));
}

export async function readTableComment(client: PoolClient, table: DatabaseTableRef) {
  const { rows } = await client.query<{ table_comment: string | null }>(`
    select obj_description(cls.oid, 'pg_class') as table_comment
    from pg_class cls
    join pg_namespace ns on ns.oid = cls.relnamespace
    where ns.nspname = $1
      and cls.relname = $2
      and cls.relkind in ('r', 'p', 'v', 'm')
  `, [table.schema, table.name]);

  if (!rows.length) {
    throw new Error(`Table "${table.fullName}" does not exist.`);
  }

  return rows[0].table_comment ?? '';
}

export async function readChildRelations(
  client: PoolClient,
  parentTable: DatabaseTableRef
): Promise<DatabaseChildRelation[]> {
  const { rows } = await client.query<{
    constraint_name: string;
    child_schema: string;
    child_table: string;
    child_column: string;
    parent_column: string;
    ordinal_position: number;
  }>(`
    select
      tc.constraint_name,
      kcu.table_schema as child_schema,
      kcu.table_name as child_table,
      kcu.column_name as child_column,
      ccu.column_name as parent_column,
      kcu.ordinal_position
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
      and kcu.constraint_name = tc.constraint_name
      and kcu.table_schema = tc.table_schema
      and kcu.table_name = tc.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = tc.constraint_schema
      and ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = $1
      and ccu.table_name = $2
    order by kcu.table_schema, kcu.table_name, tc.constraint_name, kcu.ordinal_position
  `, [parentTable.schema, parentTable.name]);

  const byConstraint = new Map<string, DatabaseChildRelation>();

  for (const row of rows) {
    const key = `${row.child_schema}.${row.child_table}.${row.constraint_name}`;
    const existing = byConstraint.get(key);

    if (existing) {
      existing.childColumns.push(row.child_column);
      existing.parentColumns.push(row.parent_column);
      continue;
    }

    byConstraint.set(key, {
      constraintName: row.constraint_name,
      childTable: {
        schema: row.child_schema,
        name: row.child_table,
        fullName: `${row.child_schema}.${row.child_table}`
      },
      childColumns: [row.child_column],
      parentColumns: [row.parent_column]
    });
  }

  return [...byConstraint.values()];
}

export async function inspectTablePage(
  client: PoolClient,
  tableName: string
) {
  const table = readTableRef(tableName);
  const columns = await readTableColumns(client, table);
  const childRelations = await readChildRelations(client, table);
  const comment = await readTableComment(client, table);
  const { rows: entityRows } = await client.query<{ code: string }>(
    `
      select code
      from public.admin_entities
      where table_name in ($1, $2)
      order by sort_order asc, created_at asc
      limit 1
    `,
    [table.fullName, table.name]
  );
  const children: Array<
    DatabaseChildRelation & { columns: DatabaseColumn[]; title: string }
  > = [];

  for (const relation of childRelations) {
    children.push({
      ...relation,
      columns: await readTableColumns(client, relation.childTable),
      title: tableTitle(relation.childTable, await readTableComment(client, relation.childTable))
    });
  }

  return {
    table,
    columns,
    childRelations: children,
    title: tableTitle(table, comment),
    comment,
    entityCode: entityRows[0]?.code
  };
}

export function buildTableListPageSchema(options: TablePageSchemaOptions): LowCodePageSchema {
  const base = toCamelish(`${options.table.schema}_${options.table.name}`);
  const mainSourceKey = sourceKeyFor(options.table);
  const selectedSourceKey = `${base}Selected`;
  const selectedRowsSourceKey = `${base}SelectedRows`;
  const primaryKey = options.primaryKey || preferredPrimaryKey(options.columns);
  const title = options.title?.trim() || tableTitle(options.table);
  const route = options.route?.trim() || `/dashboard/low-code/${normalizeIdentifier(options.code ?? options.table.name, options.table.name)}`;
  const code = options.code?.trim() || normalizeIdentifier(`${options.table.schema}-${options.table.name}`, options.table.name).replace(/_/g, '-');

  const childSourceKeys = options.childRelations.map((relation) =>
    sourceKeyFor(relation.childTable)
  );
  const rowCurrentDirectives = [
    { type: 'setDataSource', sourceKey: selectedSourceKey, value: '{{ event.row }}' },
    { type: 'refreshDataSource', sourceKeys: childSourceKeys }
  ];

  const dataSources: NonNullable<LowCodePageSchema['dataSources']> = {
    [mainSourceKey]: {
      key: mainSourceKey,
      label: `${title}列表`,
      serviceName: 'admin',
      serviceMethod: 'listItems',
      postData: {
        ...(options.entityCode ? { entityCode: options.entityCode } : {}),
        tableName: options.table.fullName,
        limit: 300,
        orderBy: options.columns.some((column) => column.name === 'updated_at')
          ? 'updated_at'
          : primaryKey
      },
      autoLoad: true
    }
  };

  for (const relation of options.childRelations) {
    const sourceKey = sourceKeyFor(relation.childTable);
    dataSources[sourceKey] = {
      key: sourceKey,
      label: relation.title,
      serviceName: 'admin',
      serviceMethod: 'listItems',
      postData: {
        tableName: relation.childTable.fullName,
        filters: Object.fromEntries(
          relation.childColumns.map((childColumn, index) => [
            childColumn,
            `{{ data.${selectedSourceKey}.${relation.parentColumns[index] ?? primaryKey} }}`
          ])
        ),
        requiredFilters: relation.childColumns,
        limit: 500,
        orderBy: relation.columns.some((column) => column.name === 'sort_order')
          ? 'sort_order'
          : relation.columns.some((column) => column.name === 'updated_at')
            ? 'updated_at'
            : preferredPrimaryKey(relation.columns)
      },
      autoLoad: false
    };
  }

  if (!options.childRelations.length) {
    dataSources[selectedRowsSourceKey] = {
      key: selectedRowsSourceKey,
      label: '当前记录',
      serviceName: 'admin',
      serviceMethod: 'listItems',
      postData: {
        ...(options.entityCode ? { entityCode: options.entityCode } : {}),
        tableName: options.table.fullName,
        filters: { [primaryKey]: `{{ data.${selectedSourceKey}.${primaryKey} }}` },
        requiredFilters: [primaryKey],
        limit: 1
      },
      autoLoad: false
    };
    rowCurrentDirectives.push({
      type: 'refreshDataSource',
      sourceKeys: [selectedRowsSourceKey]
    });
  }

  const tabs = options.childRelations.length
    ? options.childRelations.map((relation) => {
        const childSourceKey = sourceKeyFor(relation.childTable);
        const childPrimaryKey = preferredPrimaryKey(relation.columns);
        return {
          key: normalizeIdentifier(relation.childTable.name, 'detail'),
          label: relation.title,
          blocks: [
            {
              id: `${childSourceKey}-grid`,
              kind: 'grid',
              layout: { fillRemaining: true },
              sourceKey: childSourceKey,
              schema: {
                grid: buildGridConfig(relation.columns, childPrimaryKey, '100%'),
                rowActions: { edit: false, delete: false }
              }
            }
          ]
        };
      })
    : [
        {
          key: 'current',
          label: '当前记录',
          blocks: [
            {
              id: `${selectedRowsSourceKey}-grid`,
              kind: 'grid',
              layout: { fillRemaining: true },
              sourceKey: selectedRowsSourceKey,
              schema: {
                grid: buildGridConfig(options.columns, primaryKey, '100%'),
                rowActions: { edit: false, delete: false }
              }
            }
          ]
        }
      ];

  return migrateLowCodePageSchema({
    schemaVersion: 1,
    code,
    route,
    title,
    pageType: 'list',
    ...(options.description?.trim()
      ? { description: options.description.trim() }
      : { description: `自动生成的 ${options.table.fullName} 列表页。` }),
    layout: 'dashboard',
    status: options.status ?? 'published',
    keepAlive: true,
    dataSources,
    blocks: [
      {
        id: `${base}-actions`,
        kind: 'buttonGroup',
        title: `${title}操作`,
        align: 'left',
        gap: 8,
        actions: [
          {
            code: `show-all-${mainSourceKey}`,
            label: '全部',
            status: 'primary',
            icon: 'ri-list-check-2',
            directives: [
              { type: 'setSearchFilters', sourceKey: mainSourceKey, mode: 'replace', values: {} }
            ]
          },
          ...statusFilterActions(mainSourceKey, options.columns),
          {
            code: `refresh-${mainSourceKey}`,
            label: '刷新',
            icon: 'ri-refresh-line',
            directives: [{ type: 'refreshDataSource', sourceKeys: [mainSourceKey] }]
          }
        ]
      },
      {
        id: `${base}-grid`,
        kind: 'grid',
        title: `${title}列表`,
        sourceKey: mainSourceKey,
        schema: {
          title: `${title}列表`,
          events: { rowCurrentChange: rowCurrentDirectives },
          grid: buildGridConfig(options.columns, primaryKey, 420),
          rowActions: { edit: false, delete: false }
        }
      },
      {
        id: `${base}-detail-tabs`,
        kind: 'tabs',
        title: '明细',
        layout: { fillRemaining: true },
        defaultKey: tabs[0]?.key,
        tabs
      }
    ]
  });
}

export async function buildTableListPageSchemaFromDatabase(
  client: PoolClient,
  options: Omit<TablePageSchemaOptions, 'table' | 'columns' | 'childRelations'> & {
    tableName: string;
  }
) {
  const inspection = await inspectTablePage(client, options.tableName);
  return buildTableListPageSchema({
    ...options,
    table: inspection.table,
    columns: inspection.columns,
    childRelations: inspection.childRelations,
    title: options.title ?? inspection.title,
    description: options.description ?? inspection.comment,
    entityCode: options.entityCode ?? inspection.entityCode
  });
}
