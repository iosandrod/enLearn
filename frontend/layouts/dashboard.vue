<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <RouterLink class="admin-brand" to="/dashboard">
        <span class="admin-brand-mark">M</span>
        <span>工厂制造管理平台</span>
      </RouterLink>

      <div class="admin-top-actions">
        <ChatPopup />
        <NotificationBell />
        <span class="admin-user">{{ auth.user.value?.email ?? '已登录' }}</span>
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

        <div
          v-if="menuContext.visible"
          class="admin-menu-context"
          :style="{ left: `${menuContext.x}px`, top: `${menuContext.y}px` }"
          @click.stop
          @contextmenu.prevent.stop
        >
          <button type="button" @click="renameMenuItem">修改菜单名称</button>
          <button
            v-if="contextLowCodePageCode"
            type="button"
            @click="openLowCodeDesigner"
          >
            进入低代码设计
          </button>
          <button
            v-if="contextLowCodePageCode"
            type="button"
            @click="openLowCodePage"
          >
            进入编辑页面
          </button>
        </div>
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
import { useServiceApi } from '../composables/useServiceApi';

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

const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const router = useRouter();
const routeError = ref('');
const routes = ref<AdminRouteNode[]>([]);
const expandedGroups = reactive<Record<string, boolean>>({});
const visitedTabs = ref<Array<{ title: string; path: string }>>([]);
const menuFilter = ref('');
const menuContext = reactive<{
  visible: boolean;
  x: number;
  y: number;
  item: AdminRouteNode | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  item: null
});

const fallbackRoutes: AdminRouteNode[] = [
  {
    code: 'business-root',
    title: '生产运营',
    path: '/dashboard',
    children: [
      { code: 'dashboard-home', title: '工作台', path: '/dashboard' },
      { code: 'lowcode-pages', title: '低代码页面管理', path: '/dashboard/low-code', permission_code: 'lowcode.pages.manage' },
      { code: 'file-management', title: '文件管理', path: '/dashboard/files' },
      { code: 'entity-design', title: '实体设计器', path: '/dashboard/entity-design', permission_code: 'entity.design.manage' },
      { code: 'lowcode-visual-designer', title: '可视化设计器', path: '/dashboard/low-code/designer', permission_code: 'lowcode.pages.manage' },
      { code: 'workflow-designer', title: '审批流设计器', path: '/dashboard/workflow/designer', permission_code: 'workflow.definitions.manage' },
      { code: 'trigger-workflow-designer', title: '触发器编排器', path: '/dashboard/trigger-workflow/designer', permission_code: 'workflow.definitions.manage' },
      { code: 'advanced-print-designer', title: '打印设计器', path: '/dashboard/advanced/print-designer', permission_code: 'print.templates.manage' },
      { code: 'print-designer', title: '打印模板', path: '/dashboard/print-designer', permission_code: 'print.templates.manage' },
      { code: 'print-logs', title: '打印日志', path: '/dashboard/print/logs', permission_code: 'print.logs.view' }
    ]
  },
  {
    code: 'system-root',
    title: '系统设置',
    path: '/dashboard/system',
    children: [
      { code: 'system-users', title: '用户权限档案', path: '/dashboard/system/users', permission_code: 'admin.users.manage' },
      { code: 'system-roles', title: '角色管理', path: '/dashboard/system/roles', permission_code: 'admin.roles.manage' },
      { code: 'system-permissions', title: '权限管理', path: '/dashboard/system/permissions', permission_code: 'admin.permissions.manage' },
      { code: 'system-routes', title: '动态路由', path: '/dashboard/system/routes', permission_code: 'admin.routes.manage' },
      { code: 'system-entities', title: '实体管理', path: '/dashboard/system/entities', permission_code: 'admin.entities.manage' },
      { code: 'system-file-entities', title: '文件存储实体', path: '/dashboard/system/file-entities', permission_code: 'admin.entities.manage' },
      { code: 'system-execution-tasks', title: '系统执行任务', path: '/dashboard/system/execution-tasks', permission_code: 'workflow.runtime.manage' }
    ]
  }
];

const menuTitleOverrides: Record<string, string> = {
  'low-code': '低代码页面管理',
  'lowcode-pages': '低代码页面管理',
  'entity-design': '实体设计器',
  'advanced-print-designer': '打印设计器',
  'print-designer': '打印模板',
  'print-logs': '打印日志',
  'trigger-workflow-designer': '触发器编排器',
  'workflow-jobs': '作业定义',
  'workflow-job-runs': '作业运行记录',
  'workflow-timer-jobs': '定时器任务'
};

const productionRouteCodes = new Set(['dashboard-home']);
const advancedRouteCodes = new Set([
  'file-management',
  'entity-design',
  'low-code-designer',
  'lowcode-visual-designer',
  'advanced-print-designer',
  'workflow-designer',
  'trigger-workflow-designer'
]);
const hiddenRouteCodes = new Set(['business-root', 'system-root']);
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

const lowCodeMenuGroups = [
  {
    code: 'lowcode-config-root',
    title: '页面配置',
    routeCodes: ['lowcode-pages']
  },
  {
    code: 'lowcode-user-root',
    title: '用户权限',
    routeCodes: ['system-users', 'system-roles', 'system-permissions']
  },
  {
    code: 'lowcode-notification-root',
    title: '消息通知',
    routeCodes: ['notification-message-center', 'notification-deliveries']
  },
  {
    code: 'lowcode-file-root',
    title: '文件资料',
    routeCodes: ['system-file-entities']
  },
  {
    code: 'lowcode-print-root',
    title: '打印管理',
    routeCodes: ['print-designer', 'print-logs']
  },
  {
    code: 'lowcode-job-root',
    title: '作业调度',
    routeCodes: [
      'workflow-jobs',
      'workflow-job-runs',
      'workflow-timer-jobs',
      'system-execution-tasks'
    ]
  },
  {
    code: 'lowcode-metadata-root',
    title: '系统元数据',
    routeCodes: ['system-routes', 'system-entities', 'system-options']
  }
];

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
      code: node.code || node.path,
      title: menuTitleOverrides[node.code] ?? node.title ?? node.code ?? node.path,
      children: normalizeNodes(node.children ?? [])
    }));

  return normalized.filter((node) => {
    if (node.children?.length) return true;
    return node.route_type !== 'group' && !node.path.endsWith('/_group');
  });
}

function flattenMenuPages(nodes: AdminRouteNode[]): AdminRouteNode[] {
  return nodes.flatMap((node) => {
    const children = flattenMenuPages(node.children ?? []);
    const isGroup =
      node.route_type === 'group' ||
      node.path.endsWith('/_group') ||
      hiddenRouteCodes.has(node.code);

    return isGroup ? children : [{ ...node, children: [] }, ...children];
  });
}

function sortMenuPages(pages: AdminRouteNode[]) {
  return [...pages].sort((left, right) => {
    const leftSort = left.sort_order ?? 0;
    const rightSort = right.sort_order ?? 0;
    if (leftSort !== rightSort) return leftSort - rightSort;
    return left.title.localeCompare(right.title, 'zh-Hans-CN');
  });
}

function buildMenuGroup(
  code: string,
  title: string,
  children: AdminRouteNode[],
  sortOrder = 0
) {
  return {
    code,
    title,
    path: `/dashboard/${code}/_group`,
    route_type: 'group' as const,
    sort_order: sortOrder,
    children: sortMenuPages(children)
  };
}

function buildLowCodeMenuGroups(pages: AdminRouteNode[]) {
  const byCode = new Map(pages.map((page) => [page.code, page]));
  const groupedCodes = new Set<string>();
  const groups = lowCodeMenuGroups
    .map((group, index) => {
      const children = group.routeCodes
        .map((code) => byCode.get(code))
        .filter((item): item is AdminRouteNode => Boolean(item));

      children.forEach((child) => groupedCodes.add(child.code));

      return buildMenuGroup(group.code, group.title, children, (index + 1) * 10);
    })
    .filter((group) => group.children.length);

  const uncategorizedPages = pages.filter((page) => !groupedCodes.has(page.code));
  if (uncategorizedPages.length) {
    groups.push(buildMenuGroup('lowcode-other-root', '其他应用', uncategorizedPages));
  }

  return groups;
}

function regroupMenuTree(nodes: AdminRouteNode[]) {
  const pages = flattenMenuPages(nodes);
  const productionPages = pages.filter((item) => productionRouteCodes.has(item.code));
  const advancedPages = pages.filter((item) => advancedRouteCodes.has(item.code));
  const lowCodePages = pages.filter(
    (item) =>
      !productionRouteCodes.has(item.code) &&
      !advancedRouteCodes.has(item.code)
  );

  return [
    buildMenuGroup('production-root', '生产运营', productionPages),
    buildMenuGroup('lowcode-app-root', '低代码应用', buildLowCodeMenuGroups(lowCodePages)),
    buildMenuGroup('advanced-root', '高级功能', advancedPages)
  ].filter((group) => group.children.length);
}

function canViewRoute(node: AdminRouteNode) {
  if (!node.permission_code) return true;
  return auth.permissions.value.includes(node.permission_code);
}

function flattenNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

const menuTree = computed<AdminRouteNode[]>(() =>
  regroupMenuTree(normalizeNodes(routes.value.length ? routes.value : fallbackRoutes))
);
const normalizedMenuFilter = computed(() => menuFilter.value.trim().toLowerCase());
const filteredMenuTree = computed(() => filterMenuNodes(menuTree.value, normalizedMenuFilter.value));
const flatMenu = computed<AdminRouteNode[]>(() => flattenNodes(menuTree.value));
const activeTitle = computed<string>(
  () =>
    flatMenu.value.find((item: AdminRouteNode) => item.path === route.path)?.title ??
    '工作台'
);
const contextLowCodePageCode = computed(() =>
  menuContext.item ? resolveLowCodePageCode(menuContext.item) : ''
);

async function reloadRoutes() {
  routeError.value = '';

  try {
    const data = await serviceApi.invoke<AdminRouteNode[]>('admin', 'listRouteTree');
    routes.value = Array.isArray(data) ? data : [];
  } catch (error) {
    routes.value = [];
    routeError.value =
      error instanceof Error ? error.message : '动态菜单加载失败，已使用本地兜底菜单。';
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
  menuContext.visible = true;
  menuContext.x = event.clientX;
  menuContext.y = event.clientY;
  menuContext.item = item;
}

function closeMenuContext() {
  menuContext.visible = false;
  menuContext.item = null;
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

async function renameMenuItem() {
  const item = menuContext.item;
  closeMenuContext();
  if (!item) return;

  if (!item.id) {
    routeError.value = '当前菜单没有数据库 ID，不能直接修改名称。';
    return;
  }

  const nextTitle = window.prompt('菜单名称', item.title)?.trim();
  if (!nextTitle || nextTitle === item.title) return;

  routeError.value = '';

  try {
    await serviceApi.invoke('admin', 'saveRoute', buildRouteSavePayload(item, nextTitle));
    await reloadRoutes();
  } catch (error) {
    routeError.value =
      error instanceof Error ? error.message : '菜单名称保存失败。';
  }
}

function resolveLowCodePageCode(item: AdminRouteNode) {
  if (item.page_code) return item.page_code;
  if (item.path.startsWith('/dashboard/low-code/') && !item.path.includes('/designer')) {
    return item.path.split('/').filter(Boolean).at(-1) ?? '';
  }
  return '';
}

async function openLowCodeDesigner() {
  const pageCode = contextLowCodePageCode.value;
  closeMenuContext();
  if (!pageCode) return;
  await router.push({ path: `/dashboard/low-code/designer/${pageCode}` });
  publishLowCodeDesignerLoadPage(pageCode);
}

async function openLowCodePage() {
  const pageCode = contextLowCodePageCode.value;
  closeMenuContext();
  if (!pageCode) return;
  await router.push(`/dashboard/low-code/${pageCode}`);
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
  }
}

onMounted(async () => {
  await auth.init();
  await reloadRoutes();
  rememberTab();
  window.addEventListener('enlearn:admin-routes-updated', handleAdminRoutesUpdated);
  window.addEventListener('click', closeMenuContext);
  window.addEventListener('keydown', handleMenuContextKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('enlearn:admin-routes-updated', handleAdminRoutesUpdated);
  window.removeEventListener('click', closeMenuContext);
  window.removeEventListener('keydown', handleMenuContextKeydown);
});

watch(
  () => route.path,
  () => {
    closeMenuContext();
    rememberTab();
  }
);
</script>
