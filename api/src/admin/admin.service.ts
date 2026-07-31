import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission,
  requireAdmin
} from '../common/utils/supabase';
import { withPostgresClient } from '../common/utils/database';
import {
  listItemsFromEntity,
  readEntityPermissionCodes,
  readEntityReadPermissions,
  resolveListItemsEntity
} from '../common/utils/list-items';

type PostData = Record<string, unknown>;
type OptionSourceType = 'dict' | 'table' | 'view' | 'rpc' | 'sql';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, name: string, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (fallback) {
    return fallback;
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function readJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (isRecord(parsed)) {
        return parsed;
      }
    } catch {
      throw new BadRequestException('Invalid JSON payload.');
    }
  }

  return fallback;
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

function isMissingFunctionError(error: { message?: string; code?: string } | null | undefined) {
  return (
    error?.code === 'PGRST202' ||
    Boolean(error?.message?.includes('Could not find the function')) ||
    Boolean(error?.message?.includes('function') && error.message.includes('does not exist'))
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

function normalizeStatus(
  value: unknown,
  allowed: string[],
  fallback: string
) {
  if (typeof value === 'string' && allowed.includes(value)) {
    return value;
  }

  return fallback;
}

function normalizeOptionSourceType(value: unknown): OptionSourceType {
  return normalizeStatus(
    value,
    ['dict', 'table', 'view', 'rpc', 'sql'],
    'dict'
  ) as OptionSourceType;
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
  const limit = readNumber(value, fallback);
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

function readConfigString(
  config: Record<string, unknown>,
  keys: string[],
  fallback = ''
) {
  for (const key of keys) {
    const value = config[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return fallback;
}

function readPathValue(source: unknown, path: string) {
  if (!path) return undefined;

  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) return undefined;
    return current[segment];
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
    ? { schema: parts[0], name: parts[1], fullName: relation }
    : { schema: 'public', name: relation, fullName: `public.${relation}` };
}

function readOptionSourceConfig(source: Record<string, unknown>) {
  return readJsonObject(source.source_config_json ?? source.source_config ?? source.sourceConfig);
}

function assertOptionSourceConfig(
  sourceType: OptionSourceType,
  config: Record<string, unknown>,
  status: string
) {
  if (status !== 'active' || sourceType === 'dict') return;

  if (sourceType === 'table' || sourceType === 'view') {
    const relation = readConfigString(
      config,
      sourceType === 'view'
        ? ['view', 'table', 'relation', 'from']
        : ['table', 'relation', 'from']
    );
    readRelationIdentifier(relation, 'source_config.table');
    assertIdentifierPath(
      readConfigString(config, ['labelField', 'label_field'], 'label'),
      'source_config.labelField'
    );
    assertIdentifierPath(
      readConfigString(config, ['valueField', 'value_field'], 'value'),
      'source_config.valueField'
    );
    return;
  }

  if (sourceType === 'rpc') {
    assertIdentifier(
      readConfigString(config, ['functionName', 'function_name', 'rpc']),
      'source_config.functionName'
    );
    return;
  }

  if (sourceType === 'sql' && !readConfigString(config, ['sql', 'query'])) {
    throw new BadRequestException('source_config.sql is required for SQL option sources.');
  }
}

function normalizeOptionValue(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return String(value ?? '');
}

function normalizeOptionRows(
  rows: unknown[],
  sourceCode: string,
  config: Record<string, unknown>,
  tree = false
) {
  const labelField = readConfigString(config, ['labelField', 'label_field'], 'label');
  const valueField = readConfigString(config, ['valueField', 'value_field'], 'value');
  const disabledField = readConfigString(config, ['disabledField', 'disabled_field'], 'disabled');
  const parentField = readConfigString(config, ['parentField', 'parent_field'], 'parent_value');
  const colorField = readConfigString(config, ['colorField', 'color_field'], 'color');

  const options = rows.filter(isRecord).map((row) => {
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
      metadata_json: isRecord(row.metadata) ? toPrettyJson(row.metadata) : '{}',
      parent_value:
        typeof parentValue === 'undefined' || parentValue === null || parentValue === ''
          ? null
          : normalizeOptionValue(parentValue),
      color: typeof color === 'string' && color.trim() ? color.trim() : null
    };
  });

  return tree ? buildTree(options, 'value', 'parent_value') : options;
}

function formatOptionSourceType(type: string) {
  switch (type) {
    case 'dict':
      return '\u5b57\u5178\u660e\u7ec6';
    case 'table':
      return '\u6570\u636e\u8868';
    case 'view':
      return '\u89c6\u56fe';
    case 'rpc':
      return 'RPC';
    case 'sql':
      return 'SQL';
    default:
      return type || '-';
  }
}

function formatOptionStatus(status: string) {
  switch (status) {
    case 'active':
      return '\u542f\u7528';
    case 'inactive':
      return '\u505c\u7528';
    default:
      return status || '-';
  }
}

function applyOptionFilters<Query extends { eq: Function; in: Function; is: Function }>(
  query: Query,
  filters: Record<string, unknown>
) {
  let nextQuery = query;

  for (const [field, value] of Object.entries(filters)) {
    assertIdentifierPath(field, 'filter field');

    if (Array.isArray(value)) {
      nextQuery = nextQuery.in(field, value) as Query;
    } else if (value === null) {
      nextQuery = nextQuery.is(field, null) as Query;
    } else if (typeof value !== 'undefined' && value !== '') {
      nextQuery = nextQuery.eq(field, value) as Query;
    }
  }

  return nextQuery;
}

function buildTree<T extends Record<string, unknown>>(
  rows: T[],
  keyField: string,
  parentField: string
) {
  type TreeNode = T & { children: TreeNode[] };
  const byId = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const row of rows) {
    byId.set(String(row[keyField]), { ...row, children: [] });
  }

  for (const row of byId.values()) {
    const parentId = row[parentField];
    if (parentId && byId.has(String(parentId))) {
      const parent = byId.get(String(parentId))!;
      parent.children.push(row);
    } else {
      roots.push(row);
    }
  }

  return roots;
}

@Injectable()
export class AdminService implements ServiceExecutor {
  async execute(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'listItems':
        return this.listItems(postData, context);
      case 'listRoles':
        return this.listItems({ ...postData, entityCode: 'admin_roles' }, context);
      case 'getRole':
        return this.getRole(postData, context);
      case 'saveRole':
        return this.saveRole(postData, context);
      case 'deleteRole':
        return this.deleteRole(postData, context);
      case 'listPermissions':
        return this.listItems({ ...postData, entityCode: 'admin_permissions' }, context);
      case 'savePermission':
        return this.savePermission(postData, context);
      case 'deletePermission':
        return this.deletePermission(postData, context);
      case 'listRoutes':
        return this.listItems({ ...postData, entityCode: 'admin_routes' }, context);
      case 'listRouteTree':
        return this.listRouteTree(context);
      case 'listRouteManageTree':
        return this.listRouteManageTree(context);
      case 'saveRoute':
        return this.saveRoute(postData, context);
      case 'hideRoute':
        return this.hideRoute(postData, context);
      case 'deleteRoute':
        return this.deleteRoute(postData, context);
      case 'listEntities':
        return this.listItems({ ...postData, entityCode: 'admin_entities' }, context);
      case 'saveEntity':
        return this.saveEntity(postData, context);
      case 'deleteEntity':
        return this.deleteEntity(postData, context);
      case 'listOptionSources':
        return this.listOptionSources(context);
      case 'saveOptionSource':
        return this.saveOptionSource(postData, context);
      case 'deleteOptionSource':
        return this.deleteOptionSource(postData, context);
      case 'listOptionItems':
      case 'listDropdownOptions':
        return this.listOptionItems(postData, context);
      case 'saveOptionItem':
        return this.saveOptionItem(postData, context);
      case 'deleteOptionItem':
        return this.deleteOptionItem(postData, context);
      case 'listUsers':
        return this.listItems({ ...postData, entityCode: 'users' }, context);
      case 'saveUserRoles':
        return this.saveUserRoles(postData, context);
      case 'listSystemExecutionTasks':
        return this.listSystemExecutionTasks(context);
      case 'listWorkflowJobs':
        return this.listWorkflowJobs(postData, context);
      case 'listWorkflowJobRuns':
        return this.listWorkflowJobRuns(postData, context);
      case 'listWorkflowTimerJobs':
        return this.listWorkflowTimerJobs(postData, context);
      default:
        throw new BadRequestException(`Unsupported admin method: ${method}`);
    }
  }

  private async listItems(postData: PostData, context: ServiceContext) {
    const { client: userClient, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(userClient, user.id);

    try {
      return await withPostgresClient(async (client) => {
        const entity = await resolveListItemsEntity(client, postData);
        const entityPermissionCodes = await readEntityPermissionCodes(client, entity);
        const readPermissions = readEntityReadPermissions(entity, [
          ...entityPermissionCodes,
          'admin.entities.manage',
          'lowcode.pages.manage'
        ]);

        if (!hasRequiredPermission(authorization, readPermissions)) {
          throw new ForbiddenException('Entity list permission required.');
        }

        return listItemsFromEntity(client, entity, postData);
      });
    } catch (error) {
      if (error instanceof BadRequestException || error instanceof ForbiddenException) {
        throw error;
      }

      throw new BadRequestException(
        error instanceof Error ? error.message : 'Could not load entity items.'
      );
    }
  }

  private async listRoles(context: ServiceContext) {
    const { client } = await requireAdmin(context, ['admin.roles.manage', 'admin.users.manage']);
    const [{ data: roles, error: roleError }, { data: permissions, error: permissionError }, { data: rolePermissions, error: mappingError }] = await Promise.all([
      client.from('admin_roles').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      client.from('admin_permissions').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      client.from('admin_role_permissions').select('*')
    ]);

    if (roleError) {
      if (isMissingTableError(roleError)) return [];
      throw new BadRequestException(roleError.message);
    }

    if (permissionError) {
      if (isMissingTableError(permissionError)) return [];
      throw new BadRequestException(permissionError.message);
    }

    if (mappingError) {
      if (isMissingTableError(mappingError)) return [];
      throw new BadRequestException(mappingError.message);
    }

    const permissionsById = new Map(
      (permissions ?? []).map((permission: Record<string, unknown>) => [
        String(permission.id),
        permission
      ])
    );

    const permissionsByRoleId = new Map<string, string[]>();
    const permissionRowsByRoleId = new Map<string, Record<string, unknown>[]>();
    for (const mapping of rolePermissions ?? []) {
      const roleId = String((mapping as Record<string, unknown>).role_id ?? '');
      const permissionId = String((mapping as Record<string, unknown>).permission_id ?? '');
      if (!roleId || !permissionId) continue;
      const permission = permissionsById.get(permissionId);
      const codes = permissionsByRoleId.get(roleId) ?? [];
      if (permission?.code) {
        codes.push(String(permission.code));
        permissionsByRoleId.set(roleId, codes);

        const rows = permissionRowsByRoleId.get(roleId) ?? [];
        rows.push({
          id: (mapping as Record<string, unknown>).id,
          role_id: roleId,
          permission_id: permissionId,
          permission_code: permission.code,
          permission_name: permission.name,
          resource_type: permission.resource_type,
          resource_key: permission.resource_key,
          action_code: permission.action_code,
          route_path: permission.route_path,
          page_code: permission.page_code,
          entity_code: permission.entity_code,
          status: permission.status,
          sort_order: permission.sort_order,
          created_at: (mapping as Record<string, unknown>).created_at
        });
        permissionRowsByRoleId.set(roleId, rows);
      }
    }

    return (roles ?? []).map((role: Record<string, unknown>) => {
      const permissionCodes = permissionsByRoleId.get(String(role.id)) ?? [];
      const permissionNames = permissionCodes
        .map((code) =>
          (permissions ?? []).find((permission: Record<string, unknown>) => String(permission.code) === code)?.name
        )
        .filter(Boolean)
        .join(', ');

      return {
        ...role,
        permission_codes: permissionCodes,
        permission_count: permissionCodes.length,
        permission_names: permissionNames,
        permission_rows: permissionRowsByRoleId.get(String(role.id)) ?? []
      };
    });
  }

  private async getRole(postData: PostData, context: ServiceContext) {
    const roleResult = await this.listItems({ entityCode: 'admin_roles', limit: 1000 }, context);
    const roles = Array.isArray(roleResult) ? roleResult : [];
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      return {
        id: '',
        code: '',
        name: '',
        description: '',
        status: 'active',
        sort_order: 0,
        is_system: false,
        permission_codes: []
      };
    }

    const role = (roles as Record<string, unknown>[]).find(
      (item) => (id && String(item.id) === id) || (code && String(item.code) === code)
    );

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    return role;
  }

  private async saveRole(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.roles.manage');
    const id = readOptionalString(postData.id);
    const code = readString(postData.code, 'code');
    const name = readString(postData.name, 'name');
    const description = readOptionalString(postData.description);
    const status = normalizeStatus(postData.status, ['active', 'inactive'], 'active') as 'active' | 'inactive';
    const sortOrder = readNumber(postData.sort_order ?? postData.sortOrder, 0);
    const isSystem = readBoolean(postData.is_system ?? postData.isSystem, false);
    const permissionCodes = readStringArray(postData.permission_codes ?? postData.permissionCodes);

    const payload = {
      code,
      name,
      description: description || null,
      status,
      sort_order: sortOrder,
      is_system: isSystem,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    let savedRole: Record<string, unknown> | null = null;

    if (id) {
      const { data, error } = await client
        .from('admin_roles')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      savedRole = data as Record<string, unknown>;
    } else {
      const { data, error } = await client
        .from('admin_roles')
        .insert({
          ...payload,
          created_by: user.id
        })
        .select('*')
        .single();

      if (error) {
        throw new BadRequestException(error.message);
      }

      savedRole = data as Record<string, unknown>;
    }

    const { data: allPermissions, error: permissionError } = await client
      .from('admin_permissions')
      .select('id, code');

    if (permissionError) {
      metadataTablesRequired(permissionError);
      throw new BadRequestException(permissionError.message);
    }

    const permissionIds = (allPermissions ?? [])
      .filter((permission: Record<string, unknown>) =>
        permissionCodes.includes(String(permission.code))
      )
      .map((permission: Record<string, unknown>) => String(permission.id));

    const { error: deleteMappingsError } = await client
      .from('admin_role_permissions')
      .delete()
      .eq('role_id', String(savedRole.id));

    if (deleteMappingsError) {
      metadataTablesRequired(deleteMappingsError);
      throw new BadRequestException(deleteMappingsError.message);
    }

    if (permissionIds.length) {
      const { error: insertMappingsError } = await client
        .from('admin_role_permissions')
        .insert(
          permissionIds.map((permissionId) => ({
            role_id: String(savedRole.id),
            permission_id: permissionId
          }))
        );

      if (insertMappingsError) {
        metadataTablesRequired(insertMappingsError);
        throw new BadRequestException(insertMappingsError.message);
      }
    }

    return {
      ...savedRole,
      permission_codes: permissionCodes
    };
  }

  private async deleteRole(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.roles.manage');
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      throw new BadRequestException('id or code is required.');
    }

    const query = id ? client.from('admin_roles').delete().eq('id', id) : client.from('admin_roles').delete().eq('code', code);
    const { error } = await query;

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async listPermissions(context: ServiceContext) {
    const { client } = await requireAdmin(context, [
      'admin.permissions.manage',
      'admin.roles.manage',
      'admin.routes.manage',
      'admin.entities.manage',
      'admin.users.manage',
      'lowcode.pages.manage'
    ]);
    const [
      { data: permissions, error },
      { data: roles, error: roleError },
      { data: rolePermissions, error: mappingError }
    ] = await Promise.all([
      client
        .from('admin_permissions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('admin_roles')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client.from('admin_role_permissions').select('*')
    ]);

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    if (roleError) {
      if (isMissingTableError(roleError)) return permissions ?? [];
      throw new BadRequestException(roleError.message);
    }

    if (mappingError) {
      if (isMissingTableError(mappingError)) return permissions ?? [];
      throw new BadRequestException(mappingError.message);
    }

    const rolesById = new Map(
      (roles ?? []).map((role: Record<string, unknown>) => [String(role.id), role])
    );
    const roleRowsByPermissionId = new Map<string, Record<string, unknown>[]>();

    for (const mapping of rolePermissions ?? []) {
      const roleId = String((mapping as Record<string, unknown>).role_id ?? '');
      const permissionId = String((mapping as Record<string, unknown>).permission_id ?? '');
      if (!roleId || !permissionId) continue;

      const role = rolesById.get(roleId);
      if (!role) continue;

      const rows = roleRowsByPermissionId.get(permissionId) ?? [];
      rows.push({
        id: (mapping as Record<string, unknown>).id,
        role_id: roleId,
        permission_id: permissionId,
        role_code: role.code,
        role_name: role.name,
        role_status: role.status,
        is_system: role.is_system,
        sort_order: role.sort_order,
        created_at: (mapping as Record<string, unknown>).created_at
      });
      roleRowsByPermissionId.set(permissionId, rows);
    }

    return (permissions ?? []).map((permission: Record<string, unknown>) => {
      const roleRows = roleRowsByPermissionId.get(String(permission.id)) ?? [];
      return {
        ...permission,
        role_codes: roleRows.map((row) => String(row.role_code ?? '')).filter(Boolean),
        role_names: roleRows.map((row) => String(row.role_name ?? '')).filter(Boolean).join(', '),
        role_count: roleRows.length,
        role_rows: roleRows
      };
    });
  }

  private async savePermission(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.permissions.manage');
    const id = readOptionalString(postData.id);
    const code = readString(postData.code, 'code');
    const name = readString(postData.name, 'name');
    const description = readOptionalString(postData.description);
    const resourceType = readString(postData.resource_type ?? postData.resourceType, 'resource_type', 'page');
    const resourceKey = readOptionalString(postData.resource_key ?? postData.resourceKey);
    const actionCode = readOptionalString(postData.action_code ?? postData.actionCode);
    const routePath = readOptionalString(postData.route_path ?? postData.routePath);
    const pageCode = readOptionalString(postData.page_code ?? postData.pageCode);
    const entityCode = readOptionalString(postData.entity_code ?? postData.entityCode);
    const status = normalizeStatus(postData.status, ['active', 'inactive'], 'active') as 'active' | 'inactive';
    const sortOrder = readNumber(postData.sort_order ?? postData.sortOrder, 0);

    const payload = {
      code,
      name,
      description: description || null,
      resource_type: resourceType,
      resource_key: resourceKey || null,
      action_code: actionCode || null,
      route_path: routePath || null,
      page_code: pageCode || null,
      entity_code: entityCode || null,
      status,
      sort_order: sortOrder,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { data, error } = await client
        .from('admin_permissions')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        metadataTablesRequired(error);
        throw new BadRequestException(error.message);
      }

      return data;
    }

    const { data, error } = await client
      .from('admin_permissions')
      .insert({
        ...payload,
        created_by: user.id
      })
      .select('*')
      .single();

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return data;
  }

  private async deletePermission(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.permissions.manage');
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      throw new BadRequestException('id or code is required.');
    }

    const query = id
      ? client.from('admin_permissions').delete().eq('id', id)
      : client.from('admin_permissions').delete().eq('code', code);
    const { error } = await query;

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async listRoutes(context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.routes.manage');
    const { data, error } = await client
      .from('admin_routes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((route) => ({
      ...route,
      metadata_json: toPrettyJson((route as Record<string, unknown>).metadata ?? {})
    }));
  }

  private async listRouteTree(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id);
    let routeClient = client;

    try {
      routeClient = createSupabaseClient('admin');
    } catch {
      routeClient = client;
    }

    const { data, error } = await routeClient
      .from('admin_routes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    const routes = (data ?? []).filter((route: Record<string, unknown>) => {
      const permissionCode = typeof route.permission_code === 'string' ? route.permission_code : '';
      return !permissionCode || hasRequiredPermission(authorization, permissionCode);
    });

    return buildTree(
      routes.map((route: Record<string, unknown>) => ({
        ...route,
        title: route.title ?? route.name,
        label: route.title ?? route.name
      })),
      'id',
      'parent_id'
    );
  }

  private async listRouteManageTree(context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.routes.manage');
    const { data, error } = await client
      .from('admin_routes')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    return buildTree(
      (data ?? []).map((route: Record<string, unknown>) => ({
        ...route,
        title: route.title ?? route.name,
        label: route.title ?? route.name,
        metadata_json: toPrettyJson(route.metadata ?? {})
      })),
      'id',
      'parent_id'
    );
  }

  private async saveRoute(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.routes.manage');
    const id = readOptionalString(postData.id);
    const code = readString(postData.code, 'code');
    const title = readString(postData.title, 'title');
    const path = readString(postData.path, 'path');
    const parentId = readOptionalString(postData.parent_id ?? postData.parentId) || null;
    const routeType = readString(postData.route_type ?? postData.routeType, 'route_type', 'page');
    const icon = readOptionalString(postData.icon);
    const pageCode = readOptionalString(postData.page_code ?? postData.pageCode) || null;
    const permissionCode = readOptionalString(postData.permission_code ?? postData.permissionCode) || null;
    const visible = readBoolean(postData.visible, true);
    const keepAlive = readBoolean(postData.keep_alive ?? postData.keepAlive, true);
    const layout = normalizeStatus(postData.layout, ['default', 'dashboard', 'blank'], 'dashboard') as
      | 'default'
      | 'dashboard'
      | 'blank';
    const status = normalizeStatus(postData.status, ['active', 'inactive'], 'active') as 'active' | 'inactive';
    const sortOrder = readNumber(postData.sort_order ?? postData.sortOrder, 0);
    const metadata = readJsonObject(postData.metadata_json ?? postData.metadata);

    if (id && parentId === id) {
      throw new BadRequestException('A route cannot use itself as its parent.');
    }

    if (id && parentId) {
      const { data: routeRows, error: routeRowsError } = await client
        .from('admin_routes')
        .select('id, parent_id');

      if (routeRowsError) {
        metadataTablesRequired(routeRowsError);
        throw new BadRequestException(routeRowsError.message);
      }

      const parentById = new Map(
        (routeRows ?? []).map((route: Record<string, unknown>) => [
          String(route.id),
          route.parent_id ? String(route.parent_id) : ''
        ])
      );
      const visited = new Set<string>();
      let cursor = parentId;

      while (cursor && !visited.has(cursor)) {
        if (cursor === id) {
          throw new BadRequestException('A route cannot use one of its descendants as parent.');
        }
        visited.add(cursor);
        cursor = parentById.get(cursor) ?? '';
      }
    }

    const payload = {
      code,
      title,
      path,
      parent_id: parentId,
      route_type: routeType,
      icon: icon || null,
      page_code: pageCode,
      permission_code: permissionCode,
      visible,
      keep_alive: keepAlive,
      layout,
      status,
      sort_order: sortOrder,
      metadata,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { data, error } = await client
        .from('admin_routes')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        metadataTablesRequired(error);
        throw new BadRequestException(error.message);
      }

      return {
        ...data,
        metadata_json: toPrettyJson((data as Record<string, unknown>).metadata ?? {})
      };
    }

    const { data, error } = await client
      .from('admin_routes')
      .insert({
        ...payload,
        created_by: user.id
      })
      .select('*')
      .single();

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return {
      ...data,
      metadata_json: toPrettyJson((data as Record<string, unknown>).metadata ?? {})
    };
  }

  private async hideRoute(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.routes.manage');
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      throw new BadRequestException('id or code is required.');
    }

    let query = client
      .from('admin_routes')
      .update({
        visible: false,
        updated_by: user.id,
        updated_at: new Date().toISOString()
      });

    query = id ? query.eq('id', id) : query.eq('code', code);

    const { data, error } = await query.select('*').single();

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return {
      ...data,
      metadata_json: toPrettyJson((data as Record<string, unknown>).metadata ?? {})
    };
  }

  private async deleteRoute(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.routes.manage');
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      throw new BadRequestException('id or code is required.');
    }

    const query = id ? client.from('admin_routes').delete().eq('id', id) : client.from('admin_routes').delete().eq('code', code);
    const { error } = await query;

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async listEntities(context: ServiceContext) {
    const { client } = await requireAdmin(context, ['admin.entities.manage', 'lowcode.pages.manage']);
    const [
      { data: entities, error },
      { data: permissions, error: permissionError },
      { data: routes, error: routeError }
    ] = await Promise.all([
      client
        .from('admin_entities')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('admin_permissions')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client
        .from('admin_routes')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true })
    ]);

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    if (permissionError) {
      if (!isMissingTableError(permissionError)) {
        throw new BadRequestException(permissionError.message);
      }
    }

    if (routeError) {
      if (!isMissingTableError(routeError)) {
        throw new BadRequestException(routeError.message);
      }
    }

    return (entities ?? []).map((entity) => {
      const entityRecord = entity as Record<string, unknown>;
      const entityCode = String(entityRecord.code ?? '');
      const tableName = String(entityRecord.table_name ?? '');
      const routePath = String(entityRecord.route_path ?? '');
      const pageCode = String(entityRecord.page_code ?? '');
      const permissionRows = (permissions ?? [])
        .filter((permission: Record<string, unknown>) => {
          const resourceType = String(permission.resource_type ?? '');
          const resourceKey = String(permission.resource_key ?? '');
          const linkedEntityCode = String(permission.entity_code ?? '');
          return (
            resourceType === 'entity' &&
            [entityCode, tableName].includes(resourceKey)
          ) || linkedEntityCode === entityCode;
        })
        .map((permission: Record<string, unknown>) => ({
          id: permission.id,
          permission_id: permission.id,
          permission_code: permission.code,
          permission_name: permission.name,
          resource_type: permission.resource_type,
          resource_key: permission.resource_key,
          action_code: permission.action_code,
          route_path: permission.route_path,
          page_code: permission.page_code,
          entity_code: permission.entity_code,
          status: permission.status,
          sort_order: permission.sort_order,
        }));
      const routeRows = (routes ?? [])
        .filter((route: Record<string, unknown>) => {
          const linkedPageCode = String(route.page_code ?? '');
          const linkedPath = String(route.path ?? '');
          return (pageCode && linkedPageCode === pageCode) || (routePath && linkedPath === routePath);
        })
        .map((route: Record<string, unknown>) => ({
          id: route.id,
          route_id: route.id,
          route_code: route.code,
          route_title: route.title,
          route_path: route.path,
          route_type: route.route_type,
          page_code: route.page_code,
          permission_code: route.permission_code,
          visible: route.visible,
          status: route.status,
          sort_order: route.sort_order,
        }));

      return {
        ...entityRecord,
        schema_json: toPrettyJson(entityRecord.schema ?? {}),
        permission_count: permissionRows.length,
        permission_rows: permissionRows,
        route_count: routeRows.length,
        route_rows: routeRows
      };
    });
  }

  private async saveEntity(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.entities.manage');
    const id = readOptionalString(postData.id);
    const code = readString(postData.code, 'code');
    const title = readString(postData.title, 'title');
    const tableName = readString(postData.table_name ?? postData.tableName, 'table_name');
    const routePath = readString(postData.route_path ?? postData.routePath, 'route_path');
    const pageCode = readOptionalString(postData.page_code ?? postData.pageCode) || null;
    const icon = readOptionalString(postData.icon);
    const description = readOptionalString(postData.description);
    const primaryKey = readString(postData.primary_key ?? postData.primaryKey, 'primary_key', 'id');
    const querySql = readOptionalString(postData.query_sql ?? postData.querySql);
    const status = normalizeStatus(postData.status, ['active', 'inactive'], 'active') as 'active' | 'inactive';
    const sortOrder = readNumber(postData.sort_order ?? postData.sortOrder, 0);
    const schema = readJsonObject(postData.schema_json ?? postData.schema);

    const payload = {
      code,
      title,
      table_name: tableName,
      route_path: routePath,
      page_code: pageCode,
      icon: icon || null,
      description: description || null,
      primary_key: primaryKey,
      query_sql: querySql || null,
      status,
      sort_order: sortOrder,
      schema,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { data, error } = await client
        .from('admin_entities')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        metadataTablesRequired(error);
        throw new BadRequestException(error.message);
      }

      return {
        ...data,
        schema_json: toPrettyJson((data as Record<string, unknown>).schema ?? {})
      };
    }

    const { data, error } = await client
      .from('admin_entities')
      .insert({
        ...payload,
        created_by: user.id
      })
      .select('*')
      .single();

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return {
      ...data,
      schema_json: toPrettyJson((data as Record<string, unknown>).schema ?? {})
    };
  }

  private async deleteEntity(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.entities.manage');
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      throw new BadRequestException('id or code is required.');
    }

    const query = id ? client.from('admin_entities').delete().eq('id', id) : client.from('admin_entities').delete().eq('code', code);
    const { error } = await query;

    if (error) {
      metadataTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async listOptionSources(context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.options.manage');
    const [
      { data: sources, error },
      { data: items, error: itemError }
    ] = await Promise.all([
      client
        .from('system_option_sources')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client.from('system_option_items').select('id, source_code')
    ]);

    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    if (itemError) {
      optionTablesRequired(itemError);
      throw new BadRequestException(itemError.message);
    }

    const itemCountBySource = new Map<string, number>();
    for (const item of (items ?? []) as Record<string, unknown>[]) {
      const sourceCode = readOptionalString(item.source_code);
      if (!sourceCode) continue;
      itemCountBySource.set(sourceCode, (itemCountBySource.get(sourceCode) ?? 0) + 1);
    }

    return ((sources ?? []) as Record<string, unknown>[]).map((source) => {
      const sourceCode = readOptionalString(source.code);
      const sourceType = readOptionalString(source.source_type);
      const status = readOptionalString(source.status);

      return {
        ...source,
        source_type_label: formatOptionSourceType(sourceType),
        status_label: formatOptionStatus(status),
        item_count: itemCountBySource.get(sourceCode) ?? 0,
        source_config_json: toPrettyJson(source.source_config ?? {})
      };
    });
  }

  private async saveOptionSource(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.options.manage');
    const id = readOptionalString(postData.id);
    const code = readString(postData.code, 'code');
    const name = readString(postData.name, 'name');
    const description = readOptionalString(postData.description);
    const sourceType = normalizeOptionSourceType(postData.source_type ?? postData.sourceType);
    const sourceConfig = readOptionSourceConfig(postData);
    const status = normalizeStatus(postData.status, ['active', 'inactive'], 'active') as
      | 'active'
      | 'inactive';
    const sortOrder = readNumber(postData.sort_order ?? postData.sortOrder, 0);
    const isSystem = readBoolean(postData.is_system ?? postData.isSystem, false);
    const cacheTtlSeconds = Math.max(
      Math.trunc(readNumber(postData.cache_ttl_seconds ?? postData.cacheTtlSeconds, 0)),
      0
    );

    assertOptionSourceConfig(sourceType, sourceConfig, status);

    const payload = {
      code,
      name,
      description: description || null,
      source_type: sourceType,
      source_config: sourceConfig,
      cache_ttl_seconds: cacheTtlSeconds,
      status,
      sort_order: sortOrder,
      is_system: isSystem,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { data, error } = await client
        .from('system_option_sources')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        optionTablesRequired(error);
        throw new BadRequestException(error.message);
      }

      return {
        ...data,
        source_config_json: toPrettyJson((data as Record<string, unknown>).source_config ?? {})
      };
    }

    const { data, error } = await client
      .from('system_option_sources')
      .insert({
        ...payload,
        created_by: user.id
      })
      .select('*')
      .single();

    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return {
      ...data,
      source_config_json: toPrettyJson((data as Record<string, unknown>).source_config ?? {})
    };
  }

  private async deleteOptionSource(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.options.manage');
    const id = readOptionalString(postData.id);
    const code = readOptionalString(postData.code);

    if (!id && !code) {
      throw new BadRequestException('id or code is required.');
    }

    const lookupQuery = id
      ? client.from('system_option_sources').select('id, is_system').eq('id', id)
      : client.from('system_option_sources').select('id, is_system').eq('code', code);
    const { data: source, error: lookupError } = await lookupQuery.maybeSingle();

    if (lookupError) {
      optionTablesRequired(lookupError);
      throw new BadRequestException(lookupError.message);
    }

    if (!source) {
      throw new NotFoundException('Option source not found.');
    }

    if ((source as Record<string, unknown>).is_system === true) {
      throw new BadRequestException('System option sources cannot be deleted.');
    }

    const deleteQuery = id
      ? client.from('system_option_sources').delete().eq('id', id)
      : client.from('system_option_sources').delete().eq('code', code);
    const { error } = await deleteQuery;

    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async listOptionItems(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const authorization = await getUserAuthorization(client, user.id);
    const canManage = hasRequiredPermission(authorization, 'admin.options.manage');
    const sourceCode = readOptionalString(
      postData.source_code ?? postData.sourceCode ?? postData.code
    );

    if (!sourceCode) {
      return [];
    }

    let sourceQuery = client
      .from('system_option_sources')
      .select('*')
      .eq('code', sourceCode);

    if (!canManage) {
      sourceQuery = sourceQuery.eq('status', 'active');
    }

    const { data: source, error: sourceError } = await sourceQuery.maybeSingle();

    if (sourceError) {
      optionTablesRequired(sourceError);
      throw new BadRequestException(sourceError.message);
    }

    if (!source) {
      return [];
    }

    const sourceRecord = source as Record<string, unknown>;
    const sourceType = normalizeOptionSourceType(sourceRecord.source_type);
    const sourceConfig = readJsonObject(sourceRecord.source_config);
    const tree = readBooleanLike(postData.tree ?? sourceConfig.tree, false);

    if (sourceType === 'dict') {
      return this.listDictOptionItems(client, sourceCode, sourceConfig, canManage, tree);
    }

    if (sourceType === 'table' || sourceType === 'view') {
      return this.listRelationOptionItems(client, sourceType, sourceCode, sourceConfig, postData, tree);
    }

    if (sourceType === 'rpc') {
      return this.listRpcOptionItems(client, sourceCode, sourceConfig, postData, tree);
    }

    if (sourceType === 'sql') {
      return this.listSqlOptionItems(client, sourceCode, sourceConfig, tree);
    }

    return [];
  }

  private async listDictOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceCode: string,
    sourceConfig: Record<string, unknown>,
    canManage: boolean,
    tree: boolean
  ) {
    let query = client
      .from('system_option_items')
      .select('*')
      .eq('source_code', sourceCode)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!canManage) {
      query = query.eq('status', 'active');
    }

    const { data, error } = await query;

    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return normalizeOptionRows(data ?? [], sourceCode, sourceConfig, tree);
  }

  private async listRelationOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceType: 'table' | 'view',
    sourceCode: string,
    sourceConfig: Record<string, unknown>,
    postData: PostData,
    tree: boolean
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
    const ascending = sourceConfig.ascending !== false;
    const limit = readPositiveLimit(postData.limit ?? sourceConfig.limit, 200, 1000);
    const filters = {
      ...readJsonObject(sourceConfig.filters),
      ...readJsonObject(postData.filters)
    };

    [
      labelField,
      valueField,
      disabledField,
      parentField,
      colorField,
      orderBy,
      ...Object.keys(filters)
    ]
      .filter(Boolean)
      .forEach((field) => assertIdentifierPath(field, 'source field'));

    const selectFields = Array.from(
      new Set(
        [labelField, valueField, disabledField, parentField, colorField]
          .filter(Boolean)
          .map((field) => field.split('.')[0])
      )
    ).join(',');

    const baseQuery =
      relation.schema === 'public'
        ? client.from(relation.name).select(selectFields)
        : client.schema(relation.schema).from(relation.name).select(selectFields);
    const query = applyOptionFilters(baseQuery, filters)
      .order(orderBy, { ascending })
      .limit(limit);
    const { data, error } = await query;

    if (error) {
      throw new BadRequestException(error.message);
    }

    return normalizeOptionRows(data ?? [], sourceCode, sourceConfig, tree);
  }

  private async listRpcOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceCode: string,
    sourceConfig: Record<string, unknown>,
    postData: PostData,
    tree: boolean
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

    if (error) {
      throw new BadRequestException(error.message);
    }

    const rows = Array.isArray(data) ? data : isRecord(data) ? [data] : [];
    return normalizeOptionRows(rows, sourceCode, sourceConfig, tree);
  }

  private async listSqlOptionItems(
    client: ReturnType<typeof createSupabaseClient>,
    sourceCode: string,
    sourceConfig: Record<string, unknown>,
    tree: boolean
  ) {
    const { data, error } = await client.rpc('execute_system_option_sql', {
      option_code: sourceCode
    });

    if (error) {
      if (isMissingFunctionError(error)) {
        throw new BadRequestException(
          'SQL option resolver is not created yet. Run supabase/migrations/20260728033000_system_option_sources.sql first.'
        );
      }
      throw new BadRequestException(error.message);
    }

    const rows = Array.isArray(data) ? data : [];
    return normalizeOptionRows(rows, sourceCode, sourceConfig, tree);
  }

  private async saveOptionItem(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.options.manage');
    const id = readOptionalString(postData.id);
    const sourceCode = readString(
      postData.source_code ?? postData.sourceCode,
      'source_code'
    );
    const label = readString(postData.label, 'label');
    const value = readString(postData.value, 'value');
    const parentValue = readOptionalString(postData.parent_value ?? postData.parentValue);
    const color = readOptionalString(postData.color);
    const disabled = readBoolean(postData.disabled, false);
    const status = normalizeStatus(postData.status, ['active', 'inactive'], 'active') as
      | 'active'
      | 'inactive';
    const sortOrder = readNumber(postData.sort_order ?? postData.sortOrder, 0);
    const isSystem = readBoolean(postData.is_system ?? postData.isSystem, false);
    const metadata = readJsonObject(postData.metadata_json ?? postData.metadata);

    const { data: source, error: sourceError } = await client
      .from('system_option_sources')
      .select('code, source_type')
      .eq('code', sourceCode)
      .maybeSingle();

    if (sourceError) {
      optionTablesRequired(sourceError);
      throw new BadRequestException(sourceError.message);
    }

    if (!source) {
      throw new NotFoundException('Option source not found.');
    }

    if ((source as Record<string, unknown>).source_type !== 'dict') {
      throw new BadRequestException('Only dict option sources can save manual items.');
    }

    const payload = {
      source_code: sourceCode,
      label,
      value,
      parent_value: parentValue || null,
      color: color || null,
      disabled,
      status,
      sort_order: sortOrder,
      is_system: isSystem,
      metadata,
      updated_by: user.id,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { data, error } = await client
        .from('system_option_items')
        .update(payload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        optionTablesRequired(error);
        throw new BadRequestException(error.message);
      }

      return {
        ...data,
        metadata_json: toPrettyJson((data as Record<string, unknown>).metadata ?? {})
      };
    }

    const { data, error } = await client
      .from('system_option_items')
      .insert({
        ...payload,
        created_by: user.id
      })
      .select('*')
      .single();

    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return {
      ...data,
      metadata_json: toPrettyJson((data as Record<string, unknown>).metadata ?? {})
    };
  }

  private async deleteOptionItem(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.options.manage');
    const id = readOptionalString(postData.id);
    const sourceCode = readOptionalString(postData.source_code ?? postData.sourceCode);
    const value = readOptionalString(postData.value);

    if (!id && (!sourceCode || !value)) {
      throw new BadRequestException('id or source_code + value is required.');
    }

    let lookupQuery = client
      .from('system_option_items')
      .select('id, is_system');
    lookupQuery = id
      ? lookupQuery.eq('id', id)
      : lookupQuery.eq('source_code', sourceCode).eq('value', value);
    const { data: item, error: lookupError } = await lookupQuery.maybeSingle();

    if (lookupError) {
      optionTablesRequired(lookupError);
      throw new BadRequestException(lookupError.message);
    }

    if (!item) {
      throw new NotFoundException('Option item not found.');
    }

    if ((item as Record<string, unknown>).is_system === true) {
      throw new BadRequestException('System option items cannot be deleted.');
    }

    const deleteQuery = id
      ? client.from('system_option_items').delete().eq('id', id)
      : client.from('system_option_items').delete().eq('source_code', sourceCode).eq('value', value);
    const { error } = await deleteQuery;

    if (error) {
      optionTablesRequired(error);
      throw new BadRequestException(error.message);
    }

    return { success: true };
  }

  private async listUsers(context: ServiceContext) {
    const { client } = await requireAdmin(context, 'admin.users.manage');
    const { data, error } = await client.rpc('get_admin_user_permission_rows');

    if (error) {
      if (isMissingFunctionError(error)) {
        throw new BadRequestException(
          'User permission profile function is not created yet. Run supabase/migrations/20260727010000_switch_user_table_to_permission_fields.sql first.'
        );
      }
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((userRow: Record<string, unknown>) => ({
      ...userRow,
      id: userRow.id ?? userRow.user_id,
      user_id: userRow.user_id ?? userRow.id,
      app_role_codes: readStringArray(userRow.app_role_codes ?? userRow.role_codes),
      app_role_names: readOptionalString(userRow.app_role_names ?? userRow.role_names),
      role_codes: readStringArray(userRow.role_codes ?? userRow.app_role_codes),
      role_names: readOptionalString(userRow.role_names ?? userRow.app_role_names),
      permission_codes: readStringArray(userRow.permission_codes),
      permission_names: readOptionalString(userRow.permission_names),
      account_ids: Array.isArray(userRow.account_ids) ? userRow.account_ids : [],
      account_roles: readStringArray(userRow.account_roles),
      account_names: readOptionalString(userRow.account_names),
      account_count: readNumber(userRow.account_count, 0),
      permission_count: readNumber(userRow.permission_count, 0),
      is_primary_account_owner: readBoolean(userRow.is_primary_account_owner, false)
    }));
  }

  private async saveUserRoles(postData: PostData, context: ServiceContext) {
    const { client, user } = await requireAdmin(context, 'admin.users.manage');
    const userId = readString(postData.user_id ?? postData.userId, 'user_id');
    const roleCodes = readStringArray(postData.role_codes ?? postData.roleCodes);

    const { data: roles, error: roleError } = await client
      .from('admin_roles')
      .select('id, code');

    if (roleError) {
      throw new BadRequestException(roleError.message);
    }

    const roleIds = (roles ?? [])
      .filter((role: Record<string, unknown>) => roleCodes.includes(String(role.code)))
      .map((role: Record<string, unknown>) => String(role.id));

    const { error: deleteError } = await client
      .from('admin_user_roles')
      .delete()
      .eq('user_id', userId);

    if (deleteError) {
      throw new BadRequestException(deleteError.message);
    }

    if (roleIds.length) {
      const { error: insertError } = await client.from('admin_user_roles').insert(
        roleIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
          assigned_by: user.id
        }))
      );

      if (insertError) {
        throw new BadRequestException(insertError.message);
      }
    }

    return {
      success: true,
      user_id: userId,
      app_role_codes: roleCodes,
      role_codes: roleCodes
    };
  }

  private async listSystemExecutionTasks(context: ServiceContext) {
    const { client } = await requireAdmin(context, [
      'workflow.runtime.manage',
      'workflow.definitions.manage'
    ]);
    let workflowClient = client;

    try {
      workflowClient = createSupabaseClient('admin');
    } catch {
      workflowClient = client;
    }

    const { data: jobs, error: jobError } = await workflowClient
      .from('wf_job')
      .select('*')
      .in('type', ['cron', 'interval', 'workflow_timer'])
      .order('updated_at', { ascending: false })
      .limit(200);

    if (jobError) {
      if (isMissingTableError(jobError)) return [];
      throw new BadRequestException(jobError.message);
    }

    const jobRows = (jobs ?? []) as Record<string, unknown>[];
    const jobIds = jobRows.map((job) => String(job.id ?? '')).filter(Boolean);
    const recentRunStats = new Map<string, Record<string, unknown>>();

    if (jobIds.length) {
      const { data: runs, error: runError } = await workflowClient
        .from('wf_job_run')
        .select('job_id,status,created_at,started_at,finished_at,error_message,trigger_run_id')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(jobIds.length * 20, 100), 1000));

      if (runError) {
        if (!isMissingTableError(runError)) {
          throw new BadRequestException(runError.message);
        }
      }

      for (const run of (runs ?? []) as Record<string, unknown>[]) {
        const jobId = String(run.job_id ?? '');
        if (!jobId) continue;

        const current = recentRunStats.get(jobId) ?? {
          recent_run_count: 0,
          last_run_status: '',
          last_run_at: '',
          last_error_message: '',
          last_trigger_run_id: ''
        };

        current.recent_run_count = readNumber(current.recent_run_count, 0) + 1;
        if (!current.last_run_at) {
          current.last_run_status = formatSystemTaskRunStatus(readOptionalString(run.status));
          current.last_run_at = readOptionalString(
            run.finished_at ?? run.started_at ?? run.created_at
          );
          current.last_error_message = readOptionalString(run.error_message);
          current.last_trigger_run_id = readOptionalString(run.trigger_run_id);
        }

        recentRunStats.set(jobId, current);
      }
    }

    return jobRows.map((job) => {
      const id = String(job.id ?? '');
      const intervalSeconds = readIntervalSeconds(job.payload);
      const type = readOptionalString(job.type);
      const stats = recentRunStats.get(id) ?? {};

      return {
        ...job,
        id,
        tenant_id: readOptionalString(job.tenant_id),
        code: readOptionalString(job.code),
        name: readOptionalString(job.name),
        type,
        type_label: formatSystemTaskType(type),
        status_label: formatSystemTaskStatus(readOptionalString(job.status)),
        trigger_task_id: readOptionalString(job.trigger_task_id),
        schedule_id: readOptionalString(job.schedule_id),
        cron_expr: readOptionalString(job.cron_expr),
        timezone: readOptionalString(job.timezone) || 'Asia/Shanghai',
        interval_seconds: intervalSeconds,
        schedule_rule: buildSystemTaskScheduleRule(job, intervalSeconds),
        recent_run_count: readNumber(stats.recent_run_count, 0),
        last_run_status: readOptionalString(stats.last_run_status),
        last_run_at: readOptionalString(stats.last_run_at),
        last_error_message: readOptionalString(stats.last_error_message),
        last_trigger_run_id: readOptionalString(stats.last_trigger_run_id),
        created_at: readOptionalString(job.created_at),
        updated_at: readOptionalString(job.updated_at)
      };
    });
  }

  private async listWorkflowJobs(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, [
      'workflow.runtime.manage',
      'workflow.definitions.manage'
    ]);
    let workflowClient = client;

    try {
      workflowClient = createSupabaseClient('admin');
    } catch {
      workflowClient = client;
    }

    const type = readOptionalString(postData.type);
    const status = readOptionalString(postData.status);
    const limit = readListLimit(postData.limit, 300, 1000);

    let query = workflowClient
      .from('wf_job')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (type) {
      query = query.eq('type', type);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    return ((data ?? []) as Record<string, unknown>[]).map((job) => {
      const jobType = readOptionalString(job.type);
      const intervalSeconds = readIntervalSeconds(job.payload);

      return {
        ...job,
        id: readOptionalString(job.id),
        tenant_id: readOptionalString(job.tenant_id),
        code: readOptionalString(job.code),
        name: readOptionalString(job.name),
        type: jobType,
        type_label: formatWorkflowJobType(jobType),
        status: readOptionalString(job.status),
        status_label: formatSystemTaskStatus(readOptionalString(job.status)),
        trigger_task_id: readOptionalString(job.trigger_task_id),
        schedule_id: readOptionalString(job.schedule_id),
        cron_expr: readOptionalString(job.cron_expr),
        timezone: readOptionalString(job.timezone) || 'Asia/Shanghai',
        interval_seconds: intervalSeconds,
        schedule_rule: buildSystemTaskScheduleRule(job, intervalSeconds),
        timeout_seconds: readNumber(job.timeout_seconds, 0) || null,
        concurrency_key: readOptionalString(job.concurrency_key),
        created_at: readOptionalString(job.created_at),
        updated_at: readOptionalString(job.updated_at)
      };
    });
  }

  private async listWorkflowJobRuns(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, ['workflow.runtime.manage']);
    let workflowClient = client;

    try {
      workflowClient = createSupabaseClient('admin');
    } catch {
      workflowClient = client;
    }

    const jobId = readOptionalString(postData.jobId ?? postData.job_id);
    const status = readOptionalString(postData.status);
    const limit = readListLimit(postData.limit, 500, 1000);

    let query = workflowClient
      .from('wf_job_run')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (jobId) {
      query = query.eq('job_id', jobId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    const runs = (data ?? []) as Record<string, unknown>[];
    const jobIds = Array.from(
      new Set(runs.map((run) => readOptionalString(run.job_id)).filter(Boolean))
    );
    const jobsById = new Map<string, Record<string, unknown>>();

    if (jobIds.length) {
      const { data: jobs, error: jobError } = await workflowClient
        .from('wf_job')
        .select('id,code,name,type')
        .in('id', jobIds);

      if (jobError) {
        if (!isMissingTableError(jobError)) {
          throw new BadRequestException(jobError.message);
        }
      }

      for (const job of (jobs ?? []) as Record<string, unknown>[]) {
        jobsById.set(readOptionalString(job.id), job);
      }
    }

    return runs.map((run) => {
      const relatedJob = jobsById.get(readOptionalString(run.job_id));

      return {
        ...run,
        id: readOptionalString(run.id),
        tenant_id: readOptionalString(run.tenant_id),
        job_id: readOptionalString(run.job_id),
        job_code: readOptionalString(relatedJob?.code),
        job_name: readOptionalString(relatedJob?.name),
        job_type: readOptionalString(relatedJob?.type),
        trigger_run_id: readOptionalString(run.trigger_run_id),
        status: readOptionalString(run.status),
        status_label: formatSystemTaskRunStatus(readOptionalString(run.status)),
        attempt: readNumber(run.attempt, 1),
        error_message: readOptionalString(run.error_message),
        duration_ms: calculateDurationMs(run.started_at, run.finished_at),
        started_at: readOptionalString(run.started_at),
        finished_at: readOptionalString(run.finished_at),
        created_at: readOptionalString(run.created_at)
      };
    });
  }

  private async listWorkflowTimerJobs(postData: PostData, context: ServiceContext) {
    const { client } = await requireAdmin(context, ['workflow.runtime.manage']);
    let workflowClient = client;

    try {
      workflowClient = createSupabaseClient('admin');
    } catch {
      workflowClient = client;
    }

    const status = readOptionalString(postData.status);
    const limit = readListLimit(postData.limit, 500, 1000);

    let query = workflowClient
      .from('wf_timer_job')
      .select('*')
      .order('due_at', { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    return ((data ?? []) as Record<string, unknown>[]).map((timer) => {
      const statusValue = readOptionalString(timer.status);
      const dueAt = readOptionalString(timer.due_at);

      return {
        ...timer,
        id: readOptionalString(timer.id),
        tenant_id: readOptionalString(timer.tenant_id),
        process_instance_id: readOptionalString(timer.process_instance_id),
        node_instance_id: readOptionalString(timer.node_instance_id),
        node_id: readOptionalString(timer.node_id),
        definition_id: readOptionalString(timer.definition_id),
        definition_version: readNumber(timer.definition_version, 0),
        due_at: dueAt,
        status: statusValue,
        status_label: formatWorkflowTimerStatus(statusValue),
        due_state: buildTimerDueState(statusValue, dueAt),
        trigger_run_id: readOptionalString(timer.trigger_run_id),
        created_at: readOptionalString(timer.created_at),
        updated_at: readOptionalString(timer.updated_at)
      };
    });
  }
}

function readListLimit(value: unknown, fallback: number, max: number) {
  const limit = readNumber(value, fallback);
  return Math.min(Math.max(Math.trunc(limit), 1), max);
}

function readIntervalSeconds(payload: unknown) {
  if (!isRecord(payload)) return null;

  const intervalSeconds = readNumber(
    payload.intervalSeconds ?? payload.interval_seconds,
    0
  );

  return intervalSeconds > 0 ? intervalSeconds : null;
}

function buildSystemTaskScheduleRule(
  job: Record<string, unknown>,
  intervalSeconds: number | null
) {
  const type = readOptionalString(job.type);

  if (type === 'cron') {
    return readOptionalString(job.cron_expr) || '-';
  }

  if (type === 'interval') {
    return intervalSeconds ? `${intervalSeconds}s` : '60s';
  }

  if (type === 'workflow_timer') {
    return '\u5de5\u4f5c\u6d41\u5b9a\u65f6\u5668';
  }

  return type || '-';
}

function formatSystemTaskType(type: string) {
  switch (type) {
    case 'cron':
      return 'Cron';
    case 'interval':
      return '\u95f4\u9694\u4efb\u52a1';
    case 'workflow_timer':
      return '\u5de5\u4f5c\u6d41\u5b9a\u65f6\u5668';
    default:
      return type || '-';
  }
}

function formatWorkflowJobType(type: string) {
  switch (type) {
    case 'once':
      return '\u5355\u6b21\u4efb\u52a1';
    case 'cron':
      return 'Cron';
    case 'interval':
      return '\u95f4\u9694\u4efb\u52a1';
    case 'manual':
      return '\u624b\u52a8\u4efb\u52a1';
    case 'workflow_timer':
      return '\u5de5\u4f5c\u6d41\u5b9a\u65f6\u5668';
    case 'service_task':
      return '\u670d\u52a1\u4efb\u52a1';
    default:
      return type || '-';
  }
}

function formatSystemTaskStatus(status: string) {
  switch (status) {
    case 'draft':
      return '\u8349\u7a3f';
    case 'enabled':
      return '\u5df2\u542f\u7528';
    case 'disabled':
      return '\u5df2\u7981\u7528';
    case 'archived':
      return '\u5df2\u5f52\u6863';
    default:
      return status || '-';
  }
}

function formatSystemTaskRunStatus(status: string) {
  switch (status) {
    case 'queued':
      return '\u6392\u961f\u4e2d';
    case 'running':
      return '\u6267\u884c\u4e2d';
    case 'succeeded':
      return '\u6210\u529f';
    case 'failed':
      return '\u5931\u8d25';
    case 'canceled':
      return '\u5df2\u53d6\u6d88';
    default:
      return status || '-';
  }
}

function formatWorkflowTimerStatus(status: string) {
  switch (status) {
    case 'waiting':
      return '\u7b49\u5f85\u4e2d';
    case 'firing':
      return '\u89e6\u53d1\u4e2d';
    case 'fired':
      return '\u5df2\u89e6\u53d1';
    case 'failed':
      return '\u5931\u8d25';
    case 'canceled':
      return '\u5df2\u53d6\u6d88';
    default:
      return status || '-';
  }
}

function calculateDurationMs(startedAt: unknown, finishedAt: unknown) {
  const startText = readOptionalString(startedAt);
  const finishText = readOptionalString(finishedAt);
  if (!startText || !finishText) return null;

  const startTime = Date.parse(startText);
  const finishTime = Date.parse(finishText);
  if (!Number.isFinite(startTime) || !Number.isFinite(finishTime)) return null;

  return Math.max(finishTime - startTime, 0);
}

function buildTimerDueState(status: string, dueAt: string) {
  if (status !== 'waiting' || !dueAt) return '-';

  const dueTime = Date.parse(dueAt);
  if (!Number.isFinite(dueTime)) return '-';

  return dueTime <= Date.now() ? '\u5df2\u5230\u671f' : '\u672a\u5230\u671f';
}
