export type AdminRouteNode = {
  id?: string;
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
  metadata_json?: string;
  children?: AdminRouteNode[];
};

export type NavigationPlacement = 'sidebar' | 'top-tool' | 'container' | 'hidden';

function readRouteMetadata(item: AdminRouteNode) {
  if (item.metadata && typeof item.metadata === 'object') return item.metadata;
  if (!item.metadata_json) return {};

  try {
    return JSON.parse(item.metadata_json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function readNavigationPlacement(item: AdminRouteNode): NavigationPlacement | '' {
  const navigation = readRouteMetadata(item).navigation;
  return navigation === 'sidebar' ||
    navigation === 'top-tool' ||
    navigation === 'container' ||
    navigation === 'hidden'
    ? navigation
    : '';
}

export function sortAdminRouteNodes(nodes: AdminRouteNode[]) {
  return [...nodes].sort((left, right) => {
    const leftSort = left.sort_order ?? 0;
    const rightSort = right.sort_order ?? 0;
    if (leftSort !== rightSort) return leftSort - rightSort;
    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
}

export function normalizeAdminRouteNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  const normalized = nodes
    .filter((node) => node.visible !== false && node.status !== 'inactive')
    .map((node) => ({
      ...node,
      children: sortAdminRouteNodes(normalizeAdminRouteNodes(node.children ?? []))
    }));

  return normalized.filter((node) => {
    if (node.children?.length) return true;
    return node.route_type !== 'group';
  });
}

export function buildAdminRouteTree(rows: AdminRouteNode[]) {
  const byId = new Map<string, AdminRouteNode & { children: AdminRouteNode[] }>();
  const roots: Array<AdminRouteNode & { children: AdminRouteNode[] }> = [];

  for (const row of rows) {
    const id = row.id;
    if (!id) continue;
    byId.set(id, {
      ...row,
      children: [],
    });
  }

  for (const node of byId.values()) {
    const parentId = node.parent_id ?? '';
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  return roots;
}

function projectNavigationBranch(
  node: AdminRouteNode,
  placement: Exclude<NavigationPlacement, 'container' | 'hidden'>
): AdminRouteNode {
  return {
    ...node,
    children: projectNavigationChildren(node.children ?? [], placement)
  };
}

function projectNavigationChildren(
  children: AdminRouteNode[],
  placement: Exclude<NavigationPlacement, 'container' | 'hidden'>
) {
  return sortAdminRouteNodes(children.flatMap((child) => {
    const childPlacement = readNavigationPlacement(child);
    if (childPlacement === 'hidden') return [];
    if (childPlacement === 'container') {
      return projectNavigationChildren(child.children ?? [], placement);
    }
    if (childPlacement && childPlacement !== placement) return [];
    return [projectNavigationBranch(child, placement)];
  }));
}

export function collectNavigationRoots(
  nodes: AdminRouteNode[],
  placement: Exclude<NavigationPlacement, 'container' | 'hidden'>
): AdminRouteNode[] {
  return nodes.flatMap((node) => {
    const nodePlacement = readNavigationPlacement(node);
    if (nodePlacement === placement) return [projectNavigationBranch(node, placement)];
    if (nodePlacement === 'hidden') return [];
    return collectNavigationRoots(node.children ?? [], placement);
  });
}

export function buildSidebarMenu(nodes: AdminRouteNode[]) {
  return sortAdminRouteNodes(collectNavigationRoots(nodes, 'sidebar'));
}

export function flattenAdminRouteNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  return nodes.flatMap((node) => [node, ...flattenAdminRouteNodes(node.children ?? [])]);
}

export function filterAdminRouteNodes(nodes: AdminRouteNode[], keyword: string): AdminRouteNode[] {
  if (!keyword) return nodes;

  return nodes
    .map<AdminRouteNode | null>((node) => {
      const children = filterAdminRouteNodes(node.children ?? [], keyword);
      const selfMatched = [node.title, node.code, node.path]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));

      if (!selfMatched && !children.length) return null;
      return { ...node, children };
    })
    .filter((node): node is AdminRouteNode => Boolean(node));
}
