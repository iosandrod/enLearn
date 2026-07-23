<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <NuxtLink class="admin-brand" to="/dashboard">
        <span class="admin-brand-mark">H</span>
        <span>英语培训引流管理系统</span>
      </NuxtLink>

      <div class="admin-top-actions">
        <span class="admin-user">{{ auth.user.value?.email ?? 'Signed in' }}</span>
        <vxe-button size="mini" mode="text" status="primary" @click="reloadRoutes">
          刷新菜单
        </vxe-button>
        <vxe-button size="mini" mode="text" @click="auth.signOut">退出</vxe-button>
      </div>
    </header>

    <div class="admin-body">
      <aside class="admin-sidebar">
        <div class="admin-filter">菜单过滤</div>

        <nav class="admin-menu">
          <template v-for="group in menuTree" :key="group.code">
            <NuxtLink
              v-if="!group.children.length"
              class="admin-menu-group admin-menu-link"
              :to="group.path"
            >
              <span>{{ group.title }}</span>
            </NuxtLink>

            <section v-else class="admin-menu-section">
              <button
                class="admin-menu-group"
                type="button"
                @click="toggleGroup(group.code)"
              >
                <span>{{ group.title }}</span>
                <span>{{ expandedGroups[group.code] === false ? '+' : '-' }}</span>
              </button>

              <div
                v-show="expandedGroups[group.code] !== false"
                class="admin-submenu"
              >
                <NuxtLink
                  v-for="item in group.children"
                  :key="item.code"
                  class="admin-menu-link"
                  :to="item.path"
                >
                  {{ item.title }}
                </NuxtLink>
              </div>
            </section>
          </template>
        </nav>
      </aside>

      <main class="admin-main">
        <div class="admin-tabs">
          <NuxtLink
            v-for="tab in visitedTabs"
            :key="tab.path"
            class="admin-tab"
            :to="tab.path"
          >
            {{ tab.title }}
          </NuxtLink>
        </div>

        <div class="admin-toolbar">
          <div>
            <h1>{{ activeTitle }}</h1>
            <p>{{ route.path }}</p>
          </div>
          <span v-if="routeError" class="lc-error">{{ routeError }}</span>
        </div>

        <slot />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
type AdminRouteNode = {
  id?: string;
  code: string;
  title: string;
  path: string;
  visible?: boolean;
  status?: string;
  children?: AdminRouteNode[];
};

const auth = useAuth();
const serviceApi = useServiceApi();
const route = useRoute();
const routeError = ref('');
const routes = ref<AdminRouteNode[]>([]);
const expandedGroups = reactive<Record<string, boolean>>({});
const visitedTabs = ref<Array<{ title: string; path: string }>>([]);

const fallbackRoutes: AdminRouteNode[] = [
  {
    code: 'business-root',
    title: '运营管理',
    path: '/dashboard',
    children: [
      { code: 'dashboard-home', title: '工作台', path: '/dashboard' },
      { code: 'low-code', title: '低代码页面', path: '/dashboard/low-code' },
      { code: 'low-code-designer', title: '可视化设计器', path: '/dashboard/low-code/designer' }
    ]
  },
  {
    code: 'system-root',
    title: '系统设置',
    path: '/dashboard/system',
    children: [
      { code: 'system-users', title: '用户角色', path: '/dashboard/system/users' },
      { code: 'system-roles', title: '角色管理', path: '/dashboard/system/roles' },
      { code: 'system-permissions', title: '权限管理', path: '/dashboard/system/permissions' },
      { code: 'system-routes', title: '动态路由', path: '/dashboard/system/routes' },
      { code: 'system-entities', title: '实体管理', path: '/dashboard/system/entities' }
    ]
  }
];

function normalizeNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  return nodes
    .filter((node) => node.visible !== false && node.status !== 'inactive')
    .map((node) => ({
      ...node,
      code: node.code || node.path,
      title: node.title || node.code || node.path,
      children: normalizeNodes(node.children ?? [])
    }));
}

function flattenNodes(nodes: AdminRouteNode[]): AdminRouteNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

const menuTree = computed<AdminRouteNode[]>(() =>
  normalizeNodes(routes.value.length ? routes.value : fallbackRoutes)
);
const flatMenu = computed<AdminRouteNode[]>(() => flattenNodes(menuTree.value));
const activeTitle = computed<string>(
  () =>
    flatMenu.value.find((item: AdminRouteNode) => item.path === route.path)?.title ??
    'Dashboard'
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

onMounted(async () => {
  await auth.init();
  await reloadRoutes();
  rememberTab();
});

watch(
  () => route.path,
  () => rememberTab()
);
</script>
