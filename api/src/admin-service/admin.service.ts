import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  BaseService,
  type HookContext,
  type ServiceHooks
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  clearAllUserAuthorizationCaches,
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission,
  requireAdmin
} from '../common/utils/supabase';
import { listActiveAccountUserIds, requireActiveAccount } from '../common/utils/account-context';
import {
  ADMIN_NAVIGATION_SELECT,
  selectAuthorizedNavigationRoutes
} from './admin-navigation';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, name: string, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (fallback) return fallback;
  throw new BadRequestException(`Missing required field: ${name}`);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

type OptionSourceType = 'dict' | 'table' | 'view' | 'rpc' | 'sql';

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (isRecord(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) return parsed;
    } catch {
      throw new BadRequestException('Invalid JSON payload.');
    }
  }
  return fallback;
}

function normalizeOptionSourceType(value: unknown): OptionSourceType {
  return ['dict', 'table', 'view', 'rpc', 'sql'].includes(readOptionalString(value))
    ? readOptionalString(value) as OptionSourceType
    : 'dict';
}

function readBooleanLike(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function readPositiveLimit(value: unknown, fallback = 200, max = 1000) {
  return Math.min(Math.max(Math.trunc(readNumber(value, fallback)), 1), max);
}

function readConfigString(
  config: Record<string, unknown>,
  keys: string[],
  fallback = ''
) {
  for (const key of keys) {
    const value = readOptionalString(config[key]);
    if (value) return value;
  }
  return fallback;
}

function readPathValue(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    return isRecord(current) ? current[segment] : undefined;
  }, source);
}

function assertIdentifier(value: string, fieldName: string) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) {
    throw new BadRequestException(`${fieldName} must be a valid identifier.`);
  }
}

function assertIdentifierPath(value: string, fieldName: string) {
  value.split('.').forEach((segment) => assertIdentifier(segment, fieldName));
}

function readRelationIdentifier(value: unknown, fieldName: string) {
  const relation = readString(value, fieldName);
  const parts = relation.split('.');
  if (parts.length > 2) {
    throw new BadRequestException(`${fieldName} must be table or schema.table.`);
  }
  parts.forEach((part) => assertIdentifier(part, fieldName));
  return parts.length === 2
    ? { schema: parts[0], name: parts[1] }
    : { schema: 'public', name: relation };
}

function formatOptionStatus(status: string) {
  if (status === 'active') return '启用';
  if (status === 'inactive') return '停用';
  return status || '-';
}

function normalizeOptionValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return String(value ?? '');
}

function normalizeOptionRows(
  rows: unknown[],
  sourceCode: string,
  config: Record<string, unknown>
) {
  const labelField = readConfigString(config, ['labelField', 'label_field'], 'label');
  const valueField = readConfigString(config, ['valueField', 'value_field'], 'value');
  const disabledField = readConfigString(config, ['disabledField', 'disabled_field'], 'disabled');
  const parentField = readConfigString(config, ['parentField', 'parent_field'], 'parent_value');
  const colorField = readConfigString(config, ['colorField', 'color_field'], 'color');

  return rows.filter(isRecord).map((row) => {
    const label = readPathValue(row, labelField) ?? row.name ?? row.title ?? row.code ?? row.id ?? '';
    const value = readPathValue(row, valueField) ?? row.code ?? row.id ?? label;
    const parentValue = readPathValue(row, parentField);
    const color = readPathValue(row, colorField);

    return {
      ...row,
      source_code: sourceCode,
      label: String(label),
      value: normalizeOptionValue(value),
      rawValue: value,
      disabled: readBooleanLike(readPathValue(row, disabledField), false),
      status_label: formatOptionStatus(readOptionalString(row.status)),
      parent_value:
        parentValue === undefined || parentValue === null || parentValue === ''
          ? null
          : normalizeOptionValue(parentValue),
      color: typeof color === 'string' && color.trim() ? color.trim() : null
    };
  });
}

function applyOptionFilters<Query extends { eq: Function; in: Function; is: Function }>(
  query: Query,
  filters: Record<string, unknown>
) {
  let nextQuery = query;
  for (const [field, value] of Object.entries(filters)) {
    assertIdentifierPath(field, 'filter field');
    if (Array.isArray(value)) nextQuery = nextQuery.in(field, value) as Query;
    else if (value === null) nextQuery = nextQuery.is(field, null) as Query;
    else if (value !== undefined && value !== '') nextQuery = nextQuery.eq(field, value) as Query;
  }
  return nextQuery;
}

function buildOptionTree(rows: Record<string, unknown>[]) {
  type TreeNode = Record<string, unknown> & { children: TreeNode[] };
  const byValue = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  rows.forEach((row) => byValue.set(String(row.value), { ...row, children: [] }));
  byValue.forEach((row) => {
    const parentValue = row.parent_value;
    const parent = parentValue ? byValue.get(String(parentValue)) : undefined;
    if (parent) parent.children.push(row);
    else roots.push(row);
  });
  return roots;
}

function readOptionSourceTarget(row: Record<string, unknown>) {
  const config = readJsonObject(row.source_config);
  const sourceType = normalizeOptionSourceType(row.source_type);
  if (sourceType === 'view') {
    return readConfigString(config, ['view', 'table', 'relation', 'from']);
  }
  if (sourceType === 'rpc') {
    return readConfigString(config, ['functionName', 'function_name', 'rpc']);
  }
  return '';
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function toPrettyJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function isMissingTableError(error: { message?: string } | null | undefined) {
  return Boolean(
    error?.message?.includes('Could not find the table') ||
      error?.message?.includes('relation') && error?.message?.includes('does not exist')
  );
}

function metadataTablesRequired(error: { message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    throw new BadRequestException(
      'Admin metadata tables are not created yet. Run supabase/migrations/20260722100000_admin_metadata.sql first.'
    );
  }
}

function optionTablesRequired(error: { message?: string } | null | undefined) {
  if (isMissingTableError(error)) {
    throw new BadRequestException(
      'System option tables are not created yet. Run supabase/migrations/20260728033000_system_option_sources.sql first.'
    );
  }
}

function asRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  if (isRecord(value) && Array.isArray(value.rows)) return value.rows as Record<string, unknown>[];
  return [];
}

@Injectable()
export class AdminService extends BaseService {
  protected override async saveItem(
    postData: Parameters<BaseService['execute']>[1],
    context: ServiceContext
  ) {
    await this.readResourceMetadata(context);
    if (this.tryResolveResource(postData)) {
      return super.saveItem(postData, context);
    }

    const tableName = readOptionalString(postData.tableName ?? postData.table_name);
    if (!tableName) {
      return super.saveItem(postData, context);
    }

    return this.saveGenericTableItem(tableName, postData, context);
  }

  protected async saveGenericTableItem(
    tableName: string,
    postData: Parameters<BaseService['execute']>[1],
    context: ServiceContext
  ) {
    const primaryKey = readOptionalString(postData.primaryKey ?? postData.primary_key) || 'id';
    this.assertIdentifier(primaryKey, 'primaryKey');

    const payload = { ...this.readDataPayload(postData) };
    // __details is a low-code transport envelope, never a generic table field.
    delete payload.__details;
    // Older low-code clients send the record identity in filters while
    // leaving the top-level id empty. Treat that as an update target too.
    const filters = isRecord(postData.filters)
      ? postData.filters as Record<string, unknown>
      : {};
    const id = [
      postData.id,
      postData[primaryKey],
      filters[primaryKey],
      filters.id,
      payload[primaryKey]
    ].find((value) =>
      (typeof value === 'string' && Boolean(value.trim())) ||
      (typeof value === 'number' && Number.isFinite(value))
    );
    const hasId = id !== undefined;

    delete payload.primaryKey;
    delete payload.primary_key;
    // The primary key is a transport/control field when updating. For an
    // insert, discard only an empty key so a database-generated UUID default
    // can be applied while still allowing an explicitly supplied key.
    if (hasId || payload[primaryKey] === '') delete payload[primaryKey];

    // Generic requests do not have a resource-level allowedFields list. Resolve
    // the physical schema first so transport-only and stale form fields are
    // removed before the Supabase insert/update call.
    const tableColumns = await this.resolveGenericTableColumns(tableName, context);
    const typedColumns = (tableColumns as Set<string> & {
      typedColumns?: Set<string>;
    }).typedColumns ?? new Set<string>();
    if (hasId && !tableColumns.has(primaryKey)) {
      throw new BadRequestException(
        `Primary key ${primaryKey} was not found on table ${tableName}.`
      );
    }
    for (const field of Object.keys(payload)) {
      if (!tableColumns.has(field)) delete payload[field];
    }
    // `type` is also a service-protocol field and is therefore excluded by
    // readDataPayload(). If the target generic table has a real `type` column,
    // preserve the submitted value as table data.
    if (
      tableColumns.has('type') &&
      payload.type === undefined &&
      Object.prototype.hasOwnProperty.call(postData, 'type')
    ) {
      payload.type = postData.type;
    }
    // Account-scoped generic tables must receive the active account id for
    // INSERT so their RLS WITH CHECK policy can authorize the new row. Do not
    // trust a client-supplied account id from the form payload.
    if (tableColumns.has('account_id')) {
      const accountId = this.accountValue(context, 'account_id');
      const suppliedAccountId = payload.account_id;
      if (
        suppliedAccountId !== undefined &&
        suppliedAccountId !== null &&
        String(suppliedAccountId) !== accountId
      ) {
        throw new ForbiddenException('The requested data belongs to a different account set.');
      }
      payload.account_id = accountId;
    }
    for (const field of typedColumns) {
      if (payload[field] === '') payload[field] = null;
    }
    if (!Object.keys(payload).length) {
      throw new BadRequestException('Save data is required.');
    }

    // Generic admin CRUD still uses the authenticated client so table RLS remains authoritative.
    // admin.saveItem is the generic administrative CRUD endpoint. Use the
    // service-role client here; the authenticated user is still validated by
    // the gateway, while table-specific RLS policies must not turn a valid
    // admin update into a false "record was not found" response.
    const client = await this.createCrudClient({ tableName, clientMode: 'admin' }, context);
    const table = this.fromTable(client, tableName);
    const query = hasId
      ? table.update(payload).eq(primaryKey, id)
      : table.insert(payload);
    const { data, error } = await query.select('*').maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data && hasId) {
      throw new NotFoundException(`${tableName} record was not found.`);
    }
    if (!data) {
      throw new BadRequestException(`${tableName} record could not be created.`);
    }
    return data;
  }

  protected async resolveGenericTableColumns(
    tableName: string,
    context: ServiceContext
  ) {
    const table = readRelationIdentifier(tableName, 'tableName');
    const metadataClient = createSupabaseClient('admin', context);
    const { data, error } = await metadataClient.rpc('read_lowcode_table_metadata', {
      p_action: 'inspect_table',
      p_payload: { schema_name: table.schema, table_name: table.name }
    });

    if (error) {
      throw new BadRequestException(
        `Could not inspect table ${table.schema}.${table.name}: ${error.message}`
      );
    }

    const columns = isRecord(data) && Array.isArray(data.columns)
      ? data.columns
      : [];
    const names = columns
      .map((column) => isRecord(column) ? readOptionalString(column.name) : '')
      .filter(Boolean);
    if (!names.length) {
      throw new BadRequestException(
        `Could not resolve columns for table ${table.schema}.${table.name}.`
      );
    }

    const result = new Set(names) as Set<string> & { typedColumns?: Set<string> };
    Object.defineProperty(result, 'typedColumns', {
      enumerable: false,
      value: new Set(
        columns
          .filter((column): column is Record<string, unknown> => isRecord(column))
          .filter((column) => {
            const dataType = readOptionalString(column.dataType ?? column.data_type).toLowerCase();
            const udtName = readOptionalString(column.udtName ?? column.udt_name).toLowerCase();
            return udtName === 'uuid' || [
              'array', 'bigint', 'boolean', 'date', 'double precision', 'integer',
              'interval', 'json', 'jsonb', 'numeric', 'real', 'smallint',
              'time without time zone', 'time with time zone',
              'timestamp without time zone', 'timestamp with time zone'
            ].includes(dataType);
          })
          .map((column) => readOptionalString(column.name))
          .filter(Boolean)
      )
    });
    return result;
  }

  protected async resolveNavigationAuthorization(context: ServiceContext) {
    const activeAccount = await requireActiveAccount(context);
    const { client, user } = await getCurrentUser(activeAccount.context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: activeAccount.context.accountId,
      refresh: true
    });
    return { activeAccount, authorization };
  }

  protected override async listItems(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (this.isNavigationCompatibilityRequest(postData)) {
      return this.listNavigationRoutes(context);
    }

    return super.listItems(postData, context);
  }

  protected override async executeAction(
    method: string,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    if (method === 'listAccountLoginUsers') {
      return this.listAccountLoginUsers(context);
    }

    if (method === 'listNavigationRoutes') {
      return this.listNavigationRoutes(context);
    }

    if (
      method === 'resolveOptionItems' ||
      method === 'listOptionItems' ||
      method === 'listDropdownOptions'
    ) {
      return this.resolveOptionItems(postData, context);
    }

    if (
      method === 'resolveOptionItemsBatch' ||
      method === 'listOptionItemsBatch' ||
      method === 'listDropdownOptionsBatch'
    ) {
      return this.resolveOptionItemsBatch(postData, context);
    }

    return super.executeAction(method, postData, context);
  }

  protected override hooks(): ServiceHooks {
    const clearAuthorizationCaches = () => {
      clearAllUserAuthorizationCaches();
    };
    return {//
      admin_roles: {
        beforeDelete: [this.resolveCodeDeleteId],
        afterCreate: [clearAuthorizationCaches],
        afterUpdate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      },
      admin_permissions: {
        beforeDelete: [this.resolveCodeDeleteId],
        afterCreate: [clearAuthorizationCaches],
        afterUpdate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      },
      admin_routes: {
        beforeDelete: [this.resolveCodeDeleteId]
      },
      admin_entities: {
        beforeDelete: [this.resolveCodeDeleteId]
      },
      system_option_sources: {
        afterList: [],
        beforeDelete: [this.resolveOptionSourceDeleteId, this.preventDeleteSystemOptionSource],
        afterCreate: [this.attachOptionSourceConfigJson],
        afterUpdate: [this.attachOptionSourceConfigJson]
      },
      system_option_items: {
        beforeDelete: [this.resolveOptionItemDeleteId, this.preventDeleteSystemOptionItem],
        afterCreate: [this.attachOptionItemMetadataJson],
        afterUpdate: [this.attachOptionItemMetadataJson]
      },
      admin_user_roles: {
        afterCreate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      },
      admin_role_permissions: {
        afterCreate: [clearAuthorizationCaches],
        afterDelete: [clearAuthorizationCaches]
      }
    };
  }

  private adminCrudPermissions(permission: string) {
    return { list: permission, create: permission, update: permission, delete: permission };
  }

  private isNavigationCompatibilityRequest(postData: Record<string, unknown>) {
    const tableName = readOptionalString(postData.tableName ?? postData.table_name);
    const resource = readOptionalString(postData.resource);
    if (tableName !== 'admin_routes' || resource) return false;

    const filters = isRecord(postData.filters) ? postData.filters : {};
    const hasSearch = readOptionalString(postData.search) !== '';
    return !hasSearch && Object.keys(filters).length === 0;
  }

  private async listAccountLoginUsers(context: ServiceContext) {
    const { client } = await requireAdmin(context);
    const { data: permissionRows, error: permissionRowsError } = await client.rpc(
      'get_admin_user_permission_rows'
    );

    if (!permissionRowsError && Array.isArray(permissionRows)) {
      const accountUserIds = new Set(await listActiveAccountUserIds(context));
      return permissionRows
        .filter((row: Record<string, unknown>) => accountUserIds.has(String(row.user_id ?? row.id ?? '')))
        .map((row: Record<string, unknown>) => ({
        id: row.id,
        user_id: row.user_id,
        email: row.email,
        full_name: row.full_name,
        nickname: row.nickname,
        role: row.legacy_profile_role,
        app_role_names: row.app_role_names,
        role_names: row.role_names
      }));
    }

    const adminClient = createSupabaseClient('admin', context);
    const [{ data: profiles, error: profileError }, authUsersResult] = await Promise.all([
      adminClient
        .from('users')
        .select('id, full_name, nickname, role, updated_at')
        .order('updated_at', { ascending: false }),
      adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 })
    ]);

    if (profileError) throw new BadRequestException(profileError.message);
    if (authUsersResult.error) throw new BadRequestException(authUsersResult.error.message);

    const authUsersById = new Map(
      authUsersResult.data.users.map((user) => [user.id, user])
    );
    const accountUserIds = new Set(await listActiveAccountUserIds(context));

    return (profiles ?? [])
      .filter((profile) => accountUserIds.has(profile.id))
      .map((profile) => ({
      id: profile.id,
      user_id: profile.id,
      email: authUsersById.get(profile.id)?.email ?? '',
      full_name: profile.full_name,
      nickname: profile.nickname,
      role: profile.role
    }));
  }

  private async listNavigationRoutes(context: ServiceContext) {
    const { activeAccount, authorization } = await this.resolveNavigationAuthorization(context);
    const adminClient = createSupabaseClient('admin', activeAccount.context);
    const { data, error } = await adminClient
      .from('admin_routes')
      .select(ADMIN_NAVIGATION_SELECT)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(2000);

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return selectAuthorizedNavigationRoutes(
      data ?? [],
      authorization.permissionCodes,
      authorization.isLegacyAdmin
    );
  }

  private resolveCodeDeleteId = async (ctx: HookContext) => {
    if (ctx.id) return;
    const code = readOptionalString(ctx.input.code);
    if (!code) return;
    const rows = asRows(await this.listItems({
      tableName: ctx.resource.tableName,
      select: 'id',
      filters: { code },
      clientMode: ctx.resource.clientMode ?? 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      metadataTablesRequired(error);
      throw error;
    }));
    ctx.id = readOptionalString(rows[0]?.id);
  };

  private preventDeleteSystemOptionSource = async (ctx: HookContext) => {
    await this.preventDeleteSystemRow(ctx, 'system_option_sources', 'System option sources cannot be deleted.');
  };

  private preventDeleteSystemOptionItem = async (ctx: HookContext) => {
    await this.preventDeleteSystemRow(ctx, 'system_option_items', 'System option items cannot be deleted.');
  };

  private resolveOptionSourceDeleteId = async (ctx: HookContext) => {
    if (ctx.id) return;
    const code = readOptionalString(ctx.input.code);
    if (!code) return;
    const rows = asRows(await this.listItems({
      tableName: 'system_option_sources',
      select: 'id',
      filters: { code },
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));
    ctx.id = readOptionalString(rows[0]?.id);
  };

  private resolveOptionItemDeleteId = async (ctx: HookContext) => {
    if (ctx.id) return;
    const sourceCode = readOptionalString(ctx.input.source_code ?? ctx.input.sourceCode);
    const value = readOptionalString(ctx.input.value);
    if (!sourceCode || !value) return;
    const rows = asRows(await this.listItems({
      tableName: 'system_option_items',
      select: 'id',
      filters: { source_code: sourceCode, value },
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));
    ctx.id = readOptionalString(rows[0]?.id);
  };

  private async resolveOptionItems(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: context.accountId
    });
    const canManage = hasRequiredPermission(authorization, 'admin.options.manage');
    const sourceCode = readOptionalString(
      postData.source_code ?? postData.sourceCode ?? postData.code
    );
    if (!sourceCode) return [];

    let sourceQuery = client
      .from('system_option_sources')
      .select('*')
      .eq('code', sourceCode);
    if (!canManage) sourceQuery = sourceQuery.eq('status', 'active');

    const { data: source, error } = await sourceQuery.maybeSingle();
    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }
    if (!source) return [];

    return this.resolveOptionItemsFromSource(
      client,
      source as Record<string, unknown>,
      sourceCode,
      canManage,
      postData,
      context
    );
  }

  private async resolveOptionItemsBatch(
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const sourceCodes = [...new Set(readStringArray(
      postData.sourceCodes ?? postData.source_codes ?? postData.codes
    ))];
    if (!sourceCodes.length) return {};
    if (sourceCodes.length > 100) {
      throw new BadRequestException('A maximum of 100 option source codes can be resolved at once.');
    }

    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id, {
      accountId: context.accountId
    });
    const canManage = hasRequiredPermission(authorization, 'admin.options.manage');
    let sourceQuery = client
      .from('system_option_sources')
      .select('*')
      .in('code', sourceCodes);
    if (!canManage) sourceQuery = sourceQuery.eq('status', 'active');

    const { data: sources, error } = await sourceQuery;
    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    const sourceByCode = new Map(
      (sources ?? [])
        .filter(isRecord)
        .map((source) => [readOptionalString(source.code), source] as const)
        .filter(([code]) => Boolean(code))
    );
    const entries = await Promise.all(sourceCodes.map(async (sourceCode) => {
      const source = sourceByCode.get(sourceCode);
      if (!source) {
        return [sourceCode, { options: [], cacheTtlSeconds: 0 }] as const;
      }

      const options = await this.resolveOptionItemsFromSource(
        client,
        source,
        sourceCode,
        canManage,
        postData,
        context
      );
      return [sourceCode, {
        options,
        cacheTtlSeconds: Math.max(0, Math.trunc(readNumber(source.cache_ttl_seconds)))
      }] as const;
    }));

    return Object.fromEntries(entries);
  }

  private async resolveOptionItemsFromSource(
    client: ReturnType<typeof createSupabaseClient>,
    sourceRecord: Record<string, unknown>,
    sourceCode: string,
    canManage: boolean,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {

    const sourceType = normalizeOptionSourceType(sourceRecord.source_type);
    const sourceConfig = readJsonObject(sourceRecord.source_config);
    const tree = readBooleanLike(postData.tree ?? sourceConfig.tree, false);
    let rows: Record<string, unknown>[];

    if (sourceType === 'dict') {
      rows = await this.resolveDictOptionItems(client, sourceCode, canManage);
    } else if (sourceType === 'table' || sourceType === 'view') {
      rows = await this.resolveRelationOptionItems(
        client,
        sourceType,
        sourceConfig,
        postData,
        context
      );
    } else if (sourceType === 'rpc') {
      rows = await this.resolveRpcOptionItems(client, sourceConfig, postData);
    } else {
      rows = await this.resolveSqlOptionItems(client, sourceCode);
    }

    const normalized = normalizeOptionRows(rows, sourceCode, sourceConfig);
    return tree ? buildOptionTree(normalized) : normalized;
  }

  private async resolveDictOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceCode: string,
    canManage: boolean
  ) {
    let query = client
      .from('system_option_items')
      .select('*')
      .eq('source_code', sourceCode)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (!canManage) query = query.eq('status', 'active');
    const { data, error } = await query;
    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  private async resolveRelationOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceType: 'table' | 'view',
    sourceConfig: Record<string, unknown>,
    postData: Record<string, unknown>,
    context: ServiceContext
  ) {
    const relationName = readConfigString(
      sourceConfig,
      sourceType === 'view'
        ? ['view', 'table', 'relation', 'from']
        : ['table', 'relation', 'from']
    );
    const relation = readRelationIdentifier(relationName, 'source_config.table');
    const labelField = readConfigString(sourceConfig, ['labelField', 'label_field'], 'label');
    const valueField = readConfigString(sourceConfig, ['valueField', 'value_field'], 'value');
    const disabledField = readConfigString(sourceConfig, ['disabledField', 'disabled_field']);
    const parentField = readConfigString(sourceConfig, ['parentField', 'parent_field']);
    const colorField = readConfigString(sourceConfig, ['colorField', 'color_field']);
    const orderBy = readConfigString(sourceConfig, ['orderBy', 'order_by'], labelField);
    const scopedToAccount = sourceConfig.accountScoped === true || sourceConfig.account_scoped === true;
    const filters = {
      ...readJsonObject(sourceConfig.filters),
      ...readJsonObject(postData.filters)
    };
    if (scopedToAccount) {
      if (!context.accountId) {
        throw new ForbiddenException('An active account set is required.');
      }
      delete filters.account_id;
    }

    [labelField, valueField, disabledField, parentField, colorField, orderBy, ...Object.keys(filters)]
      .filter(Boolean)
      .forEach((field) => assertIdentifierPath(field, 'source field'));
    const selectFields = Array.from(new Set(
      [labelField, valueField, disabledField, parentField, colorField]
        .filter(Boolean)
        .map((field) => field.split('.')[0])
    )).join(',');
    const baseQuery = relation.schema === 'public'
      ? client.from(relation.name).select(selectFields)
      : client.schema(relation.schema).from(relation.name).select(selectFields);
    let query = applyOptionFilters(baseQuery, filters);
    if (scopedToAccount) {
      query = query.or(`account_id.is.null,account_id.eq.${context.accountId}`) as typeof query;
    }
    query = query
      .order(orderBy, { ascending: sourceConfig.ascending !== false })
      .limit(readPositiveLimit(postData.limit ?? sourceConfig.limit));
    const { data, error } = await query;
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as unknown as Record<string, unknown>[];
  }

  private async resolveRpcOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceConfig: Record<string, unknown>,
    postData: Record<string, unknown>
  ) {
    const functionName = readConfigString(
      sourceConfig,
      ['functionName', 'function_name', 'rpc']
    );
    assertIdentifier(functionName, 'source_config.functionName');
    const params = {
      ...readJsonObject(sourceConfig.params),
      ...readJsonObject(postData.params)
    };
    const { data, error } = await client.rpc(functionName, params);
    if (error) throw new BadRequestException(error.message);
    return (Array.isArray(data) ? data : isRecord(data) ? [data] : []) as Record<string, unknown>[];
  }

  private async resolveSqlOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceCode: string
  ) {
    const { data, error } = await client.rpc('execute_system_option_sql', {
      option_code: sourceCode
    });
    if (error) throw new BadRequestException(error.message);
    return (Array.isArray(data) ? data : []) as Record<string, unknown>[];
  }

  private async preventDeleteSystemRow(ctx: HookContext, tableName: string, message: string) {
    const id = readOptionalString(ctx.input.id);
    const code = readOptionalString(ctx.input.code);
    const sourceCode = readOptionalString(ctx.input.source_code ?? ctx.input.sourceCode);
    const value = readOptionalString(ctx.input.value);
    let filters: Record<string, unknown>;
    if (id) filters = { id };
    else if (code) filters = { code };
    else if (sourceCode && value) filters = { source_code: sourceCode, value };
    else throw new BadRequestException('id, code, or source_code + value is required.');

    const [data] = asRows(await this.listItems({
      tableName,
      select: 'id, is_system',
      filters,
      clientMode: 'admin',
      limit: 1
    }, ctx.context).catch((error) => {
      optionTablesRequired(error);
      throw error;
    }));
    if (!data) throw new NotFoundException('Item not found.');
    if (data.is_system === true) throw new BadRequestException(message);
  }

  private attachOptionItemMetadataJson = (ctx: HookContext) => {
    const row = ctx.result as Record<string, unknown> | undefined;
    if (!row) return;
    ctx.result = { ...row, metadata_json: toPrettyJson(row.metadata ?? {}) };
  };

  private attachOptionSourceConfigJson = (ctx: HookContext) => {
    const attachConfig = (row: Record<string, unknown>) => ({
      ...row,
      source_target: readOptionSourceTarget(row),
      source_config_json: toPrettyJson(row.source_config ?? {})
    });

    if (Array.isArray(ctx.result)) {
      ctx.result = ctx.result.map((row) => isRecord(row) ? attachConfig(row) : row);
      return;
    }

    if (isRecord(ctx.result)) {
      ctx.result = attachConfig(ctx.result);
    }
  };
}
