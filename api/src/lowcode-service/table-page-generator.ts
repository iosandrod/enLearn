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
  title: string;
  type: FrontendColumnType;
  align: FrontendColumnAlign;
  description: string;
};

export type FrontendColumnType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'time'
  | 'duration'
  | 'json'
  | 'array'
  | 'enum';

export type FrontendColumnAlign = 'left' | 'center' | 'right';

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

const frontendColumnTypes = new Set<FrontendColumnType>([
  'text',
  'number',
  'boolean',
  'date',
  'datetime',
  'time',
  'duration',
  'json',
  'array',
  'enum'
]);

const frontendColumnAlignments = new Set<FrontendColumnAlign>([
  'left',
  'center',
  'right'
]);

function inferFrontendColumnType(dataType: string, udtName: string): FrontendColumnType {
  const normalizedDataType = dataType.toLowerCase();
  const normalizedUdtName = udtName.toLowerCase();

  if (
    normalizedDataType === 'array' ||
    normalizedDataType.endsWith('[]') ||
    normalizedUdtName.startsWith('_')
  ) {
    return 'array';
  }
  if (
    normalizedDataType.includes('json') ||
    ['json', 'jsonb'].includes(normalizedUdtName)
  ) {
    return 'json';
  }
  if (normalizedDataType === 'boolean' || normalizedUdtName === 'bool') return 'boolean';
  if (normalizedDataType === 'date' || normalizedUdtName === 'date') return 'date';
  if (
    normalizedDataType.includes('timestamp') ||
    normalizedUdtName.startsWith('timestamp')
  ) {
    return 'datetime';
  }
  if (
    normalizedDataType.includes('time') ||
    ['time', 'timetz'].includes(normalizedUdtName)
  ) {
    return 'time';
  }
  if (normalizedDataType === 'interval' || normalizedUdtName === 'interval') return 'duration';
  if (
    [
      'integer',
      'bigint',
      'smallint',
      'numeric',
      'decimal',
      'real',
      'double precision'
    ].includes(normalizedDataType) ||
    [
      'int2',
      'int4',
      'int8',
      'numeric',
      'decimal',
      'float4',
      'float8'
    ].includes(normalizedUdtName)
  ) {
    return 'number';
  }

  return 'text';
}

function defaultColumnAlign(type: FrontendColumnType): FrontendColumnAlign {
  if (type === 'number') return 'right';
  if (['boolean', 'date', 'datetime', 'time', 'enum'].includes(type)) return 'center';
  return 'left';
}

function readFrontendColumnType(value: unknown, fallback: FrontendColumnType) {
  return typeof value === 'string' && frontendColumnTypes.has(value as FrontendColumnType)
    ? value as FrontendColumnType
    : fallback;
}

function readFrontendColumnAlign(value: unknown, fallback: FrontendColumnAlign) {
  return typeof value === 'string' && frontendColumnAlignments.has(value as FrontendColumnAlign)
    ? value as FrontendColumnAlign
    : fallback;
}

export function parseColumnComment(
  comment: unknown,
  column: Pick<DatabaseColumn, 'name' | 'dataType' | 'udtName'>
) {
  const rawComment = readStringValue(comment);
  const fallbackType = inferFrontendColumnType(column.dataType, column.udtName);
  const fallbackTitle = humanizeIdentifier(column.name);
  const looksLikeJson = rawComment.startsWith('{') || rawComment.startsWith('[');
  let metadata: Record<string, unknown> | undefined;

  if (looksLikeJson) {
    try {
      const parsed: unknown = JSON.parse(rawComment);
      if (isRecord(parsed)) metadata = parsed;
    } catch {
      // Invalid structured comments fall back to database-derived metadata.
    }
  }

  const title = metadata
    ? readStringValue(metadata.title) || fallbackTitle
    : looksLikeJson
      ? fallbackTitle
      : rawComment || fallbackTitle;
  const type = readFrontendColumnType(metadata?.type, fallbackType);
  const align = readFrontendColumnAlign(metadata?.align, defaultColumnAlign(type));
  const description = metadata
    ? readStringValue(metadata.description)
    : looksLikeJson
      ? ''
      : rawComment;

  return { title, type, align, description };
}

function tableTitle(table: DatabaseTableRef, comment = '') {
  return comment.trim() || humanizeIdentifier(table.name);
}

function columnTitle(column: DatabaseColumn) {
  return column.title;
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
  if (column.type === 'datetime') return datetimeFormatter;
  if (column.type === 'date') return dateFormatter;
  if (column.type === 'boolean') return booleanFormatter;
  if (column.type === 'number') return numberFormatter;

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
    align: column.align,
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

export function mapDatabaseTableOptions(value: unknown): DatabaseTableOption[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.filter(isRecord).map((row) => {
    const table: DatabaseTableRef = {
      schema: readStringValue(row.table_schema),
      name: readStringValue(row.table_name),
      fullName: `${readStringValue(row.table_schema)}.${readStringValue(row.table_name)}`
    };
    const title = readStringValue(row.entity_title) || tableTitle(table, readStringValue(row.table_comment));

    return {
      label: `${title} (${table.fullName})`,
      value: table.fullName,
      tableName: table.fullName,
      schema: table.schema,
      name: table.name,
      title,
      comment: readStringValue(row.table_comment),
      ...(readStringValue(row.entity_code) ? { entityCode: readStringValue(row.entity_code) } : {}),
      ...(readStringValue(row.page_code) ? { pageCode: readStringValue(row.page_code) } : {}),
      ...(readStringValue(row.route_path) ? { routePath: readStringValue(row.route_path) } : {}),
      ...(readStringValue(row.primary_key) ? { primaryKey: readStringValue(row.primary_key) } : {})
    };
  }).filter((row) => row.schema && row.name);
}

export function normalizeTablePageInspection(value: unknown) {
  if (!isRecord(value) || !isRecord(value.table)) {
    throw new Error('Low-code table metadata RPC returned an invalid inspection.');
  }
  const table: DatabaseTableRef = {
    schema: readStringValue(value.table.schema),
    name: readStringValue(value.table.name),
    fullName: readStringValue(value.table.fullName)
  };
  if (!table.schema || !table.name || !table.fullName) {
    throw new Error('Low-code table metadata RPC returned an invalid table reference.');
  }
  const columns = readColumns(value.columns);
  const childRelations = Array.isArray(value.childRelations)
    ? value.childRelations.filter(isRecord).map((relation) => {
        if (!isRecord(relation.childTable)) {
          throw new Error('Low-code table metadata RPC returned an invalid child relation.');
        }
        return {
          constraintName: readStringValue(relation.constraintName),
          childTable: {
            schema: readStringValue(relation.childTable.schema),
            name: readStringValue(relation.childTable.name),
            fullName: readStringValue(relation.childTable.fullName)
          },
          childColumns: readStringArray(relation.childColumns),
          parentColumns: readStringArray(relation.parentColumns),
          columns: readColumns(relation.columns),
          title: readStringValue(relation.title)
        };
      })
    : [];
  const comment = readStringValue(value.comment);
  return {
    table,
    columns,
    childRelations,
    title: tableTitle(table, comment),
    comment,
    entityCode: readStringValue(value.entityCode) || undefined
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

export function buildTableListPageSchemaFromMetadata(
  metadata: unknown,
  options: Omit<TablePageSchemaOptions, 'table' | 'columns' | 'childRelations'> & {
    tableName: string;
  }
) {
  const inspection = normalizeTablePageInspection(metadata);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.map(readStringValue).filter(Boolean) : [];
}

export function normalizeDatabaseColumns(value: unknown): DatabaseColumn[] {
  if (!Array.isArray(value)) return [];

  return value.filter(isRecord).map((column) => {
    const baseColumn = {
      name: readStringValue(column.name),
      ordinalPosition: Number(column.ordinalPosition) || 0,
      dataType: readStringValue(column.dataType),
      udtName: readStringValue(column.udtName),
      isNullable: column.isNullable === true,
      hasDefault: column.hasDefault === true,
      comment: readStringValue(column.comment),
      isPrimaryKey: column.isPrimaryKey === true
    };

    return {
      ...baseColumn,
      ...parseColumnComment(baseColumn.comment, baseColumn)
    };
  }).filter((column) => column.name);
}

const readColumns = normalizeDatabaseColumns;
