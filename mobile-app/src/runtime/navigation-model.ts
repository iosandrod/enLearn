export type MobileNavigationRow = {
  id: string;
  code: string;
  title: string;
  path: string;
  parent_id?: string | null;
  route_type?: 'group' | 'page' | 'link';
  icon?: string | null;
  page_code?: string | null;
  permission_code?: string | null;
  visible?: boolean;
  keep_alive?: boolean;
  layout?: 'default' | 'dashboard' | 'blank';
  status?: string;
  sort_order?: number;
  metadata?: Record<string, unknown>;
};

export type MobileNavigationNode = MobileNavigationRow & {
  children: MobileNavigationNode[];
};

type NavigationPlacement = 'sidebar' | 'top-tool' | 'container' | 'hidden';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function readPlacement(value: unknown): NavigationPlacement | '' {
  return value === 'sidebar' ||
    value === 'top-tool' ||
    value === 'container' ||
    value === 'hidden'
    ? value
    : '';
}

function routeMetadata(route: MobileNavigationRow) {
  return isRecord(route.metadata) ? route.metadata : {};
}

function routePlacement(route: MobileNavigationRow) {
  const metadata = routeMetadata(route);
  return readPlacement(metadata.mobileNavigation ?? metadata.navigation);
}

function isMobileDisabled(route: MobileNavigationRow) {
  const metadata = routeMetadata(route);
  return metadata.mobile === false || metadata.mobileEnabled === false;
}

export function normalizeMobileNavigationRows(values: unknown[]) {
  return values.flatMap<MobileNavigationRow>((value) => {
    if (!isRecord(value)) return [];
    const id = readString(value.id);
    const code = readString(value.code);
    const title = readString(value.title);
    const path = readString(value.path);
    if (!id || !code || !title || !path) return [];

    const routeType = value.route_type === 'group' || value.route_type === 'link'
      ? value.route_type
      : 'page';
    const layout = value.layout === 'default' || value.layout === 'blank'
      ? value.layout
      : 'dashboard';

    return [{
      id,
      code,
      title,
      path,
      parent_id: readString(value.parent_id) || null,
      route_type: routeType,
      icon: readString(value.icon) || null,
      page_code: readString(value.page_code) || null,
      permission_code: readString(value.permission_code) || null,
      visible: value.visible !== false,
      keep_alive: value.keep_alive === true,
      layout,
      status: readString(value.status) || 'active',
      sort_order: typeof value.sort_order === 'number' && Number.isFinite(value.sort_order)
        ? value.sort_order
        : 0,
      metadata: isRecord(value.metadata) ? value.metadata : {},
    }];
  });
}

export function sortMobileNavigationNodes<T extends MobileNavigationRow>(nodes: T[]) {
  return [...nodes].sort((left, right) => {
    const sortDifference = (left.sort_order ?? 0) - (right.sort_order ?? 0);
    return sortDifference || left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
}

export function buildMobileNavigationTree(rows: MobileNavigationRow[]) {
  const byId = new Map<string, MobileNavigationNode>();
  const roots: MobileNavigationNode[] = [];

  rows
    .filter((row) => row.visible !== false && row.status !== 'inactive')
    .forEach((row) => byId.set(row.id, { ...row, children: [] }));

  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  function sortBranch(node: MobileNavigationNode): MobileNavigationNode {
    return {
      ...node,
      children: sortMobileNavigationNodes(node.children.map(sortBranch)),
    };
  }

  return sortMobileNavigationNodes(roots.map(sortBranch));
}

function projectBranch(node: MobileNavigationNode): MobileNavigationNode | null {
  if (isMobileDisabled(node)) return null;
  const children = projectChildren(node.children);
  if (!node.page_code && !children.length) return null;
  return { ...node, children };
}

function projectChildren(children: MobileNavigationNode[]): MobileNavigationNode[] {
  return sortMobileNavigationNodes(children.flatMap((child) => {
    const placement = routePlacement(child);
    if (placement === 'hidden' || placement === 'top-tool' || isMobileDisabled(child)) return [];
    if (placement === 'container') return projectChildren(child.children);
    const projected = projectBranch(child);
    return projected ? [projected] : [];
  }));
}

export function buildMobileMenu(rows: MobileNavigationRow[]) {
  const tree = buildMobileNavigationTree(rows);
  const explicitRoots = tree.flatMap((node) => {
    const placement = routePlacement(node);
    if (placement === 'sidebar') {
      const projected = projectBranch(node);
      return projected ? [projected] : [];
    }
    if (placement === 'container') return projectChildren(node.children);
    return [];
  });

  if (explicitRoots.length) return sortMobileNavigationNodes(explicitRoots);

  return sortMobileNavigationNodes(tree.flatMap((node) => {
    const placement = routePlacement(node);
    if (placement === 'hidden' || placement === 'top-tool' || isMobileDisabled(node)) return [];
    const projected = projectBranch(node);
    return projected ? [projected] : [];
  }));
}

export function flattenMobileNavigation(nodes: MobileNavigationNode[]): MobileNavigationNode[] {
  return nodes.flatMap((node) => [node, ...flattenMobileNavigation(node.children)]);
}

export function filterMobileMenu(
  nodes: MobileNavigationNode[],
  keyword: string
): MobileNavigationNode[] {
  const normalized = keyword.trim().toLocaleLowerCase();
  if (!normalized) return nodes;

  return nodes.flatMap<MobileNavigationNode>((node) => {
    const children: MobileNavigationNode[] = filterMobileMenu(node.children, normalized);
    const matches = `${node.title} ${node.code}`.toLocaleLowerCase().includes(normalized);
    return matches || children.length ? [{ ...node, children }] : [];
  });
}

function splitTarget(target: string) {
  const hashIndex = target.indexOf('#');
  const hash = hashIndex >= 0 ? target.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  const queryIndex = withoutHash.indexOf('?');
  return {
    path: (queryIndex >= 0 ? withoutHash.slice(0, queryIndex) : withoutHash).replace(/\/+$/, ''),
    suffix: `${queryIndex >= 0 ? withoutHash.slice(queryIndex) : ''}${hash}`,
  };
}

export function resolveMobileRuntimePath(target: string, routes: MobileNavigationRow[]) {
  const normalizedTarget = target.trim();
  if (!normalizedTarget) return '';
  const { path, suffix } = splitTarget(normalizedTarget);
  if (path === '/login' || path === '/demo/table') return `${path}${suffix}`;
  if (path === '/' || path.startsWith('/page/')) return `${path || '/'}${suffix}`;

  const route = routes.find((item) => item.path.replace(/\/+$/, '') === path)
    ?? routes.find((item) => item.page_code === path.replace(/^\/+/, ''));
  if (route?.page_code) {
    return `/page/${encodeURIComponent(route.page_code)}${suffix}`;
  }

  if (!path.startsWith('/')) {
    return `/page/${encodeURIComponent(path)}${suffix}`;
  }

  return '';
}

export function parentMobilePageCode(
  pageCode: string,
  rows: MobileNavigationRow[],
) {
  const byId = new Map(rows.map((route) => [route.id, route]));
  let current = rows.find((route) => route.page_code === pageCode);
  const visited = new Set<string>();

  while (current?.parent_id && !visited.has(current.id)) {
    visited.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) return '';
    if (parent.page_code) return parent.page_code;
    current = parent;
  }

  return '';
}
