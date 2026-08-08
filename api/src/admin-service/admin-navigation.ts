export type AdminNavigationRoute = {
  id: string;
  code: string;
  title: string;
  path: string;
  parent_id: string | null;
  route_type: 'group' | 'page' | 'link';
  icon: string | null;
  page_code: string | null;
  permission_code: string | null;
  visible: boolean;
  keep_alive: boolean;
  layout: 'default' | 'dashboard' | 'blank';
  status: string;
  sort_order: number;
  metadata: Record<string, unknown>;
};

const NAVIGATION_FIELDS = [
  'id',
  'code',
  'title',
  'path',
  'parent_id',
  'route_type',
  'icon',
  'page_code',
  'permission_code',
  'visible',
  'keep_alive',
  'layout',
  'status',
  'sort_order',
  'metadata'
] as const;

export const ADMIN_NAVIGATION_SELECT = NAVIGATION_FIELDS.join(', ');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readNullableString(value: unknown) {
  const result = readString(value);
  return result || null;
}

function normalizeRouteType(value: unknown): AdminNavigationRoute['route_type'] {
  return value === 'group' || value === 'link' ? value : 'page';
}

function normalizeLayout(value: unknown): AdminNavigationRoute['layout'] {
  return value === 'default' || value === 'blank' ? value : 'dashboard';
}

export function normalizeAdminNavigationRoute(value: unknown): AdminNavigationRoute | null {
  if (!isRecord(value)) return null;

  const id = readString(value.id);
  const code = readString(value.code);
  const title = readString(value.title);
  const path = readString(value.path);
  if (!id || !code || !title || !path) return null;

  return {
    id,
    code,
    title,
    path,
    parent_id: readNullableString(value.parent_id),
    route_type: normalizeRouteType(value.route_type),
    icon: readNullableString(value.icon),
    page_code: readNullableString(value.page_code),
    permission_code: readNullableString(value.permission_code),
    visible: value.visible !== false,
    keep_alive: value.keep_alive === true,
    layout: normalizeLayout(value.layout),
    status: readString(value.status) || 'active',
    sort_order:
      typeof value.sort_order === 'number' && Number.isFinite(value.sort_order)
        ? value.sort_order
        : 0,
    metadata: isRecord(value.metadata) ? value.metadata : {}
  };
}

function hasRoutePermission(
  route: AdminNavigationRoute,
  permissions: Set<string>,
  isLegacyAdmin: boolean
) {
  return isLegacyAdmin || !route.permission_code || permissions.has(route.permission_code);
}

/**
 * Filters a flat route registry while preserving the authorization semantics
 * of the dashboard tree: a child is available only when every known ancestor
 * is visible, active, and permitted too.
 */
export function selectAuthorizedNavigationRoutes(
  values: unknown[],
  permissionCodes: string[],
  isLegacyAdmin = false,
  options: { includeHidden?: boolean } = {}
) {
  const routes = values
    .map(normalizeAdminNavigationRoute)
    .filter((route): route is AdminNavigationRoute => Boolean(route));
  const byId = new Map(routes.map((route) => [route.id, route]));
  const permissions = new Set(permissionCodes.map((code) => code.trim()).filter(Boolean));
  const accessCache = new Map<string, boolean>();

  function canAccess(route: AdminNavigationRoute, visiting = new Set<string>()): boolean {
    const cached = accessCache.get(route.id);
    if (typeof cached === 'boolean') return cached;
    if (visiting.has(route.id)) {
      accessCache.set(route.id, false);
      return false;
    }

    const nextVisiting = new Set(visiting);
    nextVisiting.add(route.id);
    const selfAllowed =
      (options.includeHidden || route.visible) &&
      route.status === 'active' &&
      hasRoutePermission(route, permissions, isLegacyAdmin);
    const parent = route.parent_id ? byId.get(route.parent_id) : undefined;
    const allowed = selfAllowed && (!parent || canAccess(parent, nextVisiting));
    accessCache.set(route.id, allowed);
    return allowed;
  }

  return routes
    .filter((route) => canAccess(route))
    .sort((left, right) => {
      if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
      return left.title.localeCompare(right.title, 'zh-Hans-CN');
    });
}
