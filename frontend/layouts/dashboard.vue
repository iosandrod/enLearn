<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <RouterLink class="admin-brand" to="/dashboard">
        <span class="admin-brand-mark">M</span>
        <span>工厂制造管理平台</span>
      </RouterLink>

      <div class="admin-account-switcher" @click.stop>
        <button
          class="admin-account-switcher__trigger"
          type="button"
          :aria-expanded="accountMenuOpen"
          aria-haspopup="dialog"
          title="切换账套"
          @click="toggleAccountMenu"
        >
          <i class="ri-building-2-line" aria-hidden="true" />
          <span
            class="admin-account-switcher__code"
            :title="auth.activeAccount.value?.code ?? '---'"
          >
            {{ auth.activeAccount.value?.code ?? '---' }}
          </span>
          <span class="admin-account-switcher__name">
            {{ auth.activeAccount.value?.name ?? '未选择账套' }}
          </span>
          <i :class="accountMenuOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" aria-hidden="true" />
        </button>

        <section
          v-if="accountMenuOpen"
          class="admin-account-switcher__panel"
          role="dialog"
          aria-label="切换账套"
        >
          <header>
            <div>
              <strong>切换账套</strong>
              <span>切换后将重新加载当前账套的数据与权限</span>
            </div>
            <i v-if="accountSwitching" class="ri-loader-4-line admin-spin" aria-hidden="true" />
          </header>

          <label class="admin-account-switcher__search">
            <i class="ri-search-line" aria-hidden="true" />
            <input
              ref="accountSearchInput"
              v-model="accountSearch"
              type="search"
              placeholder="搜索账套编码或名称"
            />
          </label>

          <p v-if="accountSwitchError" class="admin-account-switcher__error" role="alert">
            {{ accountSwitchError }}
          </p>

          <div class="admin-account-switcher__list" role="listbox" aria-label="可用账套">
            <button
              v-for="account in filteredAccounts"
              :key="account.account_id"
              type="button"
              role="option"
              :aria-selected="account.account_id === auth.activeAccount.value?.account_id"
              :disabled="accountSwitching || !isAccountEnabled(account)"
              :class="{ 'is-active': account.account_id === auth.activeAccount.value?.account_id }"
              @click="switchAccount(account.account_id)"
            >
              <span
                class="admin-account-switcher__item-code"
                :title="account.code ?? '---'"
              >
                {{ account.code ?? '---' }}
              </span>
              <span class="admin-account-switcher__item-meta">
                <strong :title="account.name ?? '未命名账套'">
                  {{ account.name ?? '未命名账套' }}
                </strong>
                <small>{{ account.account_role === 'owner' ? '账套主管' : '账套成员' }}</small>
              </span>
              <span class="admin-account-switcher__item-state">
                <span v-if="!isAccountEnabled(account)" class="admin-account-switcher__status">
                  {{ account.status === 'archived' ? '已归档' : '已停用' }}
                </span>
                <i
                  v-else-if="account.account_id === auth.activeAccount.value?.account_id"
                  class="ri-check-line"
                  aria-hidden="true"
                />
              </span>
            </button>

            <p v-if="!filteredAccounts.length" class="admin-account-switcher__empty">
              没有匹配的账套
            </p>
          </div>
        </section>
      </div>

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
        <RouterLink
          v-if="canOpenTaskConsole"
          class="admin-task-console-button"
          :class="{ 'is-active': route.path === TASK_CONSOLE_PATH }"
          :to="TASK_CONSOLE_PATH"
          title="进入后台任务总控制台"
        >
          <i class="ri-task-line" aria-hidden="true" />
          <span>任务总控</span>
        </RouterLink>
        <RouterLink
          v-if="canOpenApprovalConsole"
          class="admin-approval-console-button"
          :class="{ 'is-active': route.path === APPROVAL_CONSOLE_PATH }"
          :to="APPROVAL_CONSOLE_PATH"
          title="进入审批流总控制台"
        >
          <i class="ri-flow-chart" aria-hidden="true" />
          <span>审批总控</span>
        </RouterLink>
        <button
          class="admin-system-settings-button"
          type="button"
          :disabled="systemSettingsOpening"
          :aria-busy="systemSettingsOpening"
          title="系统设置"
          @click="openSystemSettingsDialog"
        >
          <i
            :class="systemSettingsOpening ? 'ri-loader-4-line admin-spin' : 'ri-settings-3-line'"
            aria-hidden="true"
          />
          <span>系统设置</span>
        </button>
        <ChatPopup />
        <AiAssistantButton />
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
                <span>使用统一测试密码通过正常登录接口切换</span>
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
                :disabled="devUserSwitching"
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
        <div class="white">
          刷新菜单
        </div>
        </vxe-button>
        <vxe-button size="mini" mode="text" @click="signOut">退出</vxe-button>
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
              <SystemMenuTreeNode
                :item="group"
                :expanded-groups="expandedGroups"
                :accordion="true"
                :filtering="Boolean(normalizedMenuFilter)"
                :level="0"
                mode="link"
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
            :to="tab.fullPath"
            aria-haspopup="menu"
            @contextmenu.prevent.stop="openTabContextMenu($event, tab)"
            @keydown="handleTabContextKeydown($event, tab)"
          >
            {{ tab.title }}
          </RouterLink>
        </div>

        <p v-if="routeError" class="admin-route-error lc-error">{{ routeError }}</p>

        <slot />
      </main>
    </div>

    <GlobalDialogHost />
    <AiAssistantDrawer />
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import {VxeUI} from 'vxe-pc-ui';
import { useServiceApi } from '../composables/useServiceApi';
import { useRouteCache } from '../composables/useRouteCache';
import { loadSystemSettings } from '../composables/useSystemSettings';
import type { LowCodePageRecord } from '@enlearn/lowcode-framework/types/lowcode';
import SystemMenuTreeNode from '../../packages/lowcode-framework/src/components/SystemMenuTreeNode.vue';
import {
  confirmLowCodePage,
  ensureLowCodeEditPage,
  findGlobalDialog,
  GlobalDialogHost,
  openGlobalDialog,
} from '@enlearn/lowcode-framework/runtime';
import { openDesignDialog } from '@enlearn/lowcode-framework/designer';
import {
  closeDashboardTabs,
  formatDashboardTabTitle,
  resolveDashboardNavigationTitle,
} from '../utils/dashboardTabs';
import {
  buildPageInfoSaveData,
  createPageInfoDesignForm,
  normalizePageInfoDesignForm,
  type PageInfoDesignForm,
} from '../utils/lowCodePageInfoDesign';
import {
  hydratePageInfoDesignSchema,
  loadLowCodeFormDefinition,
  PAGE_INFO_DESIGN_FORM_CODE,
} from '../utils/lowCodeFormDefinitions';
import type { DashboardTabCloseScope } from '../utils/dashboardTabs';
import { getLowCodePage } from '../utils/lowCodePages';
import type { AppAccountSummary } from '../composables/useAuthState';
import {
  buildAdminRouteTree,
  collectNavigationRoots,
  filterAdminRouteNodes,
  flattenAdminRouteNodes,
  normalizeAdminRouteNodes,
  sortAdminRouteNodes,
  type AdminRouteNode,
} from '../../packages/lowcode-framework/src/utils/admin-navigation';

type MenuContextPayload = {
  event: MouseEvent;
  item: AdminRouteNode;
};

type TopToolGroup = AdminRouteNode & {
  tools: AdminRouteNode[];
};

type NavigationPlacement = 'sidebar' | 'top-tool' | 'container' | 'hidden';

type VisitedTab = {
  title: string;
  path: string;
  fullPath: string;
  pageType?: LowCodePageRecord['page_type'];
  pageCode?: string;
};

const SYSTEM_SETTINGS_DIALOG_ID = 'system-settings-editor-dialog';
const PAGE_INFO_DESIGN_DIALOG_ID = 'dashboard-page-info-design-dialog';
const VISUAL_DESIGN_DIALOG_ID = 'dashboard-visual-design-dialog';
const APPROVAL_CONSOLE_PATH = '/dashboard/approval/console';
const TASK_CONSOLE_PATH = '/dashboard/task/console';

const auth = useAuth();
const aiAssistant = useAiAssistant();
const frontendCommandSocket = useFrontendCommandSocket();
const serviceApi = useServiceApi();
const routeCache = useRouteCache();
const route = useRoute();
const router = useRouter();
const isDev = import.meta.env.DEV;
const devTestUsers = computed(() => auth.devTestUsers.value);
const activeDevTestUser = computed(() => auth.activeDevTestUser.value);
const activeDevUserId = computed(() => auth.activeDevTestUserId.value);
const showApprovalTestSwitcher = computed(
  () => isDev && route.path.startsWith('/dashboard/workflow')
);
const canOpenApprovalConsole = computed(() =>
  auth.permissions.value.includes('workflow.runtime.manage')
);
const canOpenTaskConsole = canOpenApprovalConsole;
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
const devUserSwitching = ref(false);
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
const systemSettingsOpening = ref(false);
const routes = ref<AdminRouteNode[]>([]);
let routesReloadPromise: Promise<void> | null = null;
const expandedGroups = reactive<Record<string, boolean>>({});
const visitedTabs = ref<VisitedTab[]>([]);
const menuFilter = ref('');
const openTopToolCode = ref('');
const accountMenuOpen = ref(false);
const accountSearch = ref('');
const accountSearchInput = ref<HTMLInputElement | null>(null);
const accountSwitching = ref(false);
const accountSwitchError = ref('');
let pageInfoDesignOpening = false;
const filteredAccounts = computed(() => {
  const keyword = accountSearch.value.trim().toLowerCase();
  if (!keyword) return auth.accounts.value;
  return auth.accounts.value.filter((account) =>
    [account.code, account.name, account.slug]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(keyword))
  );
});

function isAccountEnabled(account: AppAccountSummary) {
  return account.status !== 'inactive' && account.status !== 'archived';
}

function toggleAccountMenu() {
  accountMenuOpen.value = !accountMenuOpen.value;
  accountSwitchError.value = '';
  if (accountMenuOpen.value) {
    void nextTick(() => accountSearchInput.value?.focus());
  }
}

async function switchAccount(accountId: string) {
  if (accountSwitching.value || accountId === auth.activeAccount.value?.account_id) {
    accountMenuOpen.value = false;
    return;
  }

  accountSwitching.value = true;
  accountSwitchError.value = '';
  try {
    await aiAssistant.cancel();
    await auth.selectAccount(accountId);
    routes.value = [];
    visitedTabs.value = [];
    menuFilter.value = '';
    accountSearch.value = '';
    accountMenuOpen.value = false;
    await router.replace('/dashboard');
    await reloadRoutes();
  } catch (error) {
    accountSwitchError.value = error instanceof Error ? error.message : '账套切换失败，请重试。';
  } finally {
    accountSwitching.value = false;
  }
}

function ensureDevTestUserSelected() {
  if (!isDev) return;
  if (devTestUsers.value.some((user) => user.id === activeDevUserId.value)) return;
  const defaultUserId =
    devTestUsers.value.find((user) => user.id === auth.user.value?.id)?.id ??
    devTestUsers.value[0]?.id;
  if (defaultUserId) {
    void auth.switchDevTestUser(defaultUserId).catch((error) => {
      devUsersError.value = error instanceof Error ? error.message : '测试身份切换失败';
    });
  }
}

async function loadDevTestUsers() {
  if (!isDev) return;
  devUsersLoading.value = true;
  devUsersError.value = '';

  try {
    await auth.loadDevTestUsers();
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

async function selectDevTestUser(userId: string) {
  if (devUserSwitching.value || userId === activeDevUserId.value) {
    testUserMenuOpen.value = false;
    return;
  }

  devUserSwitching.value = true;
  devUsersError.value = '';
  try {
    await aiAssistant.cancel();
    await auth.switchDevTestUser(userId);
    testUserMenuOpen.value = false;
    testUserSearch.value = '';
    routes.value = [];
    await reloadRoutes();
  } catch (error) {
    devUsersError.value = error instanceof Error ? error.message : '测试身份切换失败';
  } finally {
    devUserSwitching.value = false;
  }
}

async function signOut() {
  await aiAssistant.cancel();
  await auth.signOut();
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

const normalizedRoutes = computed<AdminRouteNode[]>(() => normalizeAdminRouteNodes(routes.value));
const topToolGroups = computed<TopToolGroup[]>(() =>
  sortAdminRouteNodes(collectNavigationRoots(normalizedRoutes.value, 'top-tool')).map((group) => ({
    ...group,
    tools: sortAdminRouteNodes(group.children ?? [])
  }))
);
function collectSidebarMenu(nodes: AdminRouteNode[]) {
  return sortAdminRouteNodes(collectNavigationRoots(nodes, 'sidebar'));
}

const menuTree = computed<AdminRouteNode[]>(() => collectSidebarMenu(normalizedRoutes.value));
const normalizedMenuFilter = computed(() => menuFilter.value.trim().toLowerCase());
const filteredMenuTree = computed(() => filterAdminRouteNodes(menuTree.value, normalizedMenuFilter.value));
const flatMenu = computed<AdminRouteNode[]>(() => flattenAdminRouteNodes(menuTree.value));
const activeTitle = computed<string>(() =>
  resolveDashboardNavigationTitle(
    [...flatMenu.value, ...topToolGroups.value.flatMap((group) => group.tools)],
    route.path,
  )
);
function reloadRoutes() {
  if (routesReloadPromise) return routesReloadPromise;

  routesReloadPromise = (async () => {
    routeError.value = '';

    try {
      const data = await serviceApi.invoke<AdminRouteNode[]>(
        'admin',
        'listNavigationRoutes',
        {},
      );
      routes.value = Array.isArray(data) ? buildAdminRouteTree(data) : [];
    } catch (error) {
      routes.value = [];
      routeError.value =
        error instanceof Error ? error.message : '数据库菜单加载失败。';
    }
  })().finally(() => {
    routesReloadPromise = null;
  });

  return routesReloadPromise;
}

function toggleGroup(code: string) {
  const willExpand = expandedGroups[code] !== true;

  if (willExpand) {
    for (const siblingCode of findSiblingGroupCodes(menuTree.value, code)) {
      if (siblingCode !== code) expandedGroups[siblingCode] = false;
    }
  }

  expandedGroups[code] = willExpand;
}

function findSiblingGroupCodes(nodes: AdminRouteNode[], targetCode: string): string[] {
  if (nodes.some((node) => node.code === targetCode)) {
    return nodes
      .filter((node) => Boolean(node.children?.length))
      .map((node) => node.code);
  }

  for (const node of nodes) {
    const siblingCodes = findSiblingGroupCodes(node.children ?? [], targetCode);
    if (siblingCodes.length) return siblingCodes;
  }

  return [];
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

function findVisitedTabRoute(path: string) {
  return [...flatMenu.value, ...topToolGroups.value.flatMap((group) => group.tools)]
    .find((item) => item.path === path);
}

function resolveVisitedTabPageCode(tab: VisitedTab) {
  return tab.pageCode ?? findVisitedTabRoute(tab.path)?.page_code ?? '';
}

function openTabContextMenu(event: MouseEvent, tab: VisitedTab) {
  openTabContextMenuAt(event.clientX, event.clientY, tab);
}

function handleTabContextKeydown(event: KeyboardEvent, tab: VisitedTab) {
  if (event.key !== 'ContextMenu' && !(event.shiftKey && event.key === 'F10')) return;

  event.preventDefault();
  event.stopPropagation();
  const target = event.currentTarget as HTMLElement | null;
  const bounds = target?.getBoundingClientRect();
  openTabContextMenuAt(
    bounds ? bounds.left + Math.min(bounds.width / 2, 36) : 0,
    bounds ? bounds.bottom : 0,
    tab,
  );
}

function openTabContextMenuAt(x: number, y: number, tab: VisitedTab) {
  const targetIndex = visitedTabs.value.findIndex((item) => item.path === tab.path);
  if (targetIndex < 0) return;
  const pageCode = resolveVisitedTabPageCode(tab);

  VxeUI.contextMenu.open({
    x,
    y,
    className: 'enlearn-context-menu enlearn-tab-context-menu',
    options: [
      [
        {
          code: 'reload-page',
          name: '重新加载页面',
          prefixIcon: 'ri-refresh-line',
        },
        {
          code: 'close-current',
          name: '关闭当前',
          prefixIcon: 'ri-close-line',
        },
        {
          code: 'close-left',
          name: '关闭左侧',
          prefixIcon: 'ri-skip-left-line',
          disabled: targetIndex === 0,
        },
        {
          code: 'close-right',
          name: '关闭右侧',
          prefixIcon: 'ri-skip-right-line',
          disabled: targetIndex === visitedTabs.value.length - 1,
        },
        {
          code: 'close-others',
          name: '关闭其他',
          prefixIcon: 'ri-close-circle-line',
          disabled: visitedTabs.value.length === 1,
        },
      ],
      [
        {
          code: 'open-visual-designer',
          name: '可视化设计',
          prefixIcon: 'ri-layout-grid-line',
          disabled: !pageCode,
        },
        {
          code: 'open-page-info-designer',
          name: '页面信息设计',
          prefixIcon: 'ri-file-settings-line',
          disabled: !pageCode,
        },
      ],
    ],
    events: {
      optionClick({ option }) {
        if (option.code === 'reload-page') void reloadVisitedTab(tab);
        if (option.code === 'close-current') void closeVisitedTabs(tab, 'current');
        if (option.code === 'close-left') void closeVisitedTabs(tab, 'left');
        if (option.code === 'close-right') void closeVisitedTabs(tab, 'right');
        if (option.code === 'close-others') void closeVisitedTabs(tab, 'others');
        if (option.code === 'open-visual-designer') {
          void openLowCodeDesignerByCode(pageCode, tab);
        }
        if (option.code === 'open-page-info-designer') {
          void openLowCodePageInfoDesignerByCode(pageCode, tab);
        }
      },
    },
  });
}

function showPageInfoDesignMessage(content: string, status: 'success' | 'error') {
  const modal = (VxeUI as any).modal;
  if (modal?.message) void modal.message({ content, status });
}

function replaceVisitedTabPageInfo(tab: VisitedTab, page: LowCodePageRecord) {
  visitedTabs.value = visitedTabs.value.map((item) =>
    item.path === tab.path
      ? {
          ...item,
          title: formatDashboardTabTitle(page.title, page.page_type),
          pageType: page.page_type,
          pageCode: page.code,
        }
      : item
  );
}

async function openLowCodePageInfoDesignerByCode(pageCode: string, tab: VisitedTab) {
  if (
    !pageCode ||
    pageInfoDesignOpening ||
    findGlobalDialog(PAGE_INFO_DESIGN_DIALOG_ID)
  ) {
    return;
  }

  pageInfoDesignOpening = true;
  routeError.value = '';
  let savedPage: LowCodePageRecord | null = null;

  try {
    let currentPage = await getLowCodePage(serviceApi, {
      code: pageCode,
      includeData: true,
    });
    const pageManagement = await getLowCodePage(serviceApi, {
      code: 'lowcode-pages',
      includeData: false,
    });
    const editorPage = await ensureLowCodeEditPage(serviceApi, pageManagement);
    const formBlock = editorPage.schema.blocks.find(
      (block) => block.kind === 'form',
    );
    if (!formBlock || formBlock.kind !== 'form') {
      throw new Error('页面信息编辑页中没有可用的表单。');
    }
    const formSchema = hydratePageInfoDesignSchema(formBlock.schema, currentPage);
    const pageWithCurrentForm = structuredClone(editorPage);
    const runtimeForm = pageWithCurrentForm.schema.blocks.find(
      (block) => block.kind === 'form',
    );
    if (!runtimeForm || runtimeForm.kind !== 'form') {
      throw new Error('页面信息编辑页中没有可用的表单。');
    }
    runtimeForm.schema = formSchema;
    runtimeForm.initialValues = createPageInfoDesignForm(currentPage);
    runtimeForm.sourceKey = undefined;
    runtimeForm.submitSourceKey = undefined;
    runtimeForm.schema.actions = [];

    const result = await confirmLowCodePage({
      page: pageWithCurrentForm,
      includeData: false,
      serviceApi,
      router,
      route,
      title: '页面信息设计',
      width: 'min(1100px, calc(100vw - 32px))',
      height: 'min(680px, calc(100vh - 48px))',
      className: 'dashboard-page-info-design-dialog',
      confirmLabel: '保存',
      cancelLabel: '取消',
      dialog: {
        id: PAGE_INFO_DESIGN_DIALOG_ID,
        props: {
          top: '3vh',
          destroyOnClose: true,
        },
      },
    });
    if (result.action !== 'confirm' || !result.payload) return;
    const model = result.payload.formModels[runtimeForm.id];
    if (model) {
      const value = normalizePageInfoDesignForm(model as PageInfoDesignForm, currentPage);
      currentPage = await serviceApi.invoke<LowCodePageRecord>('lowcode', 'saveItem', {
        resource: 'lowcode_pages',
        id: currentPage.id,
        data: buildPageInfoSaveData(currentPage, value),
      });
    }
    savedPage = currentPage;

    const page = savedPage as LowCodePageRecord;
    replaceVisitedTabPageInfo(tab, page);
    showPageInfoDesignMessage('页面信息已保存。', 'success');
    await reloadVisitedTab(tab);
    replaceVisitedTabPageInfo(tab, page);
  } catch (error) {
    const message = error instanceof Error ? error.message : '页面信息设计打开失败。';
    routeError.value = message;
    showPageInfoDesignMessage(message, 'error');
  } finally {
    pageInfoDesignOpening = false;
  }
}

async function reloadVisitedTab(tab: VisitedTab) {
  routeCache.invalidate(tab.path);
  await nextTick();
  if (route.fullPath !== tab.fullPath) await router.push(tab.fullPath);
}

async function closeVisitedTabs(tab: VisitedTab, scope: DashboardTabCloseScope) {
  const targetIndex = visitedTabs.value.findIndex((item) => item.path === tab.path);
  const remainingTabs = closeDashboardTabs(visitedTabs.value, tab.path, scope);
  if (remainingTabs.length === visitedTabs.value.length) return;

  const activeTabWasClosed = !remainingTabs.some((item) => item.path === route.path);
  visitedTabs.value = remainingTabs;

  if (activeTabWasClosed) {
    const adjacentTab = scope === 'current'
      ? remainingTabs[Math.min(targetIndex, remainingTabs.length - 1)]
      : tab;
    await router.push(adjacentTab?.fullPath ?? '/dashboard');
    if (!visitedTabs.value.length) rememberTab();
  }
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

async function openSystemSettingsDialog() {
  if (
    systemSettingsOpening.value ||
    findGlobalDialog(SYSTEM_SETTINGS_DIALOG_ID)
  ) {
    return;
  }

  systemSettingsOpening.value = true;
  routeError.value = '';

  try {
    await confirmLowCodePage({
      pageCode: 'system-settings-edit',
      includeData: true,
      serviceApi: serviceApi as Parameters<typeof confirmLowCodePage>[0]['serviceApi'],
      router: router as Parameters<typeof confirmLowCodePage>[0]['router'],
      route: route as Parameters<typeof confirmLowCodePage>[0]['route'],
      locale: 'zh-CN',
      title: '系统设置',
      confirmLabel: '完成',
      cancelLabel: '关闭',
      submitOnConfirm: true,
      onRuntimeEvent: async (event) => {
        if (event.name === 'form.saved') {
          await loadSystemSettings(true);
        }
      },
      dialog: {
        id: SYSTEM_SETTINGS_DIALOG_ID,
      },
    });
  } catch (error) {
    routeError.value =
      error instanceof Error ? error.message : '系统设置编辑页打开失败。';
  } finally {
    systemSettingsOpening.value = false;
  }
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
      resource: 'admin_routes',
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

async function openLowCodeDesigner(item: AdminRouteNode) {
  await openLowCodeDesignerByCode(resolveLowCodePageCode(item));
}

async function openLowCodeDesignerByCode(pageCode: string, tab?: VisitedTab) {
  if (!pageCode || findGlobalDialog(VISUAL_DESIGN_DIALOG_ID)) return;

  routeError.value = '';
  try {
    const result = await openDesignDialog({
      id: VISUAL_DESIGN_DIALOG_ID,
      code: pageCode,
      title: `${tab?.title || pageCode}设计`,
      serviceApi,
      router,
      locale: 'zh-CN',
    });
    if (result.action !== 'confirm') return;

    const targetTab = tab ?? visitedTabs.value.find(
      (item) => resolveVisitedTabPageCode(item) === pageCode,
    );
    if (targetTab) await reloadVisitedTab(targetTab);
  } catch (error) {
    const message = error instanceof Error ? error.message : '可视化设计打开失败。';
    routeError.value = message;
    showPageInfoDesignMessage(message, 'error');
  }
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
    const editPage = await ensureLowCodeEditPage(serviceApi, page);

    await router.push(editPage.route);
    await reloadRoutes();
  } catch (error) {
    routeError.value =
      error instanceof Error ? error.message : '编辑页面打开失败。';
  }
}

function upsertVisitedTab(current: VisitedTab) {
  const existingIndex = visitedTabs.value.findIndex(
    (tab) => tab.path === current.path
  );

  if (existingIndex >= 0) {
    visitedTabs.value = visitedTabs.value.map((tab, index) =>
      index === existingIndex ? current : tab
    );
    return;
  }

  visitedTabs.value = [...visitedTabs.value, current].slice(-8);
}

function isLowCodeRuntimeRoute() {
  return route.matched.some((record) => record.path === '/dashboard/:slug(.*)*');
}

async function refreshLowCodeTabTitle(path: string, title: string) {
  try {
    const page = await getLowCodePage(serviceApi, {
      route: path,
      includeData: false
    });

    const existingTab = visitedTabs.value.find((tab) => tab.path === path);
    if (!existingTab) return;

    upsertVisitedTab({
      ...existingTab,
      path,
      title: formatDashboardTabTitle(title, page.page_type),
      pageType: page.page_type,
      pageCode: page.code,
    });
  } catch {
    // Keep the menu title for built-in fallback pages and unavailable page metadata.
  }
}

function rememberTab() {
  const existingTab = visitedTabs.value.find((tab) => tab.path === route.path);
  const pageCode = existingTab?.pageCode ?? findVisitedTabRoute(route.path)?.page_code;
  const current = {
    title: formatDashboardTabTitle(activeTitle.value, existingTab?.pageType),
    path: route.path,
    fullPath: route.fullPath,
    ...(existingTab?.pageType ? { pageType: existingTab.pageType } : {}),
    ...(pageCode ? { pageCode } : {}),
  };

  upsertVisitedTab(current);

  if (isLowCodeRuntimeRoute()) {
    void refreshLowCodeTabTitle(current.path, activeTitle.value);
  }
}

function handleAdminRoutesUpdated() {
  reloadRoutes();
}

function reconnectFrontendCommandSocket() {
  void frontendCommandSocket.connect().catch((error) => {
    console.warn('Frontend command socket connection failed.', error);
  });
}

function handleAuthUserChanged() {
  reconnectFrontendCommandSocket();
}

function handleMenuContextKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeMenuContext();
    openTopToolCode.value = '';
    testUserMenuOpen.value = false;
    accountMenuOpen.value = false;
  }
}

function closeFloatingPanels() {
  closeMenuContext();
  openTopToolCode.value = '';
  testUserMenuOpen.value = false;
  accountMenuOpen.value = false;
}

onMounted(async () => {
  await auth.init();
  reconnectFrontendCommandSocket();
  if (showApprovalTestSwitcher.value) {
    await loadDevTestUsers();
    ensureDevTestUserSelected();
  }
  await reloadRoutes();
  rememberTab();
  window.addEventListener('enlearn:admin-routes-updated', handleAdminRoutesUpdated);
  window.addEventListener('enlearn:auth-user-changed', handleAuthUserChanged);
  window.addEventListener('click', closeFloatingPanels);
  window.addEventListener('keydown', handleMenuContextKeydown);
});

onBeforeUnmount(() => {
  frontendCommandSocket.disconnect();
  window.removeEventListener('enlearn:admin-routes-updated', handleAdminRoutesUpdated);
  window.removeEventListener('enlearn:auth-user-changed', handleAuthUserChanged);
  window.removeEventListener('click', closeFloatingPanels);
  window.removeEventListener('keydown', handleMenuContextKeydown);
});

watch(
  [() => route.path, () => route.fullPath],
  ([path], [previousPath]) => {
    closeMenuContext();
    openTopToolCode.value = '';
    rememberTab();
    if (
      path.startsWith('/dashboard/workflow') &&
      !previousPath?.startsWith('/dashboard/workflow') &&
      !devUsersLoading.value
    ) {
      void loadDevTestUsers();
    }
  }
);

watch(
  () => auth.activeAccount.value?.account_id,
  (accountId, previousAccountId) => {
    if (accountId && accountId !== previousAccountId) {
      aiAssistant.resetForIdentityChange();
      reconnectFrontendCommandSocket();
    }
    if (
      accountId &&
      accountId !== previousAccountId &&
      showApprovalTestSwitcher.value &&
      !devUsersLoading.value
    ) {
      void loadDevTestUsers();
    }
  }
);
</script>

<style>
.dashboard-page-info-design-dialog .vxe-modal--body {
  min-height: 0;
  padding: 3px 4px 4px;
}

.dashboard-page-info-design-dialog .lc-global-dialog__body,
.dashboard-page-info-design-form {
  height: 100%;
  min-height: 0;
}

.dashboard-page-info-design-form .lc-form-tab-pane {
  padding-top: 3px;
}

@media (max-width: 720px) {
  .dashboard-page-info-design-dialog .vxe-modal--body {
    padding-inline: 10px;
  }
}
</style>
