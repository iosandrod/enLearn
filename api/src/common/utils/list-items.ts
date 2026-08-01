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
  sorts?: unknown;
  search?: unknown;
  searchFields?: unknown;
  search_fields?: unknown;
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

type ListItemsEntityRow = {
  code: string;
  table_name: string;
  primary_key: string | null;
  schema: unknown;
  query_sql?: string | null;
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
  if (entity.code === 'users') {
    return `
      with role_summary as (
        select
          user_roles.user_id,
          array_agg(distinct roles.code order by roles.code) as role_codes,
          string_agg(distinct roles.name, ', ' order by roles.name) as role_names
        from public.admin_user_roles user_roles
        join public.admin_roles roles on roles.id = user_roles.role_id
        where roles.status = 'active'
        group by user_roles.user_id
      ),
      permission_summary as (
        select
          user_roles.user_id,
          array_agg(distinct permissions.code order by permissions.code) as permission_codes,
          string_agg(distinct permissions.name, ', ' order by permissions.name) as permission_names,
          count(distinct permissions.id)::integer as permission_count
        from public.admin_user_roles user_roles
        join public.admin_roles roles on roles.id = user_roles.role_id
        join public.admin_role_permissions role_permissions on role_permissions.role_id = roles.id
        join public.admin_permissions permissions on permissions.id = role_permissions.permission_id
        where roles.status = 'active'
          and permissions.status = 'active'
        group by user_roles.user_id
      ),
      account_summary as (
        select
          memberships.user_id,
          array_agg(accounts.id order by accounts.personal_account desc, accounts.created_at asc) as account_ids,
          string_agg(
            coalesce(accounts.name, accounts.slug, accounts.id::text),
            ', '
            order by accounts.personal_account desc, accounts.created_at asc
          ) as account_names,
          array_agg(distinct memberships.account_role::text order by memberships.account_role::text) as account_roles,
          count(*)::integer as account_count,
          (array_agg(accounts.id order by accounts.created_at asc) filter (where accounts.personal_account))[1] as personal_account_id,
          (array_agg(accounts.name order by accounts.created_at asc) filter (where accounts.personal_account))[1] as personal_account_name,
          bool_or(accounts.primary_owner_user_id = memberships.user_id) as is_primary_account_owner
        from basejump.account_user memberships
        join basejump.accounts accounts on accounts.id = memberships.account_id
        group by memberships.user_id
      )
      select
        users.*,
        users.id as user_id,
        auth_users.email::text,
        users.role as legacy_profile_role,
        coalesce(role_summary.role_codes, '{}'::text[]) as app_role_codes,
        coalesce(role_summary.role_names, '') as app_role_names,
        coalesce(role_summary.role_codes, '{}'::text[]) as role_codes,
        coalesce(role_summary.role_names, '') as role_names,
        coalesce(permission_summary.permission_codes, '{}'::text[]) as permission_codes,
        coalesce(permission_summary.permission_names, '') as permission_names,
        coalesce(permission_summary.permission_count, 0) as permission_count,
        coalesce(account_summary.account_ids, '{}'::uuid[]) as account_ids,
        coalesce(account_summary.account_names, '') as account_names,
        coalesce(account_summary.account_roles, '{}'::text[]) as account_roles,
        coalesce(account_summary.account_count, 0) as account_count,
        account_summary.personal_account_id,
        account_summary.personal_account_name,
        coalesce(account_summary.is_primary_account_owner, false) as is_primary_account_owner
      from public.users users
      left join auth.users auth_users on auth_users.id = users.id
      left join role_summary on role_summary.user_id = users.id
      left join permission_summary on permission_summary.user_id = users.id
      left join account_summary on account_summary.user_id = users.id
    `;
  }

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

function hasOperator(value: JsonRecord) {
  return typeof value.op === 'string' && value.op.trim().length > 0;
}

function normalizeFilterOp(value: unknown) {
  return readOptionalString(value).replace(/_/g, '').toLowerCase();
}

function pushValue(values: unknown[], value: unknown) {
  values.push(value);
  return '$' + values.length;
}

function makeLikeValue(value: unknown, mode: 'contains' | 'startsWith' | 'endsWith') {
  const text = String(value);
  if (mode === 'startsWith') return text + '%';
  if (mode === 'endsWith') return '%' + text;
  return '%' + text + '%';
}

function buildFieldCondition(
  values: unknown[],
  columnNames: Set<string>,
  field: string,
  value: unknown
): string {
  assertIdentifier(field, 'filter field');
  if (!columnNames.has(field)) return '';

  const column = quoteIdentifier(field);

  if (Array.isArray(value)) {
    const hasConditionItems = value.some((item) => isRecord(item) && hasOperator(item));
    if (hasConditionItems) {
      const parts = value
        .map((item) => buildFieldCondition(values, columnNames, field, item))
        .filter(Boolean);
      return parts.length ? '(' + parts.join(' and ') + ')' : '';
    }

    if (!value.length) return 'false';
    return column + ' = any(' + pushValue(values, value) + ')';
  }

  if (isRecord(value) && hasOperator(value)) {
    const op = normalizeFilterOp(value.op);
    const operand = value.value;

    if (op === 'isnull') return column + ' is null';
    if (op === 'isnotnull') return column + ' is not null';

    if (op === 'in' || op === 'notin') {
      const items = Array.isArray(operand) ? operand : [];
      if (!items.length) return op === 'in' ? 'false' : '';
      return column + (op === 'in' ? ' = any(' : ' <> all(') + pushValue(values, items) + ')';
    }

    if (op === 'between') {
      const items = Array.isArray(operand) ? operand : [];
      if (items.length < 2 || isEmptyFilterValue(items[0]) || isEmptyFilterValue(items[1])) return '';
      const startParam = pushValue(values, items[0]);
      const endParam = pushValue(values, items[1]);
      return column + ' between ' + startParam + ' and ' + endParam;
    }

    if (['like', 'ilike', 'notlike', 'notilike', 'startswith', 'endswith'].includes(op)) {
      if (isEmptyFilterValue(operand)) return '';
      const sqlOp = op === 'like' || op === 'startswith' || op === 'endswith'
        ? 'like'
        : op === 'notlike'
          ? 'not like'
          : op === 'notilike'
            ? 'not ilike'
            : 'ilike';
      const mode = op === 'startswith' ? 'startsWith' : op === 'endswith' ? 'endsWith' : 'contains';
      return column + ' ' + sqlOp + ' ' + pushValue(values, makeLikeValue(operand, mode));
    }

    const operatorByOp: Record<string, string> = {
      eq: '=',
      ne: '<>',
      gt: '>',
      gte: '>=',
      lt: '<',
      lte: '<=',
      contains: '@>',
      containedby: '<@',
      overlaps: '&&',
      haskey: '?',
      hasanykeys: '?|',
      hasallkeys: '?&'
    };

    const operator = operatorByOp[op];
    if (!operator) {
      throw new Error('Unsupported filter operator: ' + value.op);
    }

    if (isEmptyFilterValue(operand)) return '';

    if (op === 'hasanykeys' || op === 'hasallkeys') {
      const keys = readStringArray(operand);
      if (!keys.length) return '';
      return column + ' ' + operator + ' ' + pushValue(values, keys) + '::text[]';
    }

    return column + ' ' + operator + ' ' + pushValue(values, operand);
  }

  if (value === null) return column + ' is null';
  if (isEmptyFilterValue(value)) return '';
  return column + ' = ' + pushValue(values, value);
}

function buildFilterExpression(
  values: unknown[],
  columnNames: Set<string>,
  filters: unknown
): string {
  if (!isRecord(filters)) return '';

  if (Array.isArray(filters.conditions)) {
    const logic = readOptionalString(filters.logic).toLowerCase() === 'or' ? 'or' : 'and';
    const parts = filters.conditions
      .map((condition) => {
        if (isRecord(condition) && typeof condition.field === 'string') {
          return buildFieldCondition(values, columnNames, condition.field, condition);
        }
        return buildFilterExpression(values, columnNames, condition);
      })
      .filter(Boolean);

    return parts.length ? '(' + parts.join(' ' + logic + ' ') + ')' : '';
  }

  const parts = Object.entries(filters)
    .filter(([field]) => field !== 'logic' && field !== 'conditions')
    .map(([field, value]) => buildFieldCondition(values, columnNames, field, value))
    .filter(Boolean);

  return parts.length ? '(' + parts.join(' and ') + ')' : '';
}

function filterHasNonEmptyFieldValue(filters: unknown, field: string): boolean {
  if (!isRecord(filters)) return false;

  if (Array.isArray(filters.conditions)) {
    return filters.conditions.some((condition) => {
      if (isRecord(condition) && condition.field === field) {
        const op = normalizeFilterOp(condition.op);
        if (op === 'isnull' || op === 'isnotnull') return true;
        return !isEmptyFilterValue(condition.value);
      }

      return filterHasNonEmptyFieldValue(condition, field);
    });
  }

  const value = filters[field];
  if (isRecord(value) && hasOperator(value)) {
    const op = normalizeFilterOp(value.op);
    return op === 'isnull' || op === 'isnotnull' || !isEmptyFilterValue(value.value);
  }

  return !isEmptyFilterValue(value);
}

function readListConfig(entity: ListItemsEntity) {
  return isRecord(entity.schema.list) ? entity.schema.list : {};
}

function readSearchFields(
  options: ListItemsOptions,
  entity: ListItemsEntity,
  columnNames: Set<string>
) {
  const listConfig = readListConfig(entity);
  const fields = readStringArray(options.searchFields ?? options.search_fields);
  const configuredFields = readStringArray(listConfig.searchFields ?? listConfig.search_fields);

  return (fields.length ? fields : configuredFields).filter((field) => {
    assertIdentifier(field, 'search field');
    return columnNames.has(field);
  });
}

function buildSearchExpression(
  values: unknown[],
  columnNames: Set<string>,
  options: ListItemsOptions,
  entity: ListItemsEntity
) {
  const search = readOptionalString(options.search);
  if (!search) return '';

  const fields = readSearchFields(options, entity, columnNames);
  if (!fields.length) return '';

  const parts = fields.map((field) => {
    const param = pushValue(values, '%' + search + '%');
    return quoteIdentifier(field) + '::text ilike ' + param;
  });

  return '(' + parts.join(' or ') + ')';
}

function readSorts(options: ListItemsOptions, entity: ListItemsEntity, columnNames: Set<string>) {
  const sorts = Array.isArray(options.sorts) ? options.sorts : [];
  const normalizedSorts = sorts
    .filter(isRecord)
    .map((sort) => ({
      field: readOptionalString(sort.field),
      direction: normalizeDirection(sort.direction),
      nulls: readOptionalString(sort.nulls).toLowerCase() === 'first' ? 'first' : 'last'
    }))
    .filter((sort) => {
      if (!sort.field) return false;
      assertIdentifier(sort.field, 'sort field');
      return columnNames.has(sort.field);
    })
    .slice(0, 5);

  if (normalizedSorts.length) {
    return normalizedSorts;
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

  return [{
    field: orderBy,
    direction: normalizeDirection(options.orderDirection ?? options.order_direction),
    nulls: 'last'
  }];
}

function isMemoryNullish(value: unknown) {
  return value === undefined || value === null || value === '';
}

function compareMemoryValues(left: unknown, right: unknown) {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  const leftTime = typeof left === 'string' || left instanceof Date ? Date.parse(String(left)) : Number.NaN;
  const rightTime = typeof right === 'string' || right instanceof Date ? Date.parse(String(right)) : Number.NaN;
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) return leftTime - rightTime;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

function memoryIncludes(source: unknown, operand: unknown) {
  if (Array.isArray(source)) {
    if (Array.isArray(operand)) return operand.every((item) => source.includes(item));
    return source.includes(operand);
  }

  if (typeof source === 'string') {
    return source.includes(String(operand));
  }

  if (isRecord(source) && isRecord(operand)) {
    return Object.entries(operand).every(([key, value]) => source[key] === value);
  }

  return false;
}

function memoryContainedBy(source: unknown, operand: unknown) {
  if (Array.isArray(source) && Array.isArray(operand)) {
    return source.every((item) => operand.includes(item));
  }

  if (isRecord(source) && isRecord(operand)) {
    return Object.entries(source).every(([key, value]) => operand[key] === value);
  }

  return false;
}

function memoryOverlaps(source: unknown, operand: unknown) {
  return Array.isArray(source) && Array.isArray(operand) && source.some((item) => operand.includes(item));
}

function matchMemoryField(rowValue: unknown, filterValue: unknown): boolean {
  if (Array.isArray(filterValue)) {
    const hasConditionItems = filterValue.some((item) => isRecord(item) && hasOperator(item));
    if (hasConditionItems) {
      return filterValue.every((item) => matchMemoryField(rowValue, item));
    }

    return filterValue.includes(rowValue);
  }

  if (isRecord(filterValue) && hasOperator(filterValue)) {
    const op = normalizeFilterOp(filterValue.op);
    const operand = filterValue.value;

    if (op === 'isnull') return rowValue === undefined || rowValue === null;
    if (op === 'isnotnull') return rowValue !== undefined && rowValue !== null;
    if (op === 'in') return Array.isArray(operand) && operand.includes(rowValue);
    if (op === 'notin') return Array.isArray(operand) && !operand.includes(rowValue);
    if (op === 'between') {
      const items = Array.isArray(operand) ? operand : [];
      if (items.length < 2) return true;
      return compareMemoryValues(rowValue, items[0]) >= 0 && compareMemoryValues(rowValue, items[1]) <= 0;
    }

    if (['like', 'ilike', 'notlike', 'notilike', 'startswith', 'endswith'].includes(op)) {
      if (isMemoryNullish(operand)) return true;
      const source = String(rowValue ?? '');
      const target = String(operand);
      const caseInsensitive = op === 'ilike' || op === 'notilike';
      const left = caseInsensitive ? source.toLowerCase() : source;
      const right = caseInsensitive ? target.toLowerCase() : target;
      const matched = op === 'startswith'
        ? left.startsWith(right)
        : op === 'endswith'
          ? left.endsWith(right)
          : left.includes(right);
      return op === 'notlike' || op === 'notilike' ? !matched : matched;
    }

    if (isMemoryNullish(operand) && op !== 'eq' && op !== 'ne') return true;

    switch (op) {
      case 'eq':
        return rowValue === operand;
      case 'ne':
        return rowValue !== operand;
      case 'gt':
        return compareMemoryValues(rowValue, operand) > 0;
      case 'gte':
        return compareMemoryValues(rowValue, operand) >= 0;
      case 'lt':
        return compareMemoryValues(rowValue, operand) < 0;
      case 'lte':
        return compareMemoryValues(rowValue, operand) <= 0;
      case 'contains':
        return memoryIncludes(rowValue, operand);
      case 'containedby':
        return memoryContainedBy(rowValue, operand);
      case 'overlaps':
        return memoryOverlaps(rowValue, operand);
      case 'haskey':
        return isRecord(rowValue) && typeof operand === 'string' && operand in rowValue;
      case 'hasanykeys':
        return isRecord(rowValue) && readStringArray(operand).some((key) => key in rowValue);
      case 'hasallkeys':
        return isRecord(rowValue) && readStringArray(operand).every((key) => key in rowValue);
      default:
        throw new Error('Unsupported filter operator: ' + filterValue.op);
    }
  }

  if (filterValue === null) return rowValue === null || rowValue === undefined;
  if (isMemoryNullish(filterValue)) return true;
  return rowValue === filterValue;
}

function matchMemoryFilters(row: JsonRecord, filters: unknown): boolean {
  if (!isRecord(filters)) return true;

  if (Array.isArray(filters.conditions)) {
    const logic = readOptionalString(filters.logic).toLowerCase() === 'or' ? 'or' : 'and';
    const results = filters.conditions.map((condition) => {
      if (isRecord(condition) && typeof condition.field === 'string') {
        return matchMemoryField(row[condition.field], condition);
      }

      return matchMemoryFilters(row, condition);
    });

    return logic === 'or' ? results.some(Boolean) : results.every(Boolean);
  }

  return Object.entries(filters)
    .filter(([field]) => field !== 'logic' && field !== 'conditions')
    .every(([field, value]) => matchMemoryField(row[field], value));
}

function readMemorySearchFields(rows: JsonRecord[], options: ListItemsOptions) {
  const requestedFields = readStringArray(options.searchFields ?? options.search_fields);
  if (requestedFields.length) return requestedFields;
  const fieldSet = new Set<string>();
  rows.forEach((row) => {
    Object.entries(row).forEach(([field, value]) => {
      if (['string', 'number', 'boolean'].includes(typeof value)) fieldSet.add(field);
    });
  });
  return Array.from(fieldSet);
}

function matchMemorySearch(row: JsonRecord, rows: JsonRecord[], options: ListItemsOptions) {
  const search = readOptionalString(options.search);
  if (!search) return true;
  const normalizedSearch = search.toLowerCase();
  return readMemorySearchFields(rows, options).some((field) =>
    String(row[field] ?? '').toLowerCase().includes(normalizedSearch)
  );
}

function readMemorySorts(rows: JsonRecord[], options: ListItemsOptions) {
  const columnNames = new Set(rows.flatMap((row) => Object.keys(row)));
  const sorts = Array.isArray(options.sorts) ? options.sorts : [];
  const normalizedSorts = sorts
    .filter(isRecord)
    .map((sort) => ({
      field: readOptionalString(sort.field),
      direction: normalizeDirection(sort.direction),
      nulls: readOptionalString(sort.nulls).toLowerCase() === 'first' ? 'first' : 'last'
    }))
    .filter((sort) => sort.field && columnNames.has(sort.field))
    .slice(0, 5);

  if (normalizedSorts.length) return normalizedSorts;

  const requestedOrderBy = readOptionalString(options.orderBy ?? options.order_by);
  const orderBy = requestedOrderBy && columnNames.has(requestedOrderBy)
    ? requestedOrderBy
    : columnNames.has('updated_at')
      ? 'updated_at'
      : columnNames.has('created_at')
        ? 'created_at'
        : Array.from(columnNames)[0] ?? '';

  return orderBy ? [{
    field: orderBy,
    direction: normalizeDirection(options.orderDirection ?? options.order_direction),
    nulls: 'last'
  }] : [];
}

export function filterListItemsRows(rows: JsonRecord[], options: ListItemsOptions) {
  const filteredRows = rows.filter((row) =>
    matchMemoryFilters(row, options.filters) && matchMemorySearch(row, rows, options)
  );

  const sortedRows = [...filteredRows];
  const sorts = readMemorySorts(sortedRows, options);
  sortedRows.sort((left, right) => {
    for (const sort of sorts) {
      const leftValue = left[sort.field];
      const rightValue = right[sort.field];
      const leftEmpty = leftValue === undefined || leftValue === null;
      const rightEmpty = rightValue === undefined || rightValue === null;
      if (leftEmpty || rightEmpty) {
        if (leftEmpty && rightEmpty) continue;
        return leftEmpty
          ? sort.nulls === 'first' ? -1 : 1
          : sort.nulls === 'first' ? 1 : -1;
      }

      const result = compareMemoryValues(leftValue, rightValue);
      if (result !== 0) return sort.direction === 'asc' ? result : -result;
    }

    return 0;
  });

  const pageSizeInput = options.pageSize ?? options.page_size ?? options.limit;
  const limit = readPositiveInteger(pageSizeInput, 300, 1000);
  const page = readPositiveInteger(options.page, 1, 100000);
  const explicitOffset = Math.trunc(readNumber(options.offset, -1));
  const offset = explicitOffset >= 0 ? explicitOffset : (page - 1) * limit;

  return sortedRows.slice(offset, offset + limit);
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
  const hasQuerySqlColumn = await hasAdminEntitiesQuerySqlColumn(client);
  const selectQuerySql = hasQuerySqlColumn
    ? 'entities.query_sql'
    : `null::text`;
  const { rows } = await client.query<ListItemsEntityRow>(
    `
      select
        entities.code,
        entities.table_name,
        entities.primary_key,
        entities.schema,
        ${selectQuerySql} as query_sql
      from public.admin_entities entities
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

async function hasAdminEntitiesQuerySqlColumn(client: PoolClient) {
  const { rows } = await client.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'admin_entities'
          and column_name = 'query_sql'
      ) as exists
    `
  );

  return rows[0]?.exists === true;
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
    if (!filterHasNonEmptyFieldValue(filters, requiredFilter)) {
      return [];
    }
  }

  const values: unknown[] = [];
  const whereParts = [
    buildFilterExpression(values, columnNames, filters),
    buildSearchExpression(values, columnNames, options, entity)
  ].filter(Boolean);
  const sorts = readSorts(options, entity, columnNames);
  const orderSql = sorts
    .map((sort) =>
      quoteIdentifier(sort.field) + ' ' + sort.direction + ' nulls ' + sort.nulls
    )
    .join(', ');

  const pageSizeInput = options.pageSize ?? options.page_size ?? options.limit;
  const limit = readPositiveInteger(pageSizeInput, 300, 1000);
  const page = readPositiveInteger(options.page, 1, 100000);
  const explicitOffset = Math.trunc(readNumber(options.offset, -1));
  const offset = explicitOffset >= 0 ? explicitOffset : (page - 1) * limit;

  const whereSql = whereParts.length ? `where ${whereParts.join(' and ')}` : '';
  const limitParam = values.push(limit);
  const offsetParam = values.push(offset);
  const rowsSql = `
    select *
    from (${sourceSql}) list_items_source
    ${whereSql}
    order by ${orderSql}
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
