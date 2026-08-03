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
        <div v-if="showApprovalTestSwitcher" class="admin-user-switcher" @click.stop>
          <button
            class="admin-user-switcher__trigger"
            type="button"
            :aria-expanded="testUserMenuOpen"
            aria-controls="approval-test-user-menu"
            aria-haspopup="dialog"
            title="切换审批测试身份"
            @click="toggleTestUserMenu"
          >
            <i class="ri-user-settings-line" aria-hidden="true" />
            <span class="admin-user-switcher__mode">测试</span>
            <span class="admin-user-switcher__label">
              {{ activeDevTestUser?.name ?? '选择测试用户' }}
              <small>{{ activeDevTestUser?.title ?? '审批测试身份' }}</small>
            </span>
            <i :class="testUserMenuOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" aria-hidden="true" />
          </button>

          <section
            v-if="testUserMenuOpen"
            id="approval-test-user-menu"
            class="admin-user-switcher__panel"
            role="dialog"
            aria-label="切换审批测试身份"
          >
            <header>
              <div>
                <strong>切换测试身份</strong>
                <span>仅影响审批测试，不改变登录权限</span>
              </div>
              <button
                type="button"
                title="刷新用户"
                aria-label="刷新用户"
                :disabled="devUsersLoading"
                @click="loadDevTestUsers"
              >
                <i :class="devUsersLoading ? 'ri-loader-4-line admin-spin' : 'ri-refresh-line'" aria-hidden="true" />
              </button>
            </header>

            <label class="admin-user-switcher__search">
              <i class="ri-search-line" aria-hidden="true" />
              <input
                ref="testUserSearchInput"
                v-model="testUserSearch"
                type="search"
                placeholder="搜索姓名、角色或邮箱"
              />
            </label>

            <p v-if="devUsersError" class="admin-user-switcher__notice" role="status">
              <i class="ri-error-warning-line" aria-hidden="true" />
              {{ devUsersError }}
            </p>

            <div class="admin-user-switcher__list" role="listbox" aria-label="审批测试用户">
              <button
                v-for="user in filteredDevTestUsers"
                :key="user.id"
                type="button"
                role="option"
                :aria-selected="user.id === activeDevUserId"
                :class="{ 'is-active': user.id === activeDevUserId }"
                @click="selectDevTestUser(user.id)"
              >
                <span class="admin-user-switcher__avatar">{{ user.name.slice(0, 1).toUpperCase() }}</span>
                <span class="admin-user-switcher__meta">
                  <strong>{{ user.name }}</strong>
                  <small>{{ user.title }}<template v-if="user.email"> · {{ user.email }}</template></small>
                </span>
                <i v-if="user.id === activeDevUserId" class="ri-check-line" aria-hidden="true" />
              </button>

              <p v-if="!filteredDevTestUsers.length" class="admin-user-switcher__empty">
                {{ devUsersLoading ? '正在加载测试用户...' : '没有匹配的测试用户' }}
              </p>
            </div>
          </section>
        </div>
        <span v-else class="admin-user">{{ displayUserLabel }}</span>
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
const activeDevTestUser = computed(() => auth.activeDevTestUser.value);
const activeDevUserId = computed({
  get: () => auth.activeDevTestUserId.value,
  set: (userId: string) => {
    auth.switchDevTestUser(userId);
  }
});
const showApprovalTestSwitcher = computed(
  () => isDev && route.path.startsWith('/dashboard/workflow')
);
const displayUserLabel = computed(() => {
  const profile = auth.profile.value ?? {};
  const name = readDisplayString(profile.full_name ?? profile.nickname ?? profile.name)
    || auth.user.value?.email
    || '已登录';
  const rawRole = readDisplayString(profile.role);
  const role = rawRole === 'admin' ? '管理员' : rawRole || '审批用户';
  return `${name} · ${role}`;
});
const testUserMenuOpen = ref(false);
const testUserSearch = ref('');
const testUserSearchInput = ref<HTMLInputElement | null>(null);
const devUsersLoading = ref(false);
const devUsersError = ref('');
const filteredDevTestUsers = computed(() => {
  const keyword = testUserSearch.value.trim().toLowerCase();
  if (!keyword) return devTestUsers.value;
  return devTestUsers.value.filter((user) =>
    [user.name, user.title, user.role, user.email]
      .some((value) => value.toLowerCase().includes(keyword))
  );
});
const routeError = ref('');
const routes = ref<AdminRouteNode[]>([]);
const expandedGroups = reactive<Record<string, boolean>>({});
const visitedTabs = ref<Array<{ title: string; path: string }>>([]);
const menuFilter = ref('');
const openTopToolCode = ref('');

function ensureDevTestUserSelected() {
  if (!isDev) return;
  if (devTestUsers.value.some((user) => user.id === activeDevUserId.value)) return;
  const defaultUserId =
    devTestUsers.value.find((user) => user.id === auth.user.value?.id)?.id ??
    devTestUsers.value[0]?.id;
  if (defaultUserId) auth.switchDevTestUser(defaultUserId);
}

async function loadDevTestUsers() {
  if (!isDev) return;
  devUsersLoading.value = true;
  devUsersError.value = '';

  try {
    const users = await serviceApi.invoke<Record<string, unknown>[]>(
      'admin',
      'listApprovalTestUsers'
    );
    auth.setDevTestUsers(Array.isArray(users) ? users : []);
  } catch (error) {
    devUsersError.value = error instanceof Error ? error.message : '测试用户加载失败';
    console.warn('Dev user switcher could not load admin users.', error);
  } finally {
    devUsersLoading.value = false;
  }

  ensureDevTestUserSelected();
}

function readDisplayString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function toggleTestUserMenu() {
  testUserMenuOpen.value = !testUserMenuOpen.value;
  if (testUserMenuOpen.value && !devTestUsers.value.length && !devUsersLoading.value) {
    void loadDevTestUsers();
  }
  if (testUserMenuOpen.value) {
    void nextTick(() => testUserSearchInput.value?.focus());
  }
}

function selectDevTestUser(userId: string) {
  activeDevUserId.value = userId;
  testUserMenuOpen.value = false;
  testUserSearch.value = '';
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
  const existingIndex = visitedTabs.value.findIndex(
    (tab: { title: string; path: string }) => tab.path === current.path
  );

  if (existingIndex >= 0) {
    if (visitedTabs.value[existingIndex]?.title !== current.title) {
      visitedTabs.value = visitedTabs.value.map((tab, index) =>
        index === existingIndex ? current : tab
      );
    }
    return;
  }

  visitedTabs.value = [...visitedTabs.value, current].slice(-8);
}

function handleAdminRoutesUpdated() {
  reloadRoutes();
}

function handleMenuContextKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenuContext();
    openTopToolCode.value = '';
    testUserMenuOpen.value = false;
  }
}

function closeFloatingPanels() {
  closeMenuContext();
  openTopToolCode.value = '';
  testUserMenuOpen.value = false;
}

onMounted(async () => {
  await auth.init();
  if (showApprovalTestSwitcher.value) {
    await loadDevTestUsers();
    ensureDevTestUserSelected();
  }
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
    if (showApprovalTestSwitcher.value && !devTestUsers.value.length && !devUsersLoading.value) {
      void loadDevTestUsers();
    }
  }
);
</script>
