import type { PoolClient } from 'pg';

type JsonRecord = Record<string, unknown>;

export type ListItemsOptions = {
  entityCode?: unknown;
  entity_code?: unknown;
  tableName?: unknown;
  table_name?: unknown;
  filters?: unknown;
  requiredFilters?: unknown;
  required_filters?: unknown;
  limit?: unknown;
  page?: unknown;
  pageSize?: unknown;
  page_size?: unknown;
  offset?: unknown;
  orderBy?: unknown;
  order_by?: unknown;
  orderDirection?: unknown;
  order_direction?: unknown;
  withCount?: unknown;
  with_count?: unknown;
  responseMode?: unknown;
  response_mode?: unknown;
};

export type ListItemsEntity = {
  code: string;
  tableName: string;
  primaryKey: string;
  schema: JsonRecord;
  querySql: string;
};

type TableRef = {
  schema: string;
  name: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readOptionalString(item)).filter(Boolean)
    : [];
}

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new Error(`${fieldName} must be a valid identifier.`);
  }
}

function readTableRef(value: string, fieldName = 'tableName'): TableRef {
  const parts = value.trim().split('.');
  if (parts.length > 2) {
    throw new Error(`${fieldName} must be table or schema.table.`);
  }

  const schema = parts.length === 2 ? parts[0] : 'public';
  const name = parts.length === 2 ? parts[1] : parts[0];
  assertIdentifier(schema, `${fieldName}.schema`);
  assertIdentifier(name, `${fieldName}.name`);

  return { schema, name };
}

function quoteIdentifier(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteTable(table: TableRef) {
  return `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`;
}

function normalizeDirection(value: unknown) {
  return value === 'asc' || value === 'ASC' ? 'asc' : 'desc';
}

function isEmptyFilterValue(value: unknown) {
  if (Array.isArray(value)) return value.length === 0;
  return value === undefined || value === null || value === '';
}

function readPositiveInteger(value: unknown, fallback: number, max: number) {
  const nextValue = Math.trunc(readNumber(value, fallback));
  return Math.min(Math.max(nextValue, 1), max);
}

function readEntitySchema(value: unknown) {
  return isRecord(value) ? value : {};
}

function normalizeRegisteredTableName(value: string) {
  const table = readTableRef(value);
  return `${table.schema}.${table.name}`;
}

function assertReadOnlySql(sql: string) {
  const normalizedSql = sql.trim();
  const compact = normalizedSql.toLowerCase().replace(/\s+/g, ' ');

  if (!compact.startsWith('select ') && !compact.startsWith('with ')) {
    throw new Error('Entity query_sql must be a SELECT statement.');
  }

  if (
    normalizedSql.includes(';') ||
    /(^|[^a-z_])(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|do|execute)([^a-z_]|$)/i.test(
      compact
    )
  ) {
    throw new Error('Entity query_sql must be a single read-only SELECT statement.');
  }
}

function sourceSqlForEntity(entity: ListItemsEntity) {
  if (entity.querySql) {
    assertReadOnlySql(entity.querySql);
    return entity.querySql.trim();
  }

  const table = readTableRef(entity.tableName);
  return `select * from ${quoteTable(table)}`;
}

async function readSourceColumnNames(client: PoolClient, sourceSql: string) {
  const { fields } = await client.query(`select * from (${sourceSql}) list_items_source where false`);
  return new Set(fields.map((field) => field.name));
}

function readDefaultOrderBy(entity: ListItemsEntity) {
  const listConfig = isRecord(entity.schema.list) ? entity.schema.list : {};
  return readOptionalString(listConfig.orderBy ?? listConfig.order_by) || entity.primaryKey;
}

function normalizeFilters(value: unknown) {
  return isRecord(value) ? value : {};
}

function pushFilter(
  whereParts: string[],
  values: unknown[],
  columnNames: Set<string>,
  field: string,
  value: unknown
) {
  assertIdentifier(field, 'filter field');
  if (!columnNames.has(field) || isEmptyFilterValue(value)) return;

  if (isRecord(value)) {
    const op = readOptionalString(value.op).toLowerCase();
    const operand = value.value;

    if (op === 'in') {
      const items = Array.isArray(operand) ? operand : [];
      if (!items.length) {
        whereParts.push('false');
        return;
      }

      values.push(items);
      whereParts.push(`${quoteIdentifier(field)} = any($${values.length})`);
      return;
    }

    if (op === 'like' || op === 'ilike') {
      if (isEmptyFilterValue(operand)) return;
      values.push(`%${String(operand)}%`);
      whereParts.push(`${quoteIdentifier(field)} ${op} $${values.length}`);
      return;
    }

    if (['eq', 'ne', 'gt', 'gte', 'lt', 'lte'].includes(op)) {
      if (isEmptyFilterValue(operand)) return;
      const operatorByOp: Record<string, string> = {
        eq: '=',
        ne: '<>',
        gt: '>',
        gte: '>=',
        lt: '<',
        lte: '<='
      };
      values.push(operand);
      whereParts.push(`${quoteIdentifier(field)} ${operatorByOp[op]} $${values.length}`);
      return;
    }
  }

  if (Array.isArray(value)) {
    if (!value.length) {
      whereParts.push('false');
      return;
    }

    values.push(value);
    whereParts.push(`${quoteIdentifier(field)} = any($${values.length})`);
    return;
  }

  if (value === null) {
    whereParts.push(`${quoteIdentifier(field)} is null`);
    return;
  }

  values.push(value);
  whereParts.push(`${quoteIdentifier(field)} = $${values.length}`);
}

export async function resolveListItemsEntity(
  client: PoolClient,
  options: ListItemsOptions
): Promise<ListItemsEntity> {
  const entityCode = readOptionalString(options.entityCode ?? options.entity_code);
  const tableName = readOptionalString(options.tableName ?? options.table_name);

  if (!entityCode && !tableName) {
    throw new Error('entityCode or tableName is required.');
  }

  const normalizedTableName = tableName ? normalizeRegisteredTableName(tableName) : '';
  const tableAlias = tableName && !tableName.includes('.') ? `public.${tableName}` : tableName;
  const { rows } = await client.query<{
    code: string;
    table_name: string;
    primary_key: string | null;
    schema: unknown;
    query_sql: string | null;
  }>(
    `
      select code, table_name, primary_key, schema, query_sql
      from public.admin_entities
      where status = 'active'
        and (
          ($1 <> '' and code = $1)
          or ($2 <> '' and table_name in ($2, $3, $4))
        )
      order by
        case when code = $1 then 0 else 1 end,
        sort_order asc,
        created_at asc
      limit 1
    `,
    [entityCode, tableName, tableAlias, normalizedTableName]
  );

  const entity = rows[0];
  if (!entity) {
    throw new Error('Entity is not registered or inactive.');
  }

  return {
    code: entity.code,
    tableName: entity.table_name,
    primaryKey: entity.primary_key || 'id',
    schema: readEntitySchema(entity.schema),
    querySql: entity.query_sql?.trim() ?? ''
  };
}

export function readEntityReadPermissions(entity: ListItemsEntity, extraCodes: string[] = []) {
  const listConfig = isRecord(entity.schema.list) ? entity.schema.list : {};
  const schemaPermissions = [
    ...readStringArray(entity.schema.readPermissions),
    ...readStringArray(entity.schema.read_permissions),
    ...readStringArray(listConfig.readPermissions),
    ...readStringArray(listConfig.read_permissions)
  ];

  return [...new Set([...schemaPermissions, ...extraCodes].filter(Boolean))];
}

export async function readEntityPermissionCodes(
  client: PoolClient,
  entity: Pick<ListItemsEntity, 'code' | 'tableName'>
) {
  const { rows } = await client.query<{ code: string }>(
    `
      select code
      from public.admin_permissions
      where status = 'active'
        and (
          entity_code = $1
          or (resource_type = 'entity' and resource_key in ($1, $2))
        )
      order by sort_order asc, created_at asc
    `,
    [entity.code, entity.tableName]
  );

  return rows.map((row) => row.code).filter(Boolean);
}

export async function listItemsFromEntity(
  client: PoolClient,
  entity: ListItemsEntity,
  options: ListItemsOptions
) {
  const sourceSql = sourceSqlForEntity(entity);
  const columnNames = await readSourceColumnNames(client, sourceSql);
  const filters = normalizeFilters(options.filters);
  const requiredFilters = readStringArray(options.requiredFilters ?? options.required_filters);

  for (const requiredFilter of requiredFilters) {
    assertIdentifier(requiredFilter, 'required filter');
    if (isEmptyFilterValue(filters[requiredFilter])) {
      return [];
    }
  }

  const values: unknown[] = [];
  const whereParts: string[] = [];
  for (const [field, value] of Object.entries(filters)) {
    pushFilter(whereParts, values, columnNames, field, value);
  }

  const requestedOrderBy = readOptionalString(options.orderBy ?? options.order_by);
  const defaultOrderBy = readDefaultOrderBy(entity);
  const orderBy = requestedOrderBy && columnNames.has(requestedOrderBy)
    ? requestedOrderBy
    : defaultOrderBy && columnNames.has(defaultOrderBy)
      ? defaultOrderBy
      : columnNames.has('updated_at')
        ? 'updated_at'
        : columnNames.has('created_at')
          ? 'created_at'
          : Array.from(columnNames)[0];
  assertIdentifier(orderBy, 'orderBy');

  const pageSizeInput = options.pageSize ?? options.page_size ?? options.limit;
  const limit = readPositiveInteger(pageSizeInput, 300, 1000);
  const page = readPositiveInteger(options.page, 1, 100000);
  const explicitOffset = Math.trunc(readNumber(options.offset, -1));
  const offset = explicitOffset >= 0 ? explicitOffset : (page - 1) * limit;
  const direction = normalizeDirection(options.orderDirection ?? options.order_direction);

  const whereSql = whereParts.length ? `where ${whereParts.join(' and ')}` : '';
  const limitParam = values.push(limit);
  const offsetParam = values.push(offset);
  const rowsSql = `
    select *
    from (${sourceSql}) list_items_source
    ${whereSql}
    order by ${quoteIdentifier(orderBy)} ${direction} nulls last
    limit $${limitParam}
    offset $${offsetParam}
  `;

  const { rows } = await client.query<JsonRecord>(rowsSql, values);
  const withCount = readBoolean(options.withCount ?? options.with_count, false);
  const responseMode = readOptionalString(options.responseMode ?? options.response_mode);

  if (!withCount && responseMode !== 'page') {
    return rows;
  }

  const { rows: countRows } = await client.query<{ total: string }>(
    `
      select count(*)::text as total
      from (${sourceSql}) list_items_source
      ${whereSql}
    `,
    values.slice(0, values.length - 2)
  );

  return {
    rows,
    total: Number(countRows[0]?.total ?? 0),
    page,
    pageSize: limit
  };
}
