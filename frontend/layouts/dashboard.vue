<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <RouterLink class="admin-brand" to="/dashboard">
        <span class="admin-brand-mark">M</span>
        <span>工厂制造管理平台</span>
      </RouterLink>

      <div
        v-for="toolGroup in topToolGroups"
        :key="toolGroup.code"
        class="admin-tool-launcher"
        @click.stop
      >
        <button
          class="admin-tool-launcher__trigger"
          type="button"
          :aria-expanded="openTopToolCode === toolGroup.code"
          aria-haspopup="menu"
          @click="toggleTopTool(toolGroup.code)"
        >
          <i v-if="toolGroup.icon" :class="toolGroup.icon" aria-hidden="true" />
          <span>{{ toolGroup.title }}</span>
          <i
            :class="openTopToolCode === toolGroup.code ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'"
            aria-hidden="true"
          />
        </button>

        <div
          v-if="openTopToolCode === toolGroup.code"
          class="admin-tool-panel"
          role="menu"
        >
          <RouterLink
            v-for="tool in toolGroup.tools"
            :key="tool.code"
            class="admin-tool-panel__item"
            :class="{ 'is-active': isTopToolActive(tool) }"
            :to="tool.path"
            role="menuitem"
            @click="openTopToolCode = ''"
          >
            <i v-if="tool.icon" :class="tool.icon" aria-hidden="true" />
            <span>{{ tool.title }}</span>
          </RouterLink>
        </div>
      </div>

      <div class="admin-top-actions">
        <ChatPopup />
        <NotificationBell />
        <label v-if="isDev" class="admin-user-switcher">
          <i class="ri-user-line" aria-hidden="true" />
          <select v-model="activeDevUserId" aria-label="快速切换用户">
            <option v-for="user in devTestUsers" :key="user.id" :value="user.id">
              {{ user.name }} · {{ user.title }}
            </option>
          </select>
        </label>
        <span v-else class="admin-user">{{ auth.user.value?.email ?? '已登录' }}</span>
        <vxe-button size="mini" mode="text" status="primary" @click="reloadRoutes">
          刷新菜单
        </vxe-button>
        <vxe-button size="mini" mode="text" @click="auth.signOut">退出</vxe-button>
      </div>
    </header>

    <div class="admin-body">
      <aside class="admin-sidebar">
        <div class="admin-filter">
          <input
            v-model="menuFilter"
            aria-label="菜单过滤"
            placeholder="菜单过滤"
            type="search"
          />
        </div>

        <nav class="admin-menu">
          <p v-if="!filteredMenuTree.length" class="admin-menu-empty">无匹配菜单</p>
          <template v-for="group in filteredMenuTree" :key="group.code">
            <section class="admin-menu-section">
              <MenuItem
                :item="group"
                :expanded-groups="expandedGroups"
                :filtering="Boolean(normalizedMenuFilter)"
                :level="0"
                @context="openMenuContext"
                @toggle="toggleGroup"
              />
            </section>
          </template>
        </nav>
      </aside>

      <main class="admin-main">
        <div class="admin-tabs">
          <RouterLink
            v-for="tab in visitedTabs"
            :key="tab.path"
            class="admin-tab"
            :to="tab.path"
          >
            {{ tab.title }}
          </RouterLink>
        </div>

        <p v-if="routeError" class="admin-route-error lc-error">{{ routeError }}</p>

        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { defineComponent, h, resolveComponent } from 'vue';
import type { PropType } from 'vue';
import {VxeUI} from 'vxe-pc-ui';
import { useServiceApi } from '../composables/useServiceApi';
import type {
  LowCodePageRecord,
  LowCodePageSchema,
} from '@enlearn/lowcode-framework/types/lowcode';
import { getLowCodePage } from '../utils/lowCodePages';

type AdminRouteNode = {
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

type MenuContextPayload = {
  event: MouseEvent;
  item: AdminRouteNode;
};

type TopToolGroup = AdminRouteNode & {
  tools: AdminRouteNode[];
};

type NavigationPlacement = 'sidebar' | 'top-tool' | 'container' | 'hidden';

const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
const isDev = import.meta.env.DEV;
const devTestUsers = computed(() => auth.devTestUsers.value);
const activeDevUserId = computed({
  get: () =>
    devTestUsers.value.find((user) => user.id === auth.user.value?.id)?.id ??
    devTestUsers.value[0]?.id ??
    '',
  set: (userId: string) => {
    auth.switchDevTestUser(userId);
  }
});
const routeError = ref('');
const routes = ref<AdminRouteNode[]>([]);
const expandedGroups = reactive<Record<string, boolean>>({});
const visitedTabs = ref<Array<{ title: string; path: string }>>([]);
const menuFilter = ref('');
const openTopToolCode = ref('');

function ensureDevTestUserSelected() {
  if (!isDev) return;
  if (devTestUsers.value.some((user) => user.id === auth.user.value?.id)) return;
  const defaultUserId = devTestUsers.value[0]?.id;
  if (defaultUserId) auth.switchDevTestUser(defaultUserId);
}

async function loadDevTestUsers() {
  if (!isDev) return;

  try {
    const users = await serviceApi.listItems<Record<string, unknown>[]>('admin', {
      tableName: 'users',
      limit: 1000,
    });
    auth.setDevTestUsers(Array.isArray(users) ? users : []);
  } catch (error) {
    auth.setDevTestUsers([]);
    console.warn('Dev user switcher could not load admin users.', error);
  }

  ensureDevTestUserSelected();
}

function getLowCodeDesignerLoadPageBus() {
  const scope = globalThis as any;
  scope.__enlearnLowCodeDesignerLoadPageBus ??= { subscribers: [] };
  return scope.__enlearnLowCodeDesignerLoadPageBus;
}

function publishLowCodeDesignerLoadPage(code: string) {
  const bus = getLowCodeDesignerLoadPageBus();
  bus.pendingCode = code;
  for (const subscriber of bus.subscribers ?? []) {
    subscriber(code);
  }
}

const MenuItem = defineComponent({
  name: 'DashboardMenuItem',
  props: {
    item: {
      type: Object as PropType<AdminRouteNode>,
      required: true
    },
    expandedGroups: {
      type: Object as PropType<Record<string, boolean>>,
      required: true
    },
    filtering: {
      type: Boolean,
      default: false
    },
    level: {
      type: Number,
      default: 0
    }
  },
  emits: {
    context: (_payload: MenuContextPayload) => true,
    toggle: (_code: string) => true
  },
  setup(props, { emit }) {
    const hasChildren = computed(() => Boolean(props.item.children?.length));
    const isExpanded = computed(
      () => props.filtering || props.expandedGroups[props.item.code] !== false
    );

    return () => {
      if (!hasChildren.value) {
        return h(
          resolveComponent('RouterLink'),
          {
            class: ['admin-menu-link', `level-${props.level}`],
            to: props.item.path,
            onContextmenu: (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              emit('context', { event, item: props.item });
            }
          },
          () => props.item.title
        );
      }

      return h('div', { class: 'admin-menu-node' }, [
        h(
          'button',
          {
            class: ['admin-menu-group', `level-${props.level}`],
            type: 'button',
            onClick: () => emit('toggle', props.item.code),
            onContextmenu: (event: MouseEvent) => {
              event.preventDefault();
              event.stopPropagation();
              emit('context', { event, item: props.item });
            }
          },
          [
            h('span', props.item.title),
            h('span', isExpanded.value ? '-' : '+')
          ]
        ),
        isExpanded.value
          ? h(
              'div',
              { class: 'admin-submenu' },
              props.item.children?.map((child) =>
                h(MenuItem, {
                  key: child.code,
                  item: child,
                  expandedGroups: props.expandedGroups,
                  filtering: props.filtering,
                  level: props.level + 1,
                  onContext: (payload: MenuContextPayload) => emit('context', payload),
                  onToggle: (code: string) => emit('toggle', code)
                })
              )
            )
          : null
      ]);
    };
  }
});

function normalizeNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  const normalized = nodes
    .filter((node) => node.visible !== false && node.status !== 'inactive' && canViewRoute(node))
    .map((node) => ({
      ...node,
      children: sortRouteNodes(normalizeNodes(node.children ?? []))
    }));

  return normalized.filter((node) => {
    if (node.children?.length) return true;
    return node.route_type !== 'group';
  });
}

function sortRouteNodes(nodes: AdminRouteNode[]) {
  return [...nodes].sort((left, right) => {
    const leftSort = left.sort_order ?? 0;
    const rightSort = right.sort_order ?? 0;
    if (leftSort !== rightSort) return leftSort - rightSort;
    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
}

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
  return sortRouteNodes(children.flatMap((child) => {
    const childPlacement = readNavigationPlacement(child);
    if (childPlacement === 'hidden') return [];
    if (childPlacement === 'container') {
      return projectNavigationChildren(child.children ?? [], placement);
    }
    if (childPlacement && childPlacement !== placement) return [];
    return [projectNavigationBranch(child, placement)];
  }));
}

function collectNavigationRoots(
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

function buildSidebarMenu(nodes: AdminRouteNode[]) {
  return sortRouteNodes(collectNavigationRoots(nodes, 'sidebar'));
}

function canViewRoute(node: AdminRouteNode) {
  if (!node.permission_code) return true;
  return auth.permissions.value.includes(node.permission_code);
}

function flattenNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

function buildRouteTree(rows: AdminRouteNode[]) {
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

const normalizedRoutes = computed<AdminRouteNode[]>(() => normalizeNodes(routes.value));
const topToolGroups = computed<TopToolGroup[]>(() =>
  sortRouteNodes(collectNavigationRoots(normalizedRoutes.value, 'top-tool')).map((group) => ({
    ...group,
    tools: sortRouteNodes(group.children ?? [])
  }))
);
const menuTree = computed<AdminRouteNode[]>(() => buildSidebarMenu(normalizedRoutes.value));
const normalizedMenuFilter = computed(() => menuFilter.value.trim().toLowerCase());
const filteredMenuTree = computed(() => filterMenuNodes(menuTree.value, normalizedMenuFilter.value));
const flatMenu = computed<AdminRouteNode[]>(() => flattenNodes(menuTree.value));
const activeTitle = computed<string>(
  () =>
    [...flatMenu.value, ...topToolGroups.value.flatMap((group) => group.tools)].find(
      (item: AdminRouteNode) =>
        item.path === route.path || route.path.startsWith(`${item.path}/`)
    )?.title ??
    '工作台'
);
async function reloadRoutes() {
  routeError.value = '';

  try {
    const data = await serviceApi.listItems<AdminRouteNode[]>('admin', {
      tableName: 'admin_routes',
      clientMode: 'admin',
      sorts: [
        { field: 'sort_order', direction: 'asc' },
        { field: 'created_at', direction: 'asc' },
      ],
      limit: 1000,
    });
    routes.value = Array.isArray(data) ? buildRouteTree(data) : [];
  } catch (error) {
    routes.value = [];
    routeError.value =
      error instanceof Error ? error.message : '数据库菜单加载失败。';
  }
}

function toggleGroup(code: string) {
  expandedGroups[code] = expandedGroups[code] === false;
}

function filterMenuNodes(nodes: AdminRouteNode[], keyword: string): AdminRouteNode[] {
  if (!keyword) return nodes;

  return nodes
    .map<AdminRouteNode | null>((node) => {
      const children = filterMenuNodes(node.children ?? [], keyword);
      const selfMatched = [node.title, node.code, node.path]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword));

      if (!selfMatched && !children.length) return null;
      return { ...node, children };
    })
    .filter((node): node is AdminRouteNode => Boolean(node));
}

function openMenuContext(payload: MenuContextPayload) {
  const { event, item } = payload;
  event.preventDefault();
  event.stopPropagation();
  const pageCode = resolveLowCodePageCode(item);

  VxeUI.contextMenu.open({
    x: event.clientX,
    y: event.clientY,
    className: 'enlearn-context-menu',
    options: [
      [
        {
          code: 'rename',
          name: '修改菜单名称'
        },
        {
          code: 'open-designer',
          name: '进入低代码设计',
          visible: Boolean(pageCode)
        },
        {
          code: 'open-edit-page',
          name: '进入编辑页面',
          visible: Boolean(pageCode)
        }
      ]
    ],
    events: {
      optionClick({ option }) {
        if (option.code === 'rename') void renameMenuItem(item);
        if (option.code === 'open-designer') void openLowCodeDesigner(item);
        if (option.code === 'open-edit-page') void openLowCodeEditPage(item);
      }
    }
  });
}

function closeMenuContext() {
  VxeUI.contextMenu.close();
}

function isTopToolActive(item: AdminRouteNode) {
  return route.path === item.path || route.path.startsWith(`${item.path}/`);
}

function toggleTopTool(code: string) {
  openTopToolCode.value = openTopToolCode.value === code ? '' : code;
}

function buildRouteSavePayload(item: AdminRouteNode, title: string) {
  return {
    id: item.id,
    code: item.code,
    title,
    path: item.path,
    parent_id: item.parent_id ?? null,
    route_type: item.route_type ?? (item.children?.length ? 'group' : 'page'),
    icon: item.icon ?? null,
    page_code: item.page_code ?? null,
    permission_code: item.permission_code ?? null,
    visible: item.visible !== false,
    keep_alive: item.keep_alive !== false,
    layout: item.layout ?? 'dashboard',
    status: item.status ?? 'active',
    sort_order: item.sort_order ?? 0,
    metadata_json: item.metadata_json ?? JSON.stringify(item.metadata ?? {})
  };
}

async function renameMenuItem(item: AdminRouteNode) {
  if (!item.id) {
    routeError.value = '当前菜单没有数据库 ID，不能直接修改名称。';
    return;
  }

  const nextTitle = window.prompt('菜单名称', item.title)?.trim();
  if (!nextTitle || nextTitle === item.title) return;

  routeError.value = '';

  try {
    await serviceApi.invoke('admin', 'saveItem', {
      resource: 'routes',
      ...buildRouteSavePayload(item, nextTitle)
    });
    await reloadRoutes();
  } catch (error) {
    routeError.value =
      error instanceof Error ? error.message : '菜单名称保存失败。';
  }
}

function resolveLowCodePageCode(item: AdminRouteNode) {
  return item.page_code ?? '';
}

function buildEmptyEditPageSchema(
  page: LowCodePageRecord,
  item: AdminRouteNode | null
): LowCodePageSchema {
  const routePath = page.route.replace(/\/+$/, '');
  const editCode = `${page.code}-edit`;
  const editRoute = `${routePath}/edit`;
  const editTitle = `${page.title || item?.title || page.code}编辑`;

  return {
    schemaVersion: 1,
    code: editCode,
    route: editRoute,
    title: editTitle,
    pageType: 'edit',
    description: '',
    layout: 'dashboard',
    status: 'published',
    keepAlive: true,
    blocks: [],
    dataSources: {}
  };
}

function isMissingLowCodePageError(error: unknown) {
  return error instanceof Error && error.message.includes('Low-code page not found');
}

async function resolveExistingEditPage(page: LowCodePageRecord) {
  if (page.edit_page_id) {
    return getLowCodePage(serviceApi, {
      id: page.edit_page_id,
      includeData: false
    });
  }

  try {
    return await getLowCodePage(serviceApi, {
      code: `${page.code}-edit`,
      includeData: false
    });
  } catch (error) {
    if (isMissingLowCodePageError(error)) return null;
    throw error;
  }
}

function buildPageSaveData(schema: LowCodePageSchema) {
  return {
    code: schema.code,
    route: schema.route,
    title: schema.title,
    description: schema.description ?? null,
    layout: schema.layout ?? 'dashboard',
    status: schema.status ?? 'draft',
    keep_alive: schema.keepAlive ?? true,
    schema,
    version: 1,
    published_at: schema.status === 'published' ? new Date().toISOString() : null,
    edit_page_id: null
  };
}

async function openLowCodeDesigner(item: AdminRouteNode) {
  const pageCode = resolveLowCodePageCode(item);
  if (!pageCode) return;
  await router.push({ path: `/dashboard/low-code/designer/${pageCode}` });
  publishLowCodeDesignerLoadPage(pageCode);
}

async function openLowCodeEditPage(item: AdminRouteNode) {
  const pageCode = resolveLowCodePageCode(item);
  if (!pageCode) return;

  routeError.value = '';

  try {
    const page = await getLowCodePage(serviceApi, {
      code: pageCode,
      includeData: false
    });
    let editPage = await resolveExistingEditPage(page);

    if (!editPage) {
      const schema = buildEmptyEditPageSchema(page, item);
      editPage = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'saveItem', {
        resource: 'pages',
        data: buildPageSaveData(schema)
      });
    }

    if (page.edit_page_id !== editPage.id) {
      await serviceApi.invoke<LowCodePageRecord>('lowcode', 'saveItem', {
        resource: 'pages',
        id: page.id,
        data: { edit_page_id: editPage.id }
      });
    }

    await router.push(editPage.route);
    await reloadRoutes();
  } catch (error) {
    routeError.value =
      error instanceof Error ? error.message : '编辑页面打开失败。';
  }
}

function rememberTab() {
  const current = {
    title: activeTitle.value,
    path: route.path
  };
  const existing = visitedTabs.value.filter(
    (tab: { title: string; path: string }) => tab.path !== current.path
  );
  visitedTabs.value = [...existing, current].slice(-8);
}

function handleAdminRoutesUpdated() {
  reloadRoutes();
}

function handleMenuContextKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenuContext();
    openTopToolCode.value = '';
  }
}

function closeFloatingPanels() {
  closeMenuContext();
  openTopToolCode.value = '';
}

onMounted(async () => {
  await auth.init();
  await loadDevTestUsers();
  ensureDevTestUserSelected();
  await reloadRoutes();
  rememberTab();
  window.addEventListener('enlearn:admin-routes-updated', handleAdminRoutesUpdated);
  window.addEventListener('click', closeFloatingPanels);
  window.addEventListener('keydown', handleMenuContextKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('enlearn:admin-routes-updated', handleAdminRoutesUpdated);
  window.removeEventListener('click', closeFloatingPanels);
  window.removeEventListener('keydown', handleMenuContextKeydown);
});

watch(
  () => route.path,
  () => {
    closeMenuContext();
    openTopToolCode.value = '';
    rememberTab();
  }
);
</script>
