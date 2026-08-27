<template>
  <section class="visual-designer-page" :class="[designerThemeClass, { 'visual-designer-page--embedded': embedded }]"
    :style="designerThemeStyle">
    <div class="visual-designer-frame">
      <div v-if="loading && !ready && !errorMessage" class="content-panel visual-designer-placeholder">
        <p class="page-description">正在加载低代码设计器...</p>
      </div>

      <ClientOnly v-else>
        <div class="visual-designer-layout">
          <aside v-if="showMenuDrawer" class="visual-designer-drawer" :class="{ 'is-collapsed': menuDrawerCollapsed }">
            <div class="visual-designer-drawer__panel" :aria-hidden="menuDrawerCollapsed">
              <header class="visual-designer-drawer__header">
                <div class="visual-designer-drawer__heading">
                  <strong>页面菜单</strong>
                  <span>{{ menuTreeStatusLabel }}</span>
                </div>
                <button class="visual-designer-drawer__refresh" type="button" :disabled="menuTreeLoading" title="刷新菜单"
                  @click="reloadMenuTree">
                  <i :class="menuTreeLoading ? 'ri-loader-4-line admin-spin' : 'ri-refresh-line'" aria-hidden="true" />
                </button>
              </header>

              <div class="admin-filter">
                <input v-model="menuFilter" aria-label="菜单过滤" placeholder="菜单过滤" type="search" />
              </div>

              <nav class="admin-menu visual-designer-drawer__menu">
                <p v-if="menuTreeLoading && !navigationRoutes.length" class="admin-menu-empty">
                  正在加载菜单树...
                </p>
                <template v-else>
                  <p v-if="menuTreeError" class="visual-designer-drawer__notice" role="alert">
                    {{ menuTreeError }}
                  </p>
                  <p v-if="!filteredMenuTree.length" class="admin-menu-empty">
                    {{ normalizedMenuFilter ? '无匹配菜单' : '暂无可用菜单' }}
                  </p>
                  <template v-for="group in filteredMenuTree" :key="group.code">
                    <section class="admin-menu-section">
                      <SystemMenuTreeNode :item="group" :expanded-groups="expandedGroups"
                        :filtering="Boolean(normalizedMenuFilter)" :level="0" mode="action"
                        :active-code="currentPageCode" :show-actions="true" :action-loading-code="menuActionLoadingCode"
                        @toggle="toggleGroup" @select="handleMenuSelect" @edit-page="handleEditMenuPage"
                        @add-child="handleAddChildMenu" @toggle-visible="handleToggleMenuVisible" />
                    </section>
                  </template>
                </template>
              </nav>
            </div>

            <button class="visual-designer-drawer__toggle" type="button" :aria-expanded="!menuDrawerCollapsed"
              :aria-label="menuDrawerCollapsed ? '展开页面菜单' : '收起页面菜单'" :title="menuDrawerCollapsed ? '展开页面菜单' : '收起页面菜单'"
              @click="toggleMenuDrawer">
              <i :class="menuDrawerCollapsed ? 'ri-arrow-right-s-line' : 'ri-arrow-left-s-line'" aria-hidden="true" />
            </button>
          </aside>

          <main class="visual-designer-workbench">
            <div v-if="errorMessage"
              class="content-panel visual-designer-placeholder visual-designer-placeholder--error">
              <h2 class="page-title">设计器不可用</h2>
              <p class="page-description">{{ errorMessage }}</p>
            </div>

            <VisualEditorProvider v-else-if="ready" ref="providerRef" :initial-data="visualModel"
              :page-record="designerPageRecord" :show-header="!embedded" :show-global-dialog-host="!embedded"
              @save="saveVisualProject">
              <template #meta>
                <div class="visual-designer-summary">
                  <strong>{{ form.title || '未命名页面' }}</strong>
                  <span v-if="message" :class="['visual-designer-message', messageType]">
                    {{ message }}
                  </span>
                  <span v-else>{{ form.code }} · {{ form.route }}</span>
                </div>
              </template>

              <template #actions>
                <div class="visual-designer-toolbar lc-actions">
                  <vxe-button size="mini" status="primary" :loading="pagePickerLoading" @click="openPagePicker">
                    加载页面
                  </vxe-button>
                  <vxe-button size="mini" @click="createBlankPage">新建页面</vxe-button>
                  <vxe-button size="mini" @click="openPageInfo">页面信息</vxe-button>
                  <vxe-button size="mini" :loading="loading" @click="reloadCurrent">刷新当前</vxe-button>
                  <vxe-button size="mini" status="primary" :loading="saving" @click="requestSave">
                    保存
                  </vxe-button>
                  <vxe-button size="mini" status="success" :loading="publishing" @click="requestPublish">
                    发布
                  </vxe-button>
                  <span @click="goBackToList">
                    <vxe-button size="mini">返回列表</vxe-button>
                  </span>
                </div>
              </template>
            </VisualEditorProvider>
          </main>
        </div>
      </ClientOnly>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { cloneDeep } from 'lodash-es';
import VisualEditorProvider from './VisualEditorProvider.vue';
import SystemMenuTreeNode from './SystemMenuTreeNode.vue';
import type {
  LowCodePageApi,
  LowCodePageBlock,
  LowCodePageFormBlock,
  LowCodePageRecord,
  LowCodePageSchema,
} from '../types/lowcode';
import type {
  VisualEditorModelValue,
  VisualEditorPage
} from '../visual-editor/visual-editor.utils';
import { convertLowCodePageSchemaToVisualEditor } from '../lowcode/visual-converters';
import { prepareLowCodePageSchema } from '../lowcode/schema';
import { convertVisualEditorToLowCode } from '../utils/visual-to-lowcode';
import {
  confirmLowCodePage,
  findGlobalDialog,
} from '../runtime/global-dialog';
import {
  provideLowCodeHost,
  useLowCodeHost,
  type LowCodeHostRouter,
  type LowCodeHostServiceApi,
  type LowCodeMessages,
  type LowCodeTheme,
} from '../core/host';
import {
  ensureLowCodeEditPage,
  ensureLowCodePageForRoute,
  getLowCodePage,
} from '../runtime/lowcode-pages';
import {
  buildAdminRouteTree,
  buildSidebarMenu,
  filterAdminRouteNodes,
  type AdminRouteNode,
} from '../utils/admin-navigation';

const props = defineProps<{
  code?: string;
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  backRoute?: string;
  embedded?: boolean;
}>();

const embedded = computed(() => props.embedded === true);

provideLowCodeHost({
  serviceApi: computed(() => props.serviceApi),
  router: computed(() => props.router),
  locale: computed(() => props.locale),
  messages: computed(() => props.messages),
  theme: computed(() => props.theme),
});

type DesignerPageStatus = 'draft' | 'published' | 'archived';
type MenuRouteType = 'group' | 'page' | 'link';
type DesignerPageForm = {
  code: string;
  route: string;
  title: string;
  description: string;
  status: DesignerPageStatus;
};

type MenuChildForm = {
  title: string;
  code: string;
  path: string;
  route_type: MenuRouteType;
  page_code: string;
};

function getLowCodeDesignerLoadPageBus() {
  const scope = globalThis as any;
  scope.__enlearnLowCodeDesignerLoadPageBus ??= { subscribers: [] };
  return scope.__enlearnLowCodeDesignerLoadPageBus;
}

function subscribeLowCodeDesignerLoadPage(subscriber: (code: string) => void) {
  const bus = getLowCodeDesignerLoadPageBus();
  bus.subscribers ??= [];
  bus.subscribers.push(subscriber);

  if (bus.pendingCode) {
    const pendingCode = bus.pendingCode;
    bus.pendingCode = '';
    subscriber(pendingCode);
  }

  return () => {
    bus.subscribers = (bus.subscribers ?? []).filter(
      (item: (code: string) => void) => item !== subscriber
    );
  };
}

let unsubscribeDesignerLoadPage: (() => void) | null = null;

const host = useLowCodeHost(() => ({
  serviceApi: props.serviceApi,
  router: props.router,
  locale: props.locale,
  messages: props.messages,
  theme: props.theme,
}));
const t = (key: Parameters<typeof host.t>[0], fallback?: string) => host.t(key, fallback);
const page = ref<LowCodePageRecord | null>(null);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const ready = ref(false);
const providerRef = ref<{
  getSnapshot: () => {
    model: VisualEditorModelValue;
    currentPath: string;
    currentPage: VisualEditorPage;
  };
} | null>(null);
const errorMessage = ref('');
const message = ref('');
const messageType = ref<'success' | 'error'>('success');
const visualModel = ref<VisualEditorModelValue | null>(null);
const loadingPageCode = ref('');
const pagePickerLoading = ref(false);
const menuFilter = ref('');
const navigationRoutes = ref<AdminRouteNode[]>([]);
const menuTreeLoading = ref(false);
const menuTreeError = ref('');
const menuActionLoadingCode = ref('');
const menuDrawerCollapsed = ref(false);
const expandedGroups = reactive<Record<string, boolean>>({});
let menuTreeLoadPromise: Promise<void> | null = null;
let pageLoadRequestSeq = 0;
const MENU_CHILD_EDITOR_DIALOG_ID = 'visual-designer-menu-child-editor';
const DYNAMIC_ROUTE_EDIT_PAGE_CODE = 'admin-system-routes-edit';
const DYNAMIC_ROUTE_EDIT_FORM_ID = 'edit-form-955036';

const designerThemeClass = computed(() => host.getTheme().className);
const designerThemeStyle = computed(() =>
  Object.fromEntries(
    Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])
  )
);
const showMenuDrawer = computed(() => !embedded.value);
const currentPageCode = computed(() => form.value.code.trim());
const normalizedMenuFilter = computed(() => menuFilter.value.trim().toLowerCase());
const sidebarMenuTree = computed(() => buildSidebarMenu(navigationRoutes.value));
const filteredMenuTree = computed(() => filterAdminRouteNodes(sidebarMenuTree.value, normalizedMenuFilter.value));
const menuTreeStatusLabel = computed(() => {
  if (menuTreeLoading.value) return '正在加载菜单树...';
  if (menuTreeError.value) return menuTreeError.value;
  if (normalizedMenuFilter.value) return '正在筛选菜单';
  return '点击菜单即可加载页面';
});

const form = ref<DesignerPageForm>({
  code: props.code || 'visual-admin-page',
  route: props.code ? `/dashboard/low-code/${props.code}` : '/dashboard/low-code/visual-admin-page',
  title: '可视化低代码页面',
  description: '',
  status: 'draft'
});
const designerPageRecord = computed<LowCodePageRecord>(() => {
  const current = page.value;
  const currentSchema = current?.schema;
  const keepAlive = currentSchema?.keepAlive ?? current?.keep_alive ?? true;

  return {
    id: current?.id ?? '',
    code: form.value.code,
    route: form.value.route,
    title: form.value.title,
    description: form.value.description || null,
    layout: current?.layout ?? currentSchema?.layout ?? 'dashboard',
    status: form.value.status,
    keep_alive: keepAlive,
    page_type: current?.page_type ?? currentSchema?.pageType ?? 'custom',
    edit_page_id: current?.edit_page_id ?? null,
    view_name: current?.view_name ?? null,
    table_name: current?.table_name ?? null,
    relate_config: current?.relate_config ?? {},
    node_actions: current?.node_actions ?? [],
    schema: {
      ...(currentSchema ?? {}),
      code: form.value.code,
      route: form.value.route,
      title: form.value.title,
      description: form.value.description,
      layout: current?.layout ?? currentSchema?.layout ?? 'dashboard',
      status: form.value.status,
      keepAlive,
      dataSources: currentSchema?.dataSources ?? {},
      blocks: currentSchema?.blocks ?? [],
      overlays: currentSchema?.overlays ?? [],
    },
    version: current?.version ?? 0,
    published_at: current?.published_at ?? null,
    created_at: current?.created_at ?? '',
    updated_at: current?.updated_at ?? '',
  };
});
const fallbackVisualModel = computed<VisualEditorModelValue>(() => ({
  pages: {
    '/': {
      title: form.value.title || '首页',
      path: '/',
      config: {
        bgColor: '',
        bgImage: '',
        keepAlive: false
      },
      blocks: [],
      overlays: []
    }
  },
  models: [],
  actions: {
    fetch: {
      name: '接口请求',
      apis: []
    },
    dialog: {
      name: '对话框',
      handlers: []
    }
  }
}));

function isVisualEditorModel(value: unknown): value is VisualEditorModelValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { pages?: unknown }).pages === 'object' &&
    (value as { pages?: unknown }).pages !== null
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function preserveDataSourceRuntimeSettings(
  previousSources: unknown,
  convertedSources: LowCodePageSchema['dataSources'],
) {
  const previous = isPlainRecord(previousSources) ? previousSources : {};

  return Object.fromEntries(
    Object.entries(convertedSources ?? {}).map(([key, source]) => {
      const previousSource = isPlainRecord(previous[key]) ? previous[key] : {};
      const loadAfterSourceKeys = Array.isArray(previousSource.loadAfterSourceKeys)
        ? previousSource.loadAfterSourceKeys.filter(
          (dependency): dependency is string =>
            typeof dependency === 'string' && dependency.trim().length > 0,
        )
        : undefined;

      return [
        key,
        {
          ...source,
          ...(typeof previousSource.autoLoad === 'boolean'
            ? { autoLoad: previousSource.autoLoad }
            : {}),
          ...(loadAfterSourceKeys
            ? { loadAfterSourceKeys: [...new Set(loadAfterSourceKeys)] }
            : {}),
        },
      ];
    }),
  );
}

function normalizeSchema(schema: LowCodePageSchema | null | undefined) {
  if (!schema) return fallbackVisualModel.value;
  const converted = convertLowCodePageSchemaToVisualEditor(schema);
  if (!isVisualEditorModel(schema.visualEditor)) return converted;

  const storedPage = schema.visualEditor.pages?.['/'];
  const convertedPage = converted.pages?.['/'];
  if (!storedPage || !convertedPage) return schema.visualEditor;

  const runtimeBlocks = new Map(
    convertedPage.blocks
      .filter((block) => typeof block.props?.blockId === 'string')
      .map((block) => [block.props.blockId, block]),
  );
  const storedBlockIds = new Set(
    storedPage.blocks
      .map((block) => block.props?.blockId)
      .filter((blockId): blockId is string => typeof blockId === 'string'),
  );
  const patchedBlocks = storedPage.blocks.map((block) => {
    const blockId = block.props?.blockId;
    const runtimeBlock = typeof blockId === 'string' ? runtimeBlocks.get(blockId) : undefined;
    if (!runtimeBlock) return block;

    const runtimeIsForm = runtimeBlock.componentKey === 'form' || runtimeBlock.componentKey === 'lowcode-search-form';
    const storedIsForm = block.componentKey === 'form' || block.componentKey === 'lowcode-search-form';
    if (runtimeIsForm && storedIsForm) {
      const mergedProps: Record<string, unknown> = {
        ...block.props,
        ...runtimeBlock.props,
        formDesignerModel: isVisualEditorModel(block.props?.formDesignerModel) &&
          block.componentKey === runtimeBlock.componentKey
          ? block.props.formDesignerModel
          : runtimeBlock.props?.formDesignerModel,
      };
      if (runtimeBlock.componentKey === 'form') {
        delete mergedProps.sourceKey;
        delete mergedProps.submitSourceKey;
      }
      return {
        ...block,
        componentKey: runtimeBlock.componentKey,
        label: runtimeBlock.label,
        props: mergedProps,
      };
    }

    return block;
  });
  const appendedBlocks = convertedPage.blocks.filter((block) => {
    const blockId = block.props?.blockId;
    return typeof blockId === 'string' && !storedBlockIds.has(blockId);
  });

  return {
    ...schema.visualEditor,
    pages: {
      ...schema.visualEditor.pages,
      '/': {
        ...storedPage,
        blocks: [...patchedBlocks, ...appendedBlocks],
      },
    },
  };
}

function fillForm(nextPage: LowCodePageRecord | null) {
  if (!nextPage) return;

  form.value = {
    code: nextPage.code,
    route: nextPage.route,
    title: nextPage.title,
    description: nextPage.description ?? '',
    status: nextPage.status
  };
}

function resetDesignerFrame() {
  loading.value = true;
  ready.value = false;
  errorMessage.value = '';
  message.value = '';
}

function invalidatePageLoads() {
  pageLoadRequestSeq += 1;
  loadingPageCode.value = '';
}

function applyVisualPage(nextPage: LowCodePageRecord) {
  page.value = nextPage;
  fillForm(nextPage);
  visualModel.value = normalizeSchema(nextPage.schema);
  ready.value = true;
}

function createPageCode() {
  return `visual-page-${Date.now().toString(36)}`;
}

function createMenuCode() {
  return `admin-menu-${Date.now().toString(36)}`;
}

function joinMenuPath(parentPath: string, childCode: string) {
  const safeChild = childCode.trim().replace(/^\/+/, '');
  const normalizedParent = parentPath.trim();
  const basePath = normalizedParent ? normalizedParent.replace(/\/+$/, '') : '';
  const prefix = basePath === '/' ? '' : basePath;
  return `${prefix}/${safeChild}`.replace(/\/{2,}/g, '/');
}

function readRouteMetadata(item: AdminRouteNode) {
  if (item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata)) {
    return item.metadata as Record<string, unknown>;
  }

  if (!item.metadata_json) return {};

  try {
    const parsed = JSON.parse(item.metadata_json);
    return isPlainRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function buildMenuChildMetadataJson(item: AdminRouteNode) {
  const metadata = readRouteMetadata(item);
  return JSON.stringify({
    ...metadata,
    navigation: metadata.navigation ?? 'sidebar',
  });
}

function getNextMenuSortOrder(parent: AdminRouteNode) {
  const children = parent.children ?? [];
  if (!children.length) return (parent.sort_order ?? 0) + 1;
  return (
    Math.max(...children.map((child) => child.sort_order ?? 0)) + 1
  );
}

function buildMenuSavePayload(
  item: AdminRouteNode,
  overrides: Partial<{
    code: string;
    title: string;
    path: string;
    parent_id: string | null;
    route_type: AdminRouteNode['route_type'];
    icon: string | null;
    page_code: string | null;
    permission_code: string | null;
    visible: boolean;
    keep_alive: boolean;
    layout: LowCodePageRecord['layout'];
    status: string;
    sort_order: number;
    metadata_json: string;
  }> = {},
) {
  return {
    ...(item.id ? { id: item.id } : {}),
    code: overrides.code ?? item.code,
    title: overrides.title ?? item.title,
    path: overrides.path ?? item.path,
    parent_id: overrides.parent_id ?? item.parent_id ?? null,
    route_type: overrides.route_type ?? item.route_type ?? (item.children?.length ? 'group' : 'page'),
    icon: overrides.icon ?? item.icon ?? null,
    page_code: overrides.page_code ?? item.page_code ?? null,
    permission_code: overrides.permission_code ?? item.permission_code ?? null,
    visible: overrides.visible ?? item.visible !== false,
    keep_alive: overrides.keep_alive ?? item.keep_alive !== false,
    layout: overrides.layout ?? item.layout ?? 'dashboard',
    status: overrides.status ?? item.status ?? 'active',
    sort_order: overrides.sort_order ?? item.sort_order ?? 0,
    metadata_json:
      overrides.metadata_json ?? item.metadata_json ?? JSON.stringify(item.metadata ?? {}),
  };
}

function createMenuChildModel(parent: AdminRouteNode): MenuChildForm {
  const code = createMenuCode();
  return {
    title: `${parent.title} 子菜单`,
    code,
    path: joinMenuPath(parent.path, code),
    route_type: 'page',
    page_code: '',
  };
}

function normalizeMenuChildForm(value: Record<string, unknown>, parent: AdminRouteNode): MenuChildForm {
  const rawRouteType = String(value.route_type ?? 'page');
  const routeType: MenuRouteType = ['group', 'page', 'link'].includes(rawRouteType)
    ? (rawRouteType as MenuRouteType)
    : 'page';
  const code = String(value.code ?? '').trim() || createMenuCode();
  const title = String(value.title ?? '').trim() || `${parent.title} 子菜单`;
  const path = String(value.path ?? '').trim() || joinMenuPath(parent.path, code);
  const pageCode = String(value.page_code ?? '').trim();

  return {
    title,
    code,
    path,
    route_type: routeType,
    page_code: pageCode,
  };
}

function findPageForm(
  blocks: LowCodePageBlock[],
  predicate?: (block: LowCodePageFormBlock) => boolean,
): LowCodePageFormBlock | undefined {
  for (const block of blocks) {
    if (block.kind === 'form' && (!predicate || predicate(block))) return block;
    const nestedForm = findPageForm(getChildPageBlocks(block), predicate);
    if (nestedForm) return nestedForm;
  }
  return undefined;
}

function createMenuChildEditPage(
  editorPage: LowCodePageRecord,
  initialValues: Record<string, unknown>,
): { page: LowCodePageRecord; formId: string } {
  const schema = cloneDeep(editorPage.schema);
  const blocks = [
    ...(schema.blocks ?? []),
    ...(schema.overlays ?? []),
  ];
  const formBlock =
    findPageForm(
      blocks,
      (block) => block.id === DYNAMIC_ROUTE_EDIT_FORM_ID,
    ) ?? findPageForm(blocks);

  if (!formBlock) {
    throw new Error('动态路由编辑页中没有可用的表单。');
  }

  formBlock.initialValues = {
    ...(formBlock.initialValues ?? {}),
    ...cloneDeep(initialValues),
  };
  formBlock.dataSource = undefined;
  formBlock.schema.actions = [];

  if (schema.dataSources && 'record' in schema.dataSources) {
    const { record: _record, ...dataSources } = schema.dataSources;
    schema.dataSources = dataSources;
  }

  return {
    page: { ...editorPage, schema },
    formId: formBlock.id,
  };
}

async function refreshMenuTreeAfterMutation() {
  await loadMenuTree(true);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('enlearn:admin-routes-updated'));
  }
}

async function runMenuAction(
  action: 'edit-page' | 'add-child' | 'toggle-visible',
  code: string,
  handler: () => Promise<void>,
) {
  const loadingCode = `${action}:${code}`;
  menuActionLoadingCode.value = loadingCode;
  try {
    await handler();
  } finally {
    if (menuActionLoadingCode.value === loadingCode) {
      menuActionLoadingCode.value = '';
    }
  }
}

function createBlankPage() {
  const code = createPageCode();
  invalidatePageLoads();
  loading.value = false;
  errorMessage.value = '';
  page.value = null;
  form.value = {
    code,
    route: `/dashboard/low-code/${code}`,
    title: '可视化低代码页面',
    description: '',
    status: 'draft'
  };
  visualModel.value = fallbackVisualModel.value;
  ready.value = true;
  message.value = '已创建空白设计页。';
  messageType.value = 'success';
}

async function loadPageByCode(code: string) {
  const nextCode = code.trim();
  if (!nextCode) return;
  if (loading.value && loadingPageCode.value === nextCode) return;
  const requestId = ++pageLoadRequestSeq;
  loadingPageCode.value = nextCode;
  const keepCurrentDesigner = ready.value && Boolean(visualModel.value);
  if (keepCurrentDesigner) {
    loading.value = true;
    errorMessage.value = '';
  } else {
    resetDesignerFrame();
  }

  try {
    const nextPage = await getLowCodePage(host.getServiceApi(), {
      code: nextCode,
      includeData: false
    });
    if (requestId !== pageLoadRequestSeq) return;
    applyVisualPage(nextPage);
    message.value = `已加载 ${nextPage.title || nextPage.code}。`;
    messageType.value = 'success';
  } catch (error) {
    if (requestId !== pageLoadRequestSeq) return;
    const errorText =
      error instanceof Error ? error.message : '低代码页面加载失败。';
    if (keepCurrentDesigner) {
      message.value = errorText;
      messageType.value = 'error';
    } else {
      errorMessage.value = errorText;
    }
  } finally {
    if (requestId === pageLoadRequestSeq) {
      loading.value = false;
      loadingPageCode.value = '';
    }
  }
}

async function reload(codeOverride?: string) {
  const code =
    typeof codeOverride === 'string'
      ? codeOverride
      : page.value?.code || props.code || '';

  if (code) {
    await loadPageByCode(code);
    return;
  }

  invalidatePageLoads();
  resetDesignerFrame();
  try {
    page.value = null;
    visualModel.value = fallbackVisualModel.value;
    ready.value = true;
  } finally {
    loading.value = false;
  }
}

function reloadCurrent() {
  reload();
}

function handleDesignerLoadPage(code: string) {
  if (!code) return;
  void loadPageByCode(code);
}

async function loadMenuTree(force = false) {
  if (!showMenuDrawer.value) return;
  if (menuTreeLoadPromise) {
    if (!force) return menuTreeLoadPromise;
    await menuTreeLoadPromise;
  }
  if (!force && navigationRoutes.value.length > 0) return;

  menuTreeLoading.value = true;
  menuTreeError.value = '';

  menuTreeLoadPromise = (async () => {
    try {
      const rows = await host.getServiceApi().invoke<AdminRouteNode[]>(
        'admin',
        'listItems',
        {
          resource: 'admin_routes',
          limit: 2000,
        },
      );
      navigationRoutes.value = Array.isArray(rows) ? buildAdminRouteTree(rows) : [];
    } catch (error) {
      menuTreeError.value = error instanceof Error ? error.message : '菜单树加载失败。';
    } finally {
      menuTreeLoading.value = false;
    }
  })().finally(() => {
    menuTreeLoadPromise = null;
  });

  return menuTreeLoadPromise;
}

function reloadMenuTree() {
  void loadMenuTree(true);
}

async function handleMenuSelect(item: AdminRouteNode) {
  if (item.children?.length || item.route_type === 'link' || item.route_type === 'group') return;
  try {
    const page = item.page_code?.trim()
      ? await getLowCodePage(host.getServiceApi(), {
          code: item.page_code.trim(),
          includeData: false,
        })
      : await ensureLowCodePageForRoute(host.getServiceApi(), item);
    await loadPageByCode(page.code);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '低代码页面打开失败。';
    messageType.value = 'error';
  }
}

async function saveMenuItem(item: AdminRouteNode, overrides: Parameters<typeof buildMenuSavePayload>[1]) {
  if (!item.id) {
    throw new Error('当前菜单缺少数据库 ID，无法保存。');
  }

  await host.getServiceApi().invoke('admin', 'saveItem', {
    resource: 'admin_routes',
    ...buildMenuSavePayload(item, overrides),
  });
}

async function handleToggleMenuVisible(item: AdminRouteNode) {
  const loadingCode = item.code;
  try {
    await runMenuAction('toggle-visible', loadingCode, async () => {
      const shouldBeActive = item.status === 'inactive' || item.visible === false;
      await saveMenuItem(item, {
        status: shouldBeActive ? 'active' : 'inactive',
        visible: shouldBeActive,
      });
      await refreshMenuTreeAfterMutation();
      message.value = shouldBeActive ? '菜单已显示。' : '菜单已隐藏。';
      messageType.value = 'success';
    });
  } catch (error) {
    message.value = error instanceof Error ? error.message : '菜单状态保存失败。';
    messageType.value = 'error';
  }
}

async function handleEditMenuPage(item: AdminRouteNode) {
  if (item.children?.length) return;

  const pageCode = item.page_code?.trim() ?? '';
  if (!pageCode) return;

  try {
    await runMenuAction('edit-page', item.code, async () => {
      const pageRecord = await getLowCodePage(host.getServiceApi(), {
        code: pageCode,
        includeData: false,
      });
      const editPage = await ensureLowCodeEditPage(host.getServiceApi(), pageRecord);
      await loadPageByCode(editPage.code);
      message.value = `已打开 ${editPage.title || editPage.code}。`;
      messageType.value = 'success';
    });
  } catch (error) {
    message.value = error instanceof Error ? error.message : '关联编辑页面打开失败。';
    messageType.value = 'error';
  }
}

async function handleAddChildMenu(parent: AdminRouteNode) {
  if (findGlobalDialog(MENU_CHILD_EDITOR_DIALOG_ID)) return;
  if (!parent.id) {
    message.value = '当前菜单缺少数据库 ID，无法新增子菜单。';
    messageType.value = 'error';
    return;
  }

  const model = {
    id: '',
    ...createMenuChildModel(parent),
    parent_id: parent.id,
    icon: null,
    permission_code: null,
    visible: true,
    keep_alive: true,
    layout: parent.layout ?? 'dashboard',
    status: 'active',
    sort_order: getNextMenuSortOrder(parent),
    metadata_json: buildMenuChildMetadataJson(parent),
  };

  try {
    const editorPage = await getLowCodePage(host.getServiceApi(), {
      code: DYNAMIC_ROUTE_EDIT_PAGE_CODE,
      includeData: true,
    });
    const runtimePage = createMenuChildEditPage(editorPage, model);
    const result = await confirmLowCodePage({
      page: runtimePage.page,
      includeData: true,
      serviceApi: host.getServiceApi(),
      router: host.getRouter(),
      route: host.getRoute(),
      locale: props.locale,
      messages: props.messages,
      theme: props.theme,
      title: `新增子菜单 - ${parent.title}`,
      width: 'min(1120px, calc(100vw - 48px))',
      confirmLabel: '保存',
      cancelLabel: '取消',
      submitOnConfirm: true,
      dialog: {
        id: MENU_CHILD_EDITOR_DIALOG_ID,
      },
    });
    if (result.action !== 'confirm' || !result.payload) return;

    const formValues = result.payload.formModels[runtimePage.formId];
    const values = normalizeMenuChildForm(
      isPlainRecord(formValues) ? formValues : {},
      parent,
    );
    if (!values.title.trim()) {
      throw new Error('菜单名称不能为空。');
    }
    if (!values.code.trim()) {
      throw new Error('菜单编码不能为空。');
    }
    if (!values.path.trim()) {
      throw new Error('菜单路径不能为空。');
    }

    await runMenuAction('add-child', parent.code, async () => {
      await host.getServiceApi().invoke('admin', 'saveItem', {
        resource: 'admin_routes',
        code: values.code,
        title: values.title,
        path: values.path,
        parent_id: parent.id,
        route_type: values.route_type,
        icon: null,
        page_code: values.route_type === 'page' ? (values.page_code.trim() || null) : null,
        permission_code: null,
        visible: true,
        keep_alive: true,
        layout: parent.layout ?? 'dashboard',
        status: 'active',
        sort_order: getNextMenuSortOrder(parent),
        metadata_json: buildMenuChildMetadataJson(parent),
      });
      expandedGroups[parent.code] = true;
      await refreshMenuTreeAfterMutation();
    });

    message.value = `已新增 ${values.title}。`;
    messageType.value = 'success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '子菜单保存失败。';
    messageType.value = 'error';
  }
}

function toggleGroup(code: string) {
  expandedGroups[code] = expandedGroups[code] === false;
}

function toggleMenuDrawer() {
  menuDrawerCollapsed.value = !menuDrawerCollapsed.value;
}

watch(
  () => props.code,
  (nextCode) => {
    reload(nextCode || '');
  },
  { immediate: true }
);

onMounted(() => {
  unsubscribeDesignerLoadPage = subscribeLowCodeDesignerLoadPage(handleDesignerLoadPage);
  if (showMenuDrawer.value) {
    void loadMenuTree();
  }
});

onBeforeUnmount(() => {
  unsubscribeDesignerLoadPage?.();
  unsubscribeDesignerLoadPage = null;
});

function buildSchema(payload: {
  model: VisualEditorModelValue;
  currentPath: string;
  currentPage: VisualEditorPage;
}) {
  const previousSchema = (page.value?.schema ?? {}) as Partial<LowCodePageSchema>;
  const converted = convertVisualEditorToLowCode(payload.model, payload.currentPage);
  const hasRuntimeBlocks = converted.blocks.length > 0;
  const hasVisualOverlays = Array.isArray(payload.currentPage.overlays);
  const hasRuntimeOverlays = converted.overlays.length > 0;
  const hasRuntimeContent = hasRuntimeBlocks || hasRuntimeOverlays;

  return prepareLowCodePageSchema({
    ...previousSchema,
    code: form.value.code,
    route: form.value.route,
    title: form.value.title,
    description: form.value.description,
    pageType: page.value?.page_type ?? previousSchema.pageType ?? 'custom',
    layout: page.value?.layout ?? previousSchema.layout ?? 'dashboard',
    status: form.value.status,
    keepAlive: page.value?.keep_alive ?? previousSchema.keepAlive ?? true,
    config: payload.currentPage.config,
    visualEditor: payload.model,
    dataSources: hasRuntimeContent
      ? preserveDataSourceRuntimeSettings(
        previousSchema.dataSources,
        converted.dataSources,
      )
      : isPlainRecord(previousSchema.dataSources)
        ? previousSchema.dataSources
        : {},
    blocks: hasRuntimeBlocks
      ? converted.blocks
      : Array.isArray(previousSchema.blocks)
        ? previousSchema.blocks
        : [],
    overlays: hasVisualOverlays
      ? converted.overlays
      : Array.isArray(previousSchema.overlays)
        ? previousSchema.overlays
        : []
  });
}

function buildPageSaveData(schema: LowCodePageSchema) {
  const nextVersion = (page.value?.version ?? 0) + 1;
  const publishedAt =
    schema.status === 'published'
      ? new Date().toISOString()
      : page.value?.published_at ?? null;

  return {
    code: schema.code,
    route: schema.route,
    title: schema.title,
    description: schema.description ?? null,
    layout: schema.layout ?? 'dashboard',
    status: schema.status ?? 'draft',
    keep_alive: schema.keepAlive ?? true,
    page_type: schema.pageType ?? 'custom',
    edit_page_id: page.value?.edit_page_id ?? null,
    table_name: page.value?.table_name ?? null,
    relate_config: page.value?.relate_config ?? {},
    schema,
    version: nextVersion,
    published_at: publishedAt
  };
}

async function saveLowCodePageItem(schema: LowCodePageSchema) {
  return host.getServiceApi().invoke<LowCodePageRecord>('lowcode', 'saveItem', {
    resource: 'lowcode_pages',
    ...(page.value?.id ? { id: page.value.id } : {}),
    data: buildPageSaveData(schema)
  });
}

async function saveVisualProject(payload: {
  model: VisualEditorModelValue;
  currentPath: string;
  currentPage: VisualEditorPage;
}, overrideStatus?: DesignerPageStatus) {
  if (!form.value.code.trim() || !form.value.route.trim() || !form.value.title.trim()) {
    throw new Error('页面编码、路由和标题不能为空。');
  }

  saving.value = true;
  if (overrideStatus === 'published') {
    publishing.value = true;
  }
  message.value = '';

  try {
    const originalStatus = form.value.status;
    if (overrideStatus) {
      form.value.status = overrideStatus;
    }
    const schema = buildSchema(payload);
    const saved = await saveLowCodePageItem(schema);

    page.value = saved;
    fillForm(saved);
    message.value = `已保存 ${saved.code}，版本 ${saved.version}。`;
    messageType.value = 'success';
    if (!overrideStatus) {
      form.value.status = originalStatus;
    }
    return saved;
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败。';
    messageType.value = 'error';
    throw error;
  } finally {
    saving.value = false;
    publishing.value = false;
  }
}

async function save() {
  if (saving.value) {
    throw new Error('页面正在保存，请稍候。');
  }

  const snapshot = providerRef.value?.getSnapshot();
  if (!snapshot) {
    throw new Error('请等待设计器初始化完成后再保存。');
  }

  return saveVisualProject(snapshot);
}

async function publish() {
  if (saving.value) {
    throw new Error('页面正在保存，请稍候。');
  }

  const snapshot = providerRef.value?.getSnapshot();
  if (!snapshot) {
    throw new Error('请等待设计器初始化完成后再发布。');
  }

  return saveVisualProject(snapshot, 'published');
}

async function requestSave() {
  if (saving.value) return;

  try {
    await save();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '保存失败。';
    messageType.value = 'error';
  }
}

async function requestPublish() {
  if (saving.value) return;

  try {
    await publish();
  } catch (error) {
    message.value = error instanceof Error ? error.message : '发布失败。';
    messageType.value = 'error';
  }
}

async function openPagePicker() {
  if (findGlobalDialog('lowcode-page-picker')) return;

  pagePickerLoading.value = true;
  message.value = '';

  try {
    const result = await confirmLowCodePage({
      pageCode: 'lowcode-pages',
      includeData: true,
      serviceApi: host.getServiceApi(),
      router: host.getRouter(),
      route: host.getRoute(),
      locale: props.locale,
      messages: props.messages,
      theme: props.theme,
      title: '加载页面',
      confirmLabel: '加载',
      requireSelection: true,
      dialog: {
        id: 'lowcode-page-picker',
        className: 'visual-designer-dialog',
      },
    });

    if (result.action === 'cancel' || result.action === 'close') return;

    const code = readPageCodeFromPickerResult(result.payload);
    if (!code) {
      message.value = '请先选择要加载的页面。';
      messageType.value = 'error';
      return;
    }

    await loadPageByCode(code);
  } catch (error) {
    message.value = error instanceof Error ? error.message : '页面列表加载失败。';
    messageType.value = 'error';
  } finally {
    pagePickerLoading.value = false;
  }
}

function readPageCodeFromPickerResult(payload: unknown) {
  if (!isPlainRecord(payload)) return '';

  const row = [
    payload.row,
    payload.selectedRow,
    payload.currentRow,
    Array.isArray(payload.selectedRows) ? payload.selectedRows[0] : undefined,
    Array.isArray(payload.rows) ? payload.rows[0] : undefined,
  ].find(isPlainRecord);

  return typeof row?.code === 'string' ? row.code.trim() : '';
}

function normalizePageInfoForm(value: Record<string, unknown>): DesignerPageForm {
  const status = String(value.status ?? 'draft');

  return {
    code: String(value.code ?? ''),
    route: String(value.route ?? ''),
    title: String(value.title ?? ''),
    description: String(value.description ?? ''),
    status: ['draft', 'published', 'archived'].includes(status)
      ? (status as DesignerPageStatus)
      : 'draft',
  };
}

function getChildPageBlocks(block: LowCodePageBlock): LowCodePageBlock[] {
  const children: LowCodePageBlock[] = [];
  if ('blocks' in block && Array.isArray(block.blocks)) children.push(...block.blocks);
  if (block.kind === 'tabs') {
    block.tabs.forEach((tab) => children.push(...tab.blocks));
  }
  if ('overlays' in block && Array.isArray(block.overlays)) children.push(...block.overlays);
  return children;
}

function findPageInfoForm(blocks: LowCodePageBlock[]): LowCodePageFormBlock | undefined {
  return findPageForm(blocks);
}

function createPageInfoEditorPage(
  editorPage: LowCodePageRecord,
  initialValues: Record<string, unknown>,
): LowCodePageRecord {
  const schema = cloneDeep(editorPage.schema);
  const formBlock = findPageInfoForm([
    ...(schema.blocks ?? []),
    ...(schema.overlays ?? []),
  ]);
  if (!formBlock) {
    throw new Error('页面信息编辑页中没有可用的表单。');
  }

  formBlock.initialValues = cloneDeep(initialValues);
  formBlock.dataSource = undefined;
  formBlock.schema.actions = [];

  return { ...editorPage, schema };
}

function readPageInfoValues(
  formModels: Record<string, Record<string, unknown>>,
) {
  return Object.values(formModels).find(isPlainRecord) ?? {};
}

async function openPageInfo() {
  if (findGlobalDialog('lowcode-page-info')) return;

  try {
    const serviceApi = host.getServiceApi();
    if (!page.value) {
      throw new Error('请先保存当前页面，再编辑页面信息。');
    }
    const pageManagement = await getLowCodePage(serviceApi, {
      code: 'lowcode-pages',
      includeData: false,
    });
    const editorPage = await ensureLowCodeEditPage(serviceApi, pageManagement);
    const initialValues = {
      ...form.value,
      pageType: page.value?.page_type ?? page.value?.schema?.pageType ?? 'custom',
      layout: page.value?.layout ?? page.value?.schema?.layout ?? 'dashboard',
      keepAlive: page.value?.keep_alive ?? page.value?.schema?.keepAlive ?? true,
      tableName: page.value?.table_name ?? '',
      relateConfig: cloneDeep(page.value?.relate_config ?? {}),
      functions: cloneDeep(page.value?.schema?.functions ?? []),
      apis: cloneDeep(
        Object.entries(page.value?.schema?.apis ?? {}).map(([name, api]) => ({
          name,
          ...api,
        })),
      ),
    };
    const result = await confirmLowCodePage({
      page: createPageInfoEditorPage(editorPage, initialValues),
      includeData: false,
      serviceApi,
      router: host.getRouter(),
      route: host.getRoute(),
      title: '页面信息',
      width: 'min(1120px, calc(100vw - 48px))',
      confirmLabel: '确定',
      cancelLabel: '取消',
      dialog: { id: 'lowcode-page-info' },
    });
    if (result.action !== 'confirm' || !result.payload) return;

    const values = readPageInfoValues(result.payload.formModels);
    form.value = normalizePageInfoForm(values);
    if (page.value) {
      page.value.page_type = String(values.pageType ?? page.value.page_type) as LowCodePageRecord['page_type'];
      page.value.layout = String(values.layout ?? page.value.layout) as LowCodePageRecord['layout'];
      page.value.keep_alive = values.keepAlive !== false;
      page.value.table_name = String(values.tableName ?? '').trim() || null;
      page.value.relate_config = isPlainRecord(values.relateConfig)
        ? cloneDeep(values.relateConfig)
        : {};
      page.value.schema.functions = Array.isArray(values.functions)
        ? cloneDeep(values.functions) as LowCodePageSchema['functions']
        : [];
      page.value.schema.apis = Array.isArray(values.apis)
        ? values.apis.filter(isPlainRecord).reduce<NonNullable<LowCodePageSchema['apis']>>(
          (apis, api) => {
            const name = String(api.name ?? '').trim();
            if (!name) return apis;
            const serviceName = String(api.serviceName ?? '').trim();
            const serviceMethod = String(api.serviceMethod ?? '').trim();
            if (!serviceName || !serviceMethod) return apis;
            const definition: LowCodePageApi = {
              serviceName,
              serviceMethod,
              ...(typeof api.method === 'string' ? { method: api.method as LowCodePageApi['method'] } : {}),
              ...(isPlainRecord(api.postData) ? { postData: cloneDeep(api.postData) } : {}),
              ...(typeof api.resultPath === 'string' ? { resultPath: api.resultPath } : {}),
            };
            apis[name] = definition;
            return apis;
          },
          {},
        )
        : {};
      page.value.schema.pageType = page.value.page_type;
      page.value.schema.layout = page.value.layout;
      page.value.schema.keepAlive = page.value.keep_alive;
    }
    message.value = '页面信息已更新。';
    messageType.value = 'success';
  } catch (error) {
    message.value = error instanceof Error ? error.message : '页面信息加载失败。';
    messageType.value = 'error';
  }
}

async function goBackToList() {
  await host.getRouter().push(props.backRoute ?? '/dashboard/low-code');
}

defineExpose({
  save,
  publish,
  reload: () => reload(),
});

</script>

<style scoped>
.visual-designer-layout {
  display: flex;
  min-width: 0;
  min-height: 0;
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  --visual-designer-drawer-width: 286px;
  --visual-designer-drawer-handle-width: 20px;
}

.visual-designer-drawer {
  position: absolute;
  inset: 0 auto 0 0;
  z-index: 24;
  width: calc(var(--visual-designer-drawer-width) + var(--visual-designer-drawer-handle-width));
  min-width: 0;
  min-height: 0;
  pointer-events: none;
}

.visual-designer-drawer__panel {
  display: flex;
  width: var(--visual-designer-drawer-width);
  height: 100%;
  min-height: 0;
  flex-direction: column;
  border-right: 1px solid #d8e0ea;
  background: #ffffff;
  box-shadow: 5px 0 18px rgb(15 23 42 / 12%);
  pointer-events: auto;
  transform: translateX(0);
  transition:
    transform 0.18s ease,
    visibility 0s linear 0s;
  visibility: visible;
}

.visual-designer-drawer.is-collapsed .visual-designer-drawer__panel {
  pointer-events: none;
  transform: translateX(-100%);
  transition:
    transform 0.18s ease,
    visibility 0s linear 0.18s;
  visibility: hidden;
}

.visual-designer-drawer__toggle {
  position: absolute;
  top: 50%;
  left: var(--visual-designer-drawer-width);
  z-index: 2;
  display: inline-grid;
  width: var(--visual-designer-drawer-handle-width);
  height: 72px;
  place-items: center;
  border: 1px solid #d6dee8;
  border-left: 0;
  border-radius: 0 7px 7px 0;
  background: #ffffff;
  color: #334155;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
  pointer-events: auto;
  transform: translateY(-50%);
  transition:
    left 0.18s ease,
    background-color 0.15s ease,
    color 0.15s ease;
  box-shadow: 4px 0 12px rgb(15 23 42 / 10%);
}

.visual-designer-drawer__toggle:hover {
  color: #1d64d8;
  background: #f1f7ff;
}

.visual-designer-drawer.is-collapsed .visual-designer-drawer__toggle {
  left: 0;
}

.visual-designer-drawer__header {
  display: flex;
  min-height: 48px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-bottom: 1px solid #dfe5ec;
  padding: 0 10px 0 12px;
}

.visual-designer-drawer__heading {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.visual-designer-drawer__heading strong {
  color: #111827;
  font-size: 13px;
  line-height: 18px;
}

.visual-designer-drawer__heading span {
  color: #64748b;
  font-size: 11px;
  line-height: 16px;
}

.visual-designer-drawer__refresh {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 16px;
}

.visual-designer-drawer__refresh:hover:not(:disabled) {
  color: #1d64d8;
  background: #edf3fb;
}

.visual-designer-drawer__refresh:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.visual-designer-drawer__menu {
  min-height: 0;
  flex: 1;
  overflow: auto;
}

.visual-designer-drawer__notice {
  margin: 8px 12px 0;
  color: #b42318;
  font-size: 12px;
  line-height: 18px;
}

.visual-designer-workbench {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  width: 100%;
}

.visual-designer-placeholder {
  display: grid;
  min-width: 0;
  min-height: 0;
  flex: 1;
  place-items: center;
  gap: 6px;
  text-align: center;
}

.visual-designer-placeholder--error {
  align-content: center;
}

@media (max-width: 1100px) {
  .visual-designer-layout {
    --visual-designer-drawer-width: 240px;
  }
}

@media (max-width: 820px) {
  .visual-designer-layout {
    --visual-designer-drawer-width: min(320px, calc(100vw - 36px));
  }

  .visual-designer-drawer__toggle {
    height: 62px;
  }
}
</style>
