import { BadRequestException, Injectable } from '@nestjs/common';
import {
  BaseService,
  type ListItemsHandler
} from '../common/base.service';
import type { ServiceContext } from '../common/interfaces/service-executor';
import {
  clearAllUserAuthorizationCaches,
  createSupabaseClient,
  getCurrentUser,
  requireAdmin,
  updateCurrentUser
} from '../common/utils/supabase';

type PostData = Record<string, unknown>;

function readString(value: unknown, name: string, fallback = '') {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (fallback) {
    return fallback;
  }

  throw new BadRequestException(`Missing required field: ${name}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return [...new Set(value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter(Boolean))];
}

function readBatch(value: unknown, name: string) {
  if (!Array.isArray(value)) throw new BadRequestException(`${name} must be an array.`);
  if (value.length > 500) throw new BadRequestException(`${name} cannot contain more than 500 items.`);
  return value.filter(isRecord);
}

const MATRIX_ACTIONS = [
  { code: 'view', label: '查看' },
  { code: 'create', label: '新增' },
  { code: 'update', label: '编辑' },
  { code: 'delete', label: '删除' },
  { code: 'export', label: '导出' }
] as const;

type MatrixActionCode = typeof MATRIX_ACTIONS[number]['code'];

function normalizeActionCode(value: unknown, permissionCode = ''): MatrixActionCode | '' {
  const raw = String(value ?? '').trim().toLowerCase();
  const code = raw || permissionCode.split('.').pop()?.toLowerCase() || '';
  if (['view', 'read', 'list', 'query', 'get'].includes(code)) return 'view';
  if (['create', 'add', 'new', 'insert'].includes(code)) return 'create';
  if (['update', 'edit', 'modify', 'write'].includes(code)) return 'update';
  if (['delete', 'remove', 'destroy'].includes(code)) return 'delete';
  if (['export', 'download'].includes(code)) return 'export';
  return '';
}

function normalizePermissionRow(value: Record<string, unknown>, index: number) {
  const code = readString(value.code, `permissions[${index}].code`);
  const name = readString(value.name ?? value.title, `permissions[${index}].name`, code);
  const row: Record<string, unknown> = {
    code,
    name,
    description: typeof value.description === 'string' ? value.description.trim() || null : null,
    resource_type: typeof value.resource_type === 'string' ? value.resource_type.trim() || null : null,
    resource_key: typeof value.resource_key === 'string' ? value.resource_key.trim() || null : null,
    action_code: typeof value.action_code === 'string' ? value.action_code.trim() || null : null,
    route_path: typeof value.route_path === 'string' ? value.route_path.trim() || null : null,
    page_code: typeof value.page_code === 'string' ? value.page_code.trim() || null : null,
    entity_code: typeof value.entity_code === 'string' ? value.entity_code.trim() || null : null,
    status: value.status === 'inactive' ? 'inactive' : 'active',
    sort_order: typeof value.sort_order === 'number' && Number.isFinite(value.sort_order)
      ? Math.trunc(value.sort_order)
      : 0
  };
  const id = typeof value.id === 'string' ? value.id.trim() : '';
  if (id) row.id = id;
  return row;
}

@Injectable()
export class UserService extends BaseService {
  protected override async executeAction(method: string, postData: PostData, context: ServiceContext) {
    switch (method) {
      case 'updateProfile':
        return this.updateProfile(postData, context);
      case 'updateEmail':
        return this.updateEmail(postData, context);
      case 'updateSettings':
        return this.updateSettings(postData, context);
      case 'listPermissionMatrix':
      case 'getPermissionMatrix':
        return this.listPermissionMatrix(postData, context);
      case 'listPermissions':
      case 'listPermissionDefinitions':
        return this.listPermissionDefinitions(context);
      case 'createPermissionsBatch':
      case 'batchCreatePermissions':
      case 'createPermission':
        return this.createPermissionsBatch(postData, context);
      case 'updatePermissionsBatch':
      case 'batchUpdatePermissions':
      case 'updatePermission':
        return this.updatePermissionsBatch(postData, context);
      case 'deletePermissionsBatch':
      case 'batchDeletePermissions':
      case 'deletePermission':
        return this.deletePermissionsBatch(postData, context);
      case 'replaceRolePermissions':
      case 'overwriteRolePermissions':
      case 'savePermissionMatrix':
        return this.savePermissionMatrix(postData, context);
      case 'mergeRolePermissions':
        return this.savePermissionMatrix({ ...postData, mode: 'merge' }, context);
      default:
        return super.executeAction(method, postData, context);
    }
  }

  protected override defaultListItemsType() {
    return 'me';
  }

  protected override listItemHandlers(): Record<string, ListItemsHandler> {
    return {
      me: (_postData, context) => this.listMe(context),
      profile: (_postData, context) => this.listMe(context)
    };
  }

  private async listMe(context: ServiceContext) {
    return [await this.me(context)];
  }

  private async me(context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const { data: profile, error } = await client
      .from('users')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      user,
      profile: profile ?? null
    };
  }

  private async updateProfile(postData: PostData, context: ServiceContext) {
    const { client, user } = await getCurrentUser(context);
    const fullName = readString(postData.fullName, 'fullName');
    const avatarUrl =
      typeof postData.avatarUrl === 'string' ? postData.avatarUrl.trim() : '';

    const { error: authError } = await updateCurrentUser(context, {
      data: {
        full_name: fullName,
        avatar_url: avatarUrl || undefined
      }
    });

    if (authError) {
      throw new BadRequestException(authError.message);
    }

    try {
      await this.runCrud('update', {
        resource: 'users',
        id: user.id,
        data: {
        full_name: fullName,
        avatar_url: avatarUrl || null
        }
      }, context);
    } catch (error) {
      // Auth metadata was already updated. Restore it when the profile projection
      // fails so callers do not observe a split update across the two systems.
      await updateCurrentUser(context, {
        data: {
          full_name: user.user_metadata?.full_name,
          avatar_url: user.user_metadata?.avatar_url
        }
      }).catch(() => undefined);
      throw error;
    }

    return {
      success: true,
      fullName,
      avatarUrl: avatarUrl || null
    };
  }

  private async updateEmail(postData: PostData, context: ServiceContext) {
    await getCurrentUser(context);
    const email = readString(postData.email, 'email');

    const { error } = await updateCurrentUser(context, { email });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      email
    };
  }

  private async updateSettings(postData: PostData, context: ServiceContext) {
    await getCurrentUser(context);
    const settings = postData.settings;

    if (typeof settings !== 'object' || settings === null || Array.isArray(settings)) {
      throw new BadRequestException('settings must be an object.');
    }

    const { data, error } = await updateCurrentUser(context, {
      data: {
        dashboard_settings: settings as Record<string, unknown>
      }
    });

    if (error) {
      throw new BadRequestException(error.message);
    }

    return {
      success: true,
      user: data.user
    };
  }

  private async requirePermissionAdmin(context: ServiceContext) {
    return requireAdmin(context, ['admin.roles.manage', 'admin.permissions.manage']);
  }

  private async listPermissionDefinitions(context: ServiceContext) {
    await this.requirePermissionAdmin(context);
    const client = createSupabaseClient('admin', context);
    const { data, error } = await client
      .from('admin_permissions')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('code', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  private async listPermissionMatrix(postData: PostData, context: ServiceContext) {
    await this.requirePermissionAdmin(context);
    const client = createSupabaseClient('admin', context);
    const rolesPromise = client.from('admin_roles')
      .select('id, code, name, description, parent_id, status, sort_order, is_system')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    const [rolesResult, routesResult, permissionsResult] = await Promise.all([
      rolesPromise,
      client.from('admin_routes')
        .select('id, code, title, path, parent_id, route_type, icon, page_code, permission_code, status, sort_order')
        .eq('status', 'active')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      client.from('admin_permissions')
        .select('*')
        .eq('status', 'active')
        .order('sort_order', { ascending: true })
        .order('code', { ascending: true })
    ]);
    let rolesData = rolesResult.data;
    let rolesError = rolesResult.error;
    // Older installations may not have applied the role hierarchy migration
    // yet. Keep the matrix usable while treating every role as a root node.
    if (rolesResult.error && /parent_id|column .* does not exist/i.test(rolesResult.error.message)) {
      const fallbackRolesResult = await client.from('admin_roles')
        .select('id, code, name, description, status, sort_order, is_system')
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      rolesData = (fallbackRolesResult.data ?? []).map((role) => ({ ...role, parent_id: null }));
      rolesError = fallbackRolesResult.error;
    }
    if (rolesError) throw new BadRequestException(rolesError.message);
    if (routesResult.error) throw new BadRequestException(routesResult.error.message);
    if (permissionsResult.error) throw new BadRequestException(permissionsResult.error.message);

    const roles = (rolesData ?? []) as Record<string, unknown>[];
    const routes = (routesResult.data ?? []) as Record<string, unknown>[];
    const permissions = (permissionsResult.data ?? []) as Record<string, unknown>[];
    const requestedRoleId = typeof postData.roleId === 'string'
      ? postData.roleId.trim()
      : typeof postData.role_id === 'string' ? postData.role_id.trim() : '';
    const selectedRole = roles.find((role) => String(role.id ?? '') === requestedRoleId) ?? roles[0];
    const selectedRoleId = String(selectedRole?.id ?? '');
    let assignedIds = new Set<string>();
    if (selectedRoleId) {
      const assignedResult = await client
        .from('admin_role_permissions')
        .select('permission_id')
        .eq('role_id', selectedRoleId);
      if (assignedResult.error) throw new BadRequestException(assignedResult.error.message);
      assignedIds = new Set((assignedResult.data ?? [])
        .map((row: Record<string, unknown>) => String(row.permission_id ?? ''))
        .filter(Boolean));
    }

    const permissionMatchesRoute = (permission: Record<string, unknown>, route: Record<string, unknown>) => {
      const keys = [route.code, route.path, route.page_code, route.permission_code]
        .map((value) => String(value ?? '').trim())
        .filter(Boolean);
      const resourceKey = String(permission.resource_key ?? '').trim();
      const routePath = String(permission.route_path ?? '').trim();
      const pageCode = String(permission.page_code ?? '').trim();
      const permissionCode = String(permission.code ?? '').trim();
      return (resourceKey && keys.includes(resourceKey)) ||
        (resourceKey && String(route.code ?? '').startsWith(`${resourceKey}-`)) ||
        (resourceKey && String(route.path ?? '').split('/').includes(resourceKey)) ||
        (routePath && keys.includes(routePath)) ||
        (pageCode && keys.includes(pageCode)) ||
        (permissionCode && keys.includes(permissionCode)) ||
        (permissionCode && keys.some((key) => permissionCode.startsWith(`${key}.`)));
    };

    const byParent = new Map<string, number>();
    const sortedRoutes = [...routes].sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
    const rows = sortedRoutes.map((route) => {
      const parentId = String(route.parent_id ?? '');
      const depth = parentId ? (byParent.get(parentId) ?? 0) + 1 : 0;
      byParent.set(String(route.id ?? ''), depth);
      const matches = permissions.filter((permission) => permissionMatchesRoute(permission, route));
      const actionMap: Record<string, unknown> = {};
      for (const action of MATRIX_ACTIONS) {
        const permission = matches.find((item) => normalizeActionCode(item.action_code, String(item.code ?? '')) === action.code) ??
          (['create', 'update', 'delete'].includes(action.code)
            ? matches.find((item) => String(item.action_code ?? '').trim().toLowerCase() === 'manage')
            : undefined);
        actionMap[action.code] = permission
          ? {
              id: permission.id,
              code: permission.code,
              name: permission.name,
              selected: assignedIds.has(String(permission.id ?? ''))
            }
          : null;
      }
      return {
        id: route.id,
        code: route.code,
        title: route.title,
        path: route.path,
        parent_id: route.parent_id ?? null,
        route_type: route.route_type,
        icon: route.icon ?? null,
        page_code: route.page_code ?? null,
        depth,
        actions: actionMap,
        selected: Object.values(actionMap).some((item) => isRecord(item) && item.selected === true)
      };
    });

    return {
      roles,
      role: selectedRole ?? null,
      selectedRoleId,
      columns: MATRIX_ACTIONS,
      rows,
      permissions
    };
  }

  private async createPermissionsBatch(postData: PostData, context: ServiceContext) {
    await this.requirePermissionAdmin(context);
    const input = readBatch(
      postData.permissions ?? postData.items ?? (isRecord(postData.data) ? [postData.data] : undefined),
      'permissions'
    );
    if (!input.length) return [];
    const rows = input.map(normalizePermissionRow).map((row) => {
      delete row.id;
      return row;
    });
    const client = createSupabaseClient('admin', context);
    const { data, error } = await client.from('admin_permissions').insert(rows).select('*');
    if (error) throw new BadRequestException(error.message);
    clearAllUserAuthorizationCaches();
    return data ?? [];
  }

  private async updatePermissionsBatch(postData: PostData, context: ServiceContext) {
    await this.requirePermissionAdmin(context);
    const input = readBatch(
      postData.permissions ?? postData.items ?? (isRecord(postData.data) ? [postData.data] : undefined),
      'permissions'
    );
    if (!input.length) return [];
    const rows = input.map(normalizePermissionRow);
    if (rows.some((row) => !row.id)) {
      throw new BadRequestException('Every permission update requires an id.');
    }
    const client = createSupabaseClient('admin', context);
    const { data, error } = await client.from('admin_permissions').upsert(rows, { onConflict: 'id' }).select('*');
    if (error) throw new BadRequestException(error.message);
    clearAllUserAuthorizationCaches();
    return data ?? [];
  }

  private async deletePermissionsBatch(postData: PostData, context: ServiceContext) {
    await this.requirePermissionAdmin(context);
    const ids = readStringArray(postData.permissionIds ?? postData.permission_ids ?? postData.ids ?? [postData.id]);
    if (!ids.length) return { success: true, deleted: 0 };
    const client = createSupabaseClient('admin', context);
    const { error, count } = await client
      .from('admin_permissions')
      .delete({ count: 'exact' })
      .in('id', ids);
    if (error) throw new BadRequestException(error.message);
    clearAllUserAuthorizationCaches();
    return { success: true, deleted: count ?? ids.length };
  }

  private async savePermissionMatrix(postData: PostData, context: ServiceContext) {
    await this.requirePermissionAdmin(context);
    const roleId = readString(postData.roleId ?? postData.role_id, 'roleId');
    const permissionIds = readStringArray(
      postData.permissionIds ?? postData.permission_ids ?? postData.selectedPermissionIds
    );
    const permissionCodes = readStringArray(postData.permissionCodes ?? postData.permission_codes);
    const client = createSupabaseClient('admin', context);
    const roleResult = await client.from('admin_roles').select('id').eq('id', roleId).maybeSingle();
    if (roleResult.error) throw new BadRequestException(roleResult.error.message);
    if (!roleResult.data) throw new BadRequestException('Role was not found.');

    let resolvedIds = permissionIds;
    if (permissionCodes.length) {
      const permissionResult = await client.from('admin_permissions').select('id, code').in('code', permissionCodes);
      if (permissionResult.error) throw new BadRequestException(permissionResult.error.message);
      const byCode = new Map((permissionResult.data ?? []).map((row) => [String(row.code ?? ''), String(row.id ?? '')]));
      const missing = permissionCodes.filter((code) => !byCode.has(code));
      if (missing.length) throw new BadRequestException(`Unknown permission code: ${missing.join(', ')}`);
      resolvedIds = permissionCodes.map((code) => byCode.get(code) ?? '').filter(Boolean);
    }
    resolvedIds = [...new Set(resolvedIds)];
    if (resolvedIds.length) {
      const permissionResult = await client.from('admin_permissions').select('id').in('id', resolvedIds);
      if (permissionResult.error) throw new BadRequestException(permissionResult.error.message);
      const foundIds = new Set((permissionResult.data ?? []).map((row) => String(row.id ?? '')));
      const missingIds = resolvedIds.filter((id) => !foundIds.has(id));
      if (missingIds.length) throw new BadRequestException(`Unknown permission id: ${missingIds.join(', ')}`);
    }
    if (postData.mode === 'merge') {
      if (resolvedIds.length) {
        const { error } = await client.from('admin_role_permissions').upsert(
          resolvedIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })),
          { onConflict: 'role_id,permission_id' }
        );
        if (error) throw new BadRequestException(error.message);
      }
    } else {
      const existingResult = await client.from('admin_role_permissions')
        .select('permission_id')
        .eq('role_id', roleId);
      if (existingResult.error) throw new BadRequestException(existingResult.error.message);
      const staleIds = (existingResult.data ?? [])
        .map((row) => String(row.permission_id ?? ''))
        .filter((permissionId) => !resolvedIds.includes(permissionId));
      if (resolvedIds.length) {
        const { error } = await client.from('admin_role_permissions').upsert(
          resolvedIds.map((permissionId) => ({ role_id: roleId, permission_id: permissionId })),
          { onConflict: 'role_id,permission_id' }
        );
        if (error) throw new BadRequestException(error.message);
      }
      if (staleIds.length) {
        const { error } = await client.from('admin_role_permissions')
          .delete()
          .eq('role_id', roleId)
          .in('permission_id', staleIds);
        if (error) throw new BadRequestException(error.message);
      }
    }
    clearAllUserAuthorizationCaches();
    return { success: true, roleId, permissionIds: resolvedIds, mode: postData.mode === 'merge' ? 'merge' : 'overwrite' };
  }
}
