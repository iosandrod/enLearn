import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { ServiceContext, ServiceExecutor } from '../common/interfaces/service-executor';
import {
  createSupabaseClient,
  getCurrentUser,
  getUserAuthorization,
  hasRequiredPermission,
  requireAdmin
} from '../common/utils/supabase';

type PostData = Record<string, unknown>;

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
      case 'listRoles':
        return this.listRoles(context);
      case 'getRole':
        return this.getRole(postData, context);
      case 'saveRole':
        return this.saveRole(postData, context);
      case 'deleteRole':
        return this.deleteRole(postData, context);
      case 'listPermissions':
        return this.listPermissions(context);
      case 'savePermission':
        return this.savePermission(postData, context);
      case 'deletePermission':
        return this.deletePermission(postData, context);
      case 'listRoutes':
        return this.listRoutes(context);
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
        return this.listEntities(context);
      case 'saveEntity':
        return this.saveEntity(postData, context);
      case 'deleteEntity':
        return this.deleteEntity(postData, context);
      case 'listUsers':
        return this.listUsers(context);
      case 'saveUserRoles':
        return this.saveUserRoles(postData, context);
      default:
        throw new BadRequestException(`Unsupported admin method: ${method}`);
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
    for (const mapping of rolePermissions ?? []) {
      const roleId = String((mapping as Record<string, unknown>).role_id ?? '');
      const permissionId = String((mapping as Record<string, unknown>).permission_id ?? '');
      if (!roleId || !permissionId) continue;
      const permission = permissionsById.get(permissionId);
      const codes = permissionsByRoleId.get(roleId) ?? [];
      if (permission?.code) {
        codes.push(String(permission.code));
        permissionsByRoleId.set(roleId, codes);
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
        permission_names: permissionNames
      };
    });
  }

  private async getRole(postData: PostData, context: ServiceContext) {
    const roles = await this.listRoles(context);
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
    const { data, error } = await client
      .from('admin_permissions')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    return data ?? [];
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
    const { data, error } = await client
      .from('admin_entities')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error)) return [];
      throw new BadRequestException(error.message);
    }

    return (data ?? []).map((entity) => ({
      ...entity,
      schema_json: toPrettyJson((entity as Record<string, unknown>).schema ?? {})
    }));
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
}
