<template>
  <div
    class="lowcode-runtime-shell"
    :class="themeClass"
    :style="themeStyle"
    :aria-busy="runtime.state.status.mesCommandExecuting"
    :data-mes-command-executing="runtime.state.status.mesCommandExecuting ? 'true' : 'false'"
  >
    <LowCodeCategoryDrawer
      v-if="hasCategoryRelation"
      :config="page.relate_config"
      :service-api="categoryServiceApi"
      @select="handleCategorySelect"
    />

    <div class="lowcode-runtime-page">
      <div v-if="dataLoading" class="lc-page-loading-overlay" aria-live="polite">
        <span>{{ loadingText }}</span>
      </div>

      <LowCodeBlockRenderer
        v-for="(block, index) in layoutBlocks"
        :key="block.id"
        :class="{ 'lc-runtime-block--fill': index === layoutBlocks.length - 1 }"
        :block="block"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="({ block: formBlock, values, action }) => handleFormSubmit(formBlock, values, action)"
        @form-action="({ block: formBlock, action, values }) => handleFormAction(formBlock, action, values)"
        @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
        @grid-delete="({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)"
        @toolbar-action="({ action }) => handleToolbarAction(action)"
        @search-submit="({ block: searchBlock, values, action }) => handleSearchSubmit(searchBlock, values, action)"
        @search-action="({ block: searchBlock, action, values }) => handleSearchAction(searchBlock, action, values)"
        @runtime-event="publishRuntimeEvent"
      />

      <LowCodeOverlayHost
        v-if="pageOverlays.length"
        :overlays="pageOverlays"
        :resolved-data="resolvedData"
        :form-models="formModels"
        :search-filters="searchFilters"
        :loading-block-id="loadingBlockId"
        :loading-grid-id="loadingGridId"
        @form-submit="({ block: formBlock, values, action }) => handleFormSubmit(formBlock, values, action)"
        @form-action="({ block: formBlock, action, values }) => handleFormAction(formBlock, action, values)"
        @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
        @grid-delete="({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)"
        @toolbar-action="({ action }) => handleToolbarAction(action)"
        @search-submit="({ block: searchBlock, values, action }) => handleSearchSubmit(searchBlock, values, action)"
        @search-action="({ block: searchBlock, action, values }) => handleSearchAction(searchBlock, action, values)"
        @runtime-event="publishRuntimeEvent"
      />

      <p v-if="message" :class="messageClass">{{ message }}</p>
      <GlobalDialogHost v-if="showGlobalDialogHost" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue';
import type {
  LowCodeAction,
  LowCodeButtonGroupAction,
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageOverlayBlock,
  LowCodePageSearchFormBlock,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent
} from '../types/lowcode';
import type { LowCodeRuntimeBlock } from '../lowcode/block-materials';
import { resolveGridRows } from '../lowcode/block-materials/helpers';
import GlobalDialogHost from './GlobalDialogHost';
import LowCodeCategoryDrawer from './LowCodeCategoryDrawer.vue';
import LowCodeOverlayHost from './LowCodeOverlayHost.vue';
import {
  createLowCodeEventBus,
  normalizeLowCodeDirectives,
  resolveEventDirectives
} from '../lowcode/event-system';
import {
  useLowCodeHost,
  type LowCodeHostRoute,
  type LowCodeHostRouter,
  type LowCodeHostServiceApi,
  type LowCodeMessages,
  type LowCodeTheme,
} from '../core/host';
import {
  executeLowCodeRuntimeDirective,
  type LowCodeRuntimeDirectiveContext,
} from '../runtime/directives';
import {
  openGlobalDialog as openLowCodeGlobalDialog,
  type GlobalDialogConfig,
} from '../runtime/global-dialog';
import {
  openLowCodePageReferenceDialog,
  type LowCodePageReferenceDialogConfig,
} from '../runtime/page-reference-dialog';
import {
  DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
  compactLowCodeScriptContext,
  executeLowCodeScript,
  invokeRegisteredLowCodeScriptApi,
  preloadLowCodeScriptRuntime,
  type LowCodeScriptCapabilityRequest,
  type LowCodeScriptContextSnapshot,
  type LowCodeScriptExecutionMode,
} from '../runtime/scripts';
import {
  hasBuiltinLowCodePageFunctions,
  resolveBuiltinLowCodePageFunction,
  type BuiltinLowCodePageFunctionContext,
  type BuiltinLowCodePageFunctionMode,
} from '../runtime/page-function';
import { ensureLowCodeEditPage } from '../runtime/lowcode-pages';
import {
  lowCodeRuntimeBlockEditorKey,
  type LowCodeRuntimeBlockUpdate,
} from '../runtime/block-editor';
import {
  createLowCodePageRuntime,
  lowCodeEditPageModeScopeKey,
  lowCodePageRuntimeKey,
} from '../runtime/page-runtime';
import {
  invokeDesktopMesCommand,
  isDesktopMesCommand,
  prepareDesktopMesCommandRequest,
} from '../runtime/mes-command';
import {
  isLowCodeEditPageReadonly,
  resolveLowCodeEditPageMode,
} from '../runtime/edit-page-mode';
import {
  isLowCodeEditPageModifyAction,
  isLowCodeEditPageSaveAction,
} from '../runtime/button-disabled';
import { lowCodeScriptContextProviderKey } from '../runtime/script-context-provider';
import type { LowCodeContextSource } from '../runtime/lowcode-context';
import {
  resolveLowCodeDataSourceNodeAction,
  resolveLowCodeNodeAction,
} from '../runtime/node-action-registry';
import { lowCodeOptionSourceRegistry } from '../runtime/option-source-registry';

const props = withDefaults(defineProps<{
  page: LowCodePageRecord & {
    resolvedData?: Record<string, unknown>;
  };
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  route?: LowCodeHostRoute;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  onRuntimeEvent?: (event: LowCodeRuntimeEvent) => Promise<void> | void;
  showGlobalDialogHost?: boolean;
}>(), {
  showGlobalDialogHost: true,
});

function hasSchemaPageFunctions() {
  return (props.page.schema.functions?.length ?? 0) > 0;
}

function hasRuntimePageFunctions() {
  return hasSchemaPageFunctions() || hasBuiltinLowCodePageFunctions(props.page.page_type);
}

const host = useLowCodeHost(() => ({
  serviceApi: props.serviceApi,
  router: props.router,
  route: props.route,
  locale: props.locale,
  messages: props.messages,
  theme: props.theme,
}));
const runtime = createLowCodePageRuntime();
runtime.state.status.formMode =
  props.page.page_type === 'edit'
    ? resolveLowCodeEditPageMode(host.getRoute().query?.id)
    : 'scan';
provide(lowCodePageRuntimeKey, runtime);
provide(lowCodeEditPageModeScopeKey, true);

const resolvedData = computed(() => runtime.state.sources);
const formModels = computed(() => runtime.state.forms);
const searchFilters = computed(() => runtime.state.searches);
const gridStates = computed(() => runtime.state.grids);
const loadingBlockId = computed({
  get: () => runtime.state.status.loadingBlockId,
  set: (value: string) => {
    runtime.state.status.loadingBlockId = value;
  },
});
const loadingGridId = computed({
  get: () => runtime.state.status.loadingGridId,
  set: (value: string) => {
    runtime.state.status.loadingGridId = value;
  },
});
const message = computed({
  get: () => runtime.state.status.message,
  set: (value: string) => {
    runtime.state.status.message = value;
  },
});
const messageClass = computed({
  get: () => runtime.state.status.messageClass,
  set: (value: string) => {
    runtime.state.status.messageClass = value;
  },
});
const dataLoading = computed({
  get: () => runtime.state.status.dataLoading,
  set: (value: boolean) => {
    runtime.state.status.dataLoading = value;
  },
});
const runtimeEventBus = createLowCodeEventBus();
const pendingActionEvents = new WeakMap<object, Promise<void>>();
type RuntimeDirectiveExecutionContext = {
  mesCommandStarted: boolean;
  mesCommandCompleted: boolean;
  mesCommandRefreshCompleted: boolean;
  mesCommandRefreshFailed: boolean;
};
const formBaselines: Record<string, Record<string, unknown>> = {};
const runtimeBlockRenderRevision = ref(0);
let runtimeBlockReloadSuppression: {
  pageId: string;
  version: number;
  fullPath: string;
} | undefined;
const MAX_PAGE_FUNCTION_CALL_DEPTH = 16;
let loadSequence = 0;
let sourceRequestSequence = 0;
const sourceRequestVersions = new Map<string, number>();
let runtimePageId = '';
const builtinPageFunctionMode = computed<BuiltinLowCodePageFunctionMode>({
  get: () => runtime.state.status.formMode,
  set: (mode) => {
    runtime.state.status.formMode = mode;
  },
});
let lastSavedFormRecord: Record<string, unknown> | undefined;

onMounted(() => {
  void preloadLowCodeScriptRuntime().catch(() => undefined);
});

provide(lowCodeRuntimeBlockEditorKey, {
  updateBlock: persistRuntimeBlockUpdate,
  getDataSource,
  getPageSchema: () => props.page.schema,
  getPageRecord: () => props.page,
  getServiceApi: () => host.getServiceApi(),
  getScriptContextSource: createScriptContextSource,
  executeFieldScript: async (script, event) => (
    await executeIsolatedScript(script, event)
  ).value,
});
provide(lowCodeScriptContextProviderKey, {
  getSource: createScriptContextSource,
});

defineExpose({
  getSnapshot: () => ({
    page: props.page,
    runtime: runtime.snapshot(),
    resolvedData: cloneRuntimeValue(resolvedData.value),
    formModels: cloneRuntimeValue(formModels.value),
    searchFilters: cloneRuntimeValue(searchFilters.value),
    gridStates: cloneRuntimeValue(gridStates.value),
  }),
  submitForms,
});

const themeClass = computed(() => host.getTheme().className);
const themeStyle = computed(() =>
  Object.fromEntries(
    Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])
  )
);
const hasCategoryRelation = computed(() => readString(props.page.relate_config?.category) !== '');
const categoryServiceApi = computed(() => props.serviceApi ?? host.getServiceApi());
const selectedCategoryId = ref('');
const layoutBlocks = computed(() => {
  runtimeBlockRenderRevision.value;
  return markLastBlockFill(
    validBlocks(props.page.schema.blocks).filter((block) => !isOverlayBlock(block))
  );
});

async function handleCategorySelect(node: { id: unknown; label: string }) {
  selectedCategoryId.value = readString(node.id);
  const mainSourceKeys = [...new Set(flattenPageBlocks(props.page.schema)
    .filter((block): block is LowCodePageGridBlock => (
      block.kind === 'grid' && block.tableType === 'main' && readString(block.categoryField) !== ''
    ))
    .map((block) => readString(block.sourceKey))
    .filter(Boolean))];
  if (mainSourceKeys.length) {
    const errors = await refreshDataSources(mainSourceKeys);
    if (errors.length) {
      message.value = errors[0];
      messageClass.value = 'lc-error';
    }
  }
  await publishRuntimeEvent({
    name: 'category.selected',
    blockId: 'page-category-drawer',
    blockKind: 'tree',
    timestamp: Date.now(),
    payload: {
      id: node.id,
      label: node.label,
      category: readString(props.page.relate_config?.category),
    },
  });
}
const pageOverlays = computed<LowCodePageOverlayBlock[]>(() => {
  runtimeBlockRenderRevision.value;
  return [
    ...validBlocks(props.page.schema.blocks).filter(isOverlayBlock),
    ...validBlocks(props.page.schema.overlays).filter(isOverlayBlock),
  ];
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRuntimeBlock(value: unknown): value is LowCodePageBlock {
  return isRecord(value) && readString(value.id) !== '' && readString(value.kind) !== '';
}

function validBlocks(value: unknown): LowCodePageBlock[] {
  return Array.isArray(value) ? value.filter(isRuntimeBlock) : [];
}

function isOverlayBlock(block: LowCodePageBlock): block is LowCodePageOverlayBlock {
  return block.kind === 'modal' || block.kind === 'drawer';
}

function markLastBlockFill<T extends LowCodePageBlock>(blocks: T[]) {
  const lastIndex = blocks.length - 1;
  return blocks.map((block, index) =>
    index === lastIndex
      ? {
          ...block,
          layout: {
            ...(block.layout ?? {}),
            fillRemaining: true,
          },
        }
      : block
  );
}

function cloneRuntimeValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function readPath(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

type RuntimeExpressionScope = {
  row?: Record<string, unknown>;
  event?: LowCodeRuntimeEvent;
  value?: unknown;
  values?: Record<string, unknown>;
};

function toExpressionScope(
  scopeOrRow: RuntimeExpressionScope | Record<string, unknown> = {}
): RuntimeExpressionScope {
  if (
    'event' in scopeOrRow ||
    'row' in scopeOrRow ||
    'value' in scopeOrRow ||
    'values' in scopeOrRow
  ) {
    return scopeOrRow as RuntimeExpressionScope;
  }

  return { row: scopeOrRow as Record<string, unknown> };
}

function resolveExpression(
  expression: string,
  scopeOrRow: RuntimeExpressionScope | Record<string, unknown> = {}
) {
  const scope = toExpressionScope(scopeOrRow);
  const eventPayload = scope.event?.payload ?? {};
  const currentBlockId = scope.event?.blockId ?? '';
  const currentForm = currentBlockId ? formModels.value[currentBlockId] ?? {} : {};
  const currentRoute = host.getRoute();
  const expressionRoot = {
    row: scope.row ?? (isRecord(eventPayload.row) ? eventPayload.row : {}),
    route: {
      query: currentRoute.query ?? {},
      params: currentRoute.params ?? {},
      path: currentRoute.path ?? '',
      fullPath: currentRoute.fullPath ?? ''
    },
    data: resolvedData.value,
    form: currentForm,
    forms: formModels.value,
    search: searchFilters.value,
    grids: gridStates.value,
    event: {
      ...eventPayload,
      name: scope.event?.name,
      blockId: scope.event?.blockId,
      blockKind: scope.event?.blockKind
    },
    value: scope.value ?? eventPayload.value,
    values: scope.values ?? (isRecord(eventPayload.values) ? eventPayload.values : {})
  };

  return readPath(expressionRoot, expression.trim());
}

function resolveRuntimeValue(
  value: unknown,
  scopeOrRow: RuntimeExpressionScope | Record<string, unknown> = {}
): unknown {
  if (typeof value === 'string') {
    const singleExpression = value.match(/^\{\{\s*([^}]+?)\s*\}\}$/);
    if (singleExpression) {
      return resolveExpression(singleExpression[1], scopeOrRow) ?? '';
    }

    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, expression: string) =>
      String(resolveExpression(expression, scopeOrRow) ?? '')
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => resolveRuntimeValue(item, scopeOrRow));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, resolveRuntimeValue(item, scopeOrRow)])
    );
  }

  return value;
}

function resolveRuntimePostData(postData?: Record<string, unknown>) {
  return resolveRuntimeValue(postData ?? {}) as Record<string, unknown>;
}

function tableNameFromEntityCode(entityCode: string) {
  const knownTables: Record<string, string> = {
    users: 'profiles',
    admin_roles: 'admin_roles',
    admin_permissions: 'admin_permissions',
    admin_routes: 'admin_routes',
    admin_entities: 'admin_entities',
    lowcode_pages: 'lowcode_pages',
  };

  return knownTables[entityCode] ?? entityCode;
}

function readDataSourceTargetValue(
  source: LowCodePageDataSource,
  postData: Record<string, unknown>,
  camelKey: 'entityCode' | 'tableName',
  snakeKey: 'entity_code' | 'table_name'
) {
  return readString(postData[camelKey] ?? postData[snakeKey], readString(source[camelKey] ?? source[snakeKey]));
}

function withDataSourceTargetPostData(
  source: LowCodePageDataSource,
  postData: Record<string, unknown>
) {
  const entityCode = readDataSourceTargetValue(source, postData, 'entityCode', 'entity_code');
  const tableName = readDataSourceTargetValue(source, postData, 'tableName', 'table_name');
  const resolvedTableName = tableName || (entityCode ? tableNameFromEntityCode(entityCode) : '');

  return {
    ...postData,
    ...(resolvedTableName ? { tableName: resolvedTableName } : {}),
  };
}

function hasDataSourceTableTarget(
  source: LowCodePageDataSource,
  postData: Record<string, unknown>
) {
  return Boolean(
    readDataSourceTargetValue(source, postData, 'entityCode', 'entity_code') ||
    readDataSourceTargetValue(source, postData, 'tableName', 'table_name')
  );
}

function resolveDataSourceService(
  source: LowCodePageDataSource,
  postData: Record<string, unknown>
) {
  const isListItemsSource = hasDataSourceTableTarget(source, postData);

  return {
    serviceName: readString(source.serviceName, isListItemsSource ? 'admin' : ''),
    serviceMethod: readString(source.serviceMethod, isListItemsSource ? 'listItems' : ''),
  };
}

const legacyAdminListMethodTables: Record<string, string> = {
  listUsers: 'users',
  listRoles: 'admin_roles',
  listPermissions: 'admin_permissions',
  listRoutes: 'admin_routes',
  listRouteTree: 'admin_routes',
  listRouteManageTree: 'admin_routes',
  listEntities: 'admin_entities',
  listPages: 'lowcode_pages',
  listOptionSources: 'system_option_sources',
  listSystemExecutionTasks: 'system_execution_tasks',
  listWorkflowJobs: 'workflow_jobs',
  listWorkflowJobRuns: 'workflow_job_runs',
  listWorkflowTimerJobs: 'workflow_timer_jobs',
};

const legacyDynamicOptionListMethods = new Set([
  'listOptionItems',
  'listDropdownOptions',
]);

const legacyWorkflowListItemTypes: Record<string, string> = {
  listWorkflowJobs: 'jobs',
  listWorkflowJobRuns: 'jobRuns',
};

const legacyLowCodeListMethodTables: Record<string, string> = {
  listPages: 'lowcode_pages',
};

const legacyNotificationListResources: Record<string, string> = {
  listMessages: 'notification_messages',
  getPreferences: 'notification_preferences',
  listDeliveries: 'notification_deliveries',
};

const emptyWhenUnavailableListMethods = new Set([
  'listSystemExecutionTasks',
  'listWorkflowTimerJobs',
]);

const lowCodeTableListMethods = new Set([
  'listTableRows',
  'listRows',
  'listTableData',
]);

function normalizeLegacyAdminListRequest(
  serviceName: string,
  serviceMethod: string,
  postData: Record<string, unknown>
) {
  if (serviceName === 'admin' && legacyDynamicOptionListMethods.has(serviceMethod)) {
    return {
      serviceName,
      serviceMethod: 'resolveOptionItems',
      postData,
    };
  }

  if (serviceName === 'notification' && legacyNotificationListResources[serviceMethod]) {
    return {
      serviceName,
      serviceMethod: 'listItems',
      postData: {
        ...postData,
        resource: readString(postData.resource, legacyNotificationListResources[serviceMethod]),
      },
    };
  }

  if (serviceName === 'files' && serviceMethod === 'listStorageEntities') {
    return {
      serviceName,
      serviceMethod: 'runAction',
      postData: {
        ...postData,
        resource: readString(postData.resource, 'file_objects'),
        operation: readString(postData.operation ?? postData.actionName ?? postData.action, serviceMethod),
      },
    };
  }

  if (serviceName === 'admin' && legacyWorkflowListItemTypes[serviceMethod]) {
    return {
      serviceName: 'workflow',
      serviceMethod: 'listItems',
      postData: {
        ...postData,
        itemType: readString(postData.itemType ?? postData.item_type ?? postData.type, legacyWorkflowListItemTypes[serviceMethod]),
      },
    };
  }

  if (serviceName === 'lowcode' && lowCodeTableListMethods.has(serviceMethod)) {
    return {
      serviceName: 'admin',
      serviceMethod: 'listItems',
      postData,
    };
  }

  const tableName = serviceName === 'admin'
    ? legacyAdminListMethodTables[serviceMethod]
    : serviceName === 'lowcode'
      ? legacyLowCodeListMethodTables[serviceMethod]
      : '';
  if (!tableName) {
    return { serviceName, serviceMethod, postData };
  }

  return {
    serviceName,
    serviceMethod: 'listItems',
    postData: {
      ...postData,
      tableName: readString(postData.tableName ?? postData.table_name, tableName),
    },
  };
}

function shouldReturnEmptyForUnavailableList(error: unknown, serviceMethod: string) {
  if (!emptyWhenUnavailableListMethods.has(serviceMethod)) return false;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    message.includes('Could not find the table') ||
    message.includes('Unsupported Admin listItems itemType') ||
    message.includes('does not exist')
  );
}

function isListItemsRequest(serviceName: string, serviceMethod: string) {
  return serviceName === 'admin' && serviceMethod === 'listItems';
}

function mergeDataSourceSearchFilters(
  key: string,
  postData: Record<string, unknown>
) {
  const sourceFilters = searchFilters.value[key];

  if (!sourceFilters || !Object.keys(sourceFilters).length) {
    return postData;
  }

  const currentFilters = isRecord(postData.filters) ? postData.filters : {};

  return {
    ...postData,
    filters: {
      ...currentFilters,
      ...sourceFilters,
    },
  };
}

function mergeMainGridCategoryFilter(
  key: string,
  postData: Record<string, unknown>,
) {
  if (!selectedCategoryId.value) return postData;

  const mainGrid = flattenPageBlocks(props.page.schema).find(
    (block): block is LowCodePageGridBlock => (
      block.kind === 'grid' &&
      block.tableType === 'main' &&
      block.sourceKey === key &&
      readString(block.categoryField) !== ''
    ),
  );
  const categoryField = readString(mainGrid?.categoryField);
  if (!categoryField) return postData;

  return {
    ...postData,
    filters: {
      ...(isRecord(postData.filters) ? postData.filters : {}),
      [categoryField]: selectedCategoryId.value,
    },
  };
}

function resolveDataSourceRequest(
  key: string,
  source: LowCodePageDataSource,
  postDataOverride?: Record<string, unknown>,
  includeSearchFilters = true,
) {
  const basePostData = resolveRuntimePostData(postDataOverride ?? source.postData);
  const targetedPostData = withDataSourceTargetPostData(source, basePostData);
  const searchedPostData = includeSearchFilters
    ? mergeDataSourceSearchFilters(key, targetedPostData)
    : targetedPostData;
  const postData = mergeMainGridCategoryFilter(key, searchedPostData);
  const service = resolveDataSourceService(source, postData);

  return normalizeLegacyAdminListRequest(service.serviceName, service.serviceMethod, postData);
}

function resolveDataSourcePostData(key: string, source: LowCodePageDataSource) {
  return resolveDataSourceRequest(key, source).postData;
}

function resolveRuntimeRoute(path: string, row: Record<string, unknown> = {}) {
  return resolveRuntimeValue(path, row) as string;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getGridRowKey(block: LowCodePageGridBlock) {
  const rowConfig = block.schema.grid.rowConfig;
  return isRecord(rowConfig) ? readString(rowConfig.keyField, 'id') : 'id';
}

function appendRouteQuery(route: string, query: Record<string, unknown>) {
  const entries = Object.entries(query).filter(([, value]) => typeof value !== 'undefined' && value !== null && value !== '');
  if (!entries.length) return route;

  const [withoutHash, hash = ''] = route.split('#');
  const separator = withoutHash.includes('?') ? '&' : '?';
  const queryString = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return `${withoutHash}${separator}${queryString}${hash ? `#${hash}` : ''}`;
}

async function findLowCodePage(filters: Record<string, unknown>) {
  const pages = await host.getServiceApi().invoke<LowCodePageRecord[]>('lowcode', 'listItems', {
    tableName: 'lowcode_pages',
    filters,
    includeData: false,
    limit: 1,
  });
  return Array.isArray(pages) ? pages[0] : undefined;
}

function cloneRuntimeValueWithFunctions<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneRuntimeValueWithFunctions(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, cloneRuntimeValueWithFunctions(item)]),
    ) as T;
  }
  return value;
}

async function resolveAssociatedEditPage() {
  if (props.page.page_type === 'list') {
    return ensureLowCodeEditPage(host.getServiceApi(), props.page);
  }

  const editPageId = readString(props.page.edit_page_id);
  if (editPageId) return findLowCodePage({ id: editPageId });
  return findLowCodePage({ code: `${props.page.code}-edit` });
}

async function resolveEditPageRoute(
  row: Record<string, unknown> = {},
  rowKey = 'id',
) {
  const editPage = await resolveAssociatedEditPage();
  const route = readString(editPage?.route);
  if (!route) return '';

  const resolvedRoute = resolveRuntimeRoute(route, row);
  const rowValue = row[rowKey];

  return appendRouteQuery(resolvedRoute, {
    fromPage: props.page.code,
    ...(typeof rowValue !== 'undefined' && rowValue !== null && rowValue !== ''
      ? { [rowKey]: rowValue }
      : {}),
  });
}

async function resolveLinkedEditPageRoute(
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
  return resolveEditPageRoute(row, getGridRowKey(block));
}

function getDataSource(key?: string) {
  if (!key) return undefined;
  return props.page.schema.dataSources?.[key];
}

async function invokeDataSource(
  key: string,
  source: LowCodePageDataSource,
  force = false
) {
  if (!force && source.autoLoad === false) {
    return [key, undefined] as const;
  }

  const { serviceName, serviceMethod, postData } = resolveDataSourceRequest(key, source);

  if (!serviceName || !serviceMethod) {
    throw new Error(`Data source ${key} is missing serviceName or serviceMethod.`);
  }

  let data: unknown;

  try {
    data = await host.getServiceApi().invoke(
      serviceName,
      serviceMethod,
      postData
    );
  } catch (error) {
    if (shouldReturnEmptyForUnavailableList(error, source.serviceMethod ?? serviceMethod)) {
      data = [];
    } else {
      throw error;
    }
  }

  return [key, data] as const;
}

function beginSourceRequest(key: string) {
  const version = ++sourceRequestSequence;
  sourceRequestVersions.set(key, version);
  runtime.setSourceLoading(key, true);
  return version;
}

function isCurrentSourceRequest(key: string, version: number) {
  return sourceRequestVersions.get(key) === version;
}

function finishSourceRequest(key: string, version: number) {
  if (!isCurrentSourceRequest(key, version)) return;
  runtime.setSourceLoading(key, false);
}

function invalidateSourceRequests() {
  sourceRequestVersions.clear();
}

type RefreshDataSourceOptions = {
  ordered?: boolean;
  strict?: boolean;
};

async function refreshDataSources(
  sourceKeys: string[] = [],
  options: RefreshDataSourceOptions = {},
) {
  const allEntries = Object.entries(props.page.schema.dataSources ?? {});
  const uniqueSourceKeys = [...new Set(sourceKeys)];
  const entries = uniqueSourceKeys.length
    ? uniqueSourceKeys
        .map((key) => {
          const source = getDataSource(key);
          return source ? ([key, source] as const) : undefined;
        })
        .filter((entry): entry is readonly [string, LowCodePageDataSource] => Boolean(entry))
    : allEntries;
  const pageBlocks = flattenPageBlocks(props.page.schema);
  const refreshEntry = async ([key, source]: readonly [string, LowCodePageDataSource]) => {
    const nodeAction = resolveLowCodeDataSourceNodeAction(pageBlocks, key);
    if (nodeAction) {
      try {
        await executeScriptNodeAction({
          node: nodeAction.block.id,
          method: nodeAction.action.method,
        });
        return '';
      } catch (error) {
        return `${key}: ${error instanceof Error ? error.message : host.t('runtime.errors.refreshDataSource')}`;
      }
    }

    const version = beginSourceRequest(key);
    runtime.setSource(key, undefined);

    try {
      const [resolvedKey, value] = await invokeDataSource(key, source, true);
      if (!isCurrentSourceRequest(key, version)) return '';
      if (typeof value !== 'undefined') {
        runtime.setSource(resolvedKey, value, { resetGridBaseline: true });
      }
      return '';
    } catch (error) {
      if (!isCurrentSourceRequest(key, version)) return '';
      return `${key}: ${error instanceof Error ? error.message : host.t('runtime.errors.refreshDataSource')}`;
    } finally {
      finishSourceRequest(key, version);
    }
  };
  const errors: string[] = [];
  if (options.ordered) {
    for (const entry of entries) {
      const error = await refreshEntry(entry);
      if (error) {
        errors.push(error);
        if (options.strict) break;
      }
    }
  } else {
    errors.push(...(await Promise.all(entries.map(refreshEntry))).filter(Boolean));
  }

  if (errors.length) {
    message.value = errors[0];
    messageClass.value = 'lc-error';
  }

  syncPageGridStates();

  if (errors.length && options.strict) throw new Error(errors[0]);
  return errors;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter(Boolean))];
}

async function refreshFormNodeOptions(
  blockId: string,
  options: { codes?: string[]; sourceKeys?: string[] } = {},
) {
  const block = findRuntimeBlock(blockId);
  if (!block || (block.kind !== 'form' && block.kind !== 'searchForm')) {
    throw new Error(`页面表单节点 "${blockId}" 不存在。`);
  }

  const configuredCodes = uniqueStrings(
    block.schema.fields.map((field) => field.optionsCode),
  );
  const configuredSourceKeys = uniqueStrings(
    block.schema.fields.map((field) => field.optionsSourceKey),
  );
  const codes = Array.isArray(options.codes)
    ? uniqueStrings(options.codes).filter((code) => configuredCodes.includes(code))
    : configuredCodes;
  const sourceKeys = Array.isArray(options.sourceKeys)
    ? uniqueStrings(options.sourceKeys).filter((key) => configuredSourceKeys.includes(key))
    : configuredSourceKeys;

  if (codes.length) {
    await lowCodeOptionSourceRegistry.refresh(codes, () => host.getServiceApi());
  }
  if (sourceKeys.length) {
    const errors = await refreshDataSources(sourceKeys);
    if (errors.length) throw new Error(errors[0]);
  }

  return { codes, sourceKeys };
}

function cloneScriptValue<T>(value: T, fallback: T): T {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === 'string' ? JSON.parse(serialized) as T : fallback;
  } catch {
    return fallback;
  }
}

function createScriptContextSource(): LowCodeContextSource {
  refreshGridChangeSets();
  return cloneScriptValue({
    page: {
      id: props.page.id,
      code: props.page.code,
      route: props.page.route,
      title: props.page.title,
      page_type: props.page.page_type,
      mode: props.page.page_type === 'edit'
        ? builtinPageFunctionMode.value
        : undefined,
      schema: props.page.schema,
    },
    data: resolvedData.value,
    forms: formModels.value,
    searches: searchFilters.value,
    grids: gridStates.value,
    apiNames: Array.isArray(props.page.schema.scriptPolicy?.apiNames)
      ? props.page.schema.scriptPolicy.apiNames
      : [],
    capabilities: Array.isArray(props.page.schema.scriptPolicy?.capabilities)
      ? [
          ...props.page.schema.scriptPolicy.capabilities,
          ...(hasSchemaPageFunctions()
            ? ['action.execute' as const]
            : []),
          ...(Object.keys(props.page.schema.apis ?? {}).length > 0
            ? ['http.execute' as const]
            : []),
          ...(hasRuntimePageFunctions()
            ? ['pageFunction.execute' as const]
            : []),
        ].filter((capability, index, capabilities) =>
          capabilities.indexOf(capability) === index,
        )
      : [
          ...(hasSchemaPageFunctions()
            ? ['action.execute' as const]
            : []),
          ...(Object.keys(props.page.schema.apis ?? {}).length > 0
            ? ['http.execute' as const]
            : []),
          ...(hasRuntimePageFunctions()
            ? ['pageFunction.execute' as const]
            : []),
        ],
  }, {});
}

function getChildBlocks(block: LowCodePageBlock): LowCodePageBlock[] {
  const children: LowCodePageBlock[] = [];

  if ('blocks' in block && Array.isArray(block.blocks)) {
    children.push(...validBlocks(block.blocks));
  }

  if (block.kind === 'tabs' && Array.isArray(block.tabs)) {
    children.push(...block.tabs.flatMap((tab) => validBlocks(tab?.blocks)));
  }

  if (isOverlayBlock(block) && Array.isArray(block.overlays)) {
    children.push(...validBlocks(block.overlays));
  }

  return children;
}

function flattenBlocks(blocks: LowCodePageBlock[]): LowCodePageBlock[] {
  return validBlocks(blocks).flatMap((block) => [block, ...flattenBlocks(getChildBlocks(block))]);
}

function flattenPageBlocks(schema: LowCodePageRecord['schema']) {
  return flattenBlocks([
    ...validBlocks(schema.blocks),
    ...validBlocks(schema.overlays),
  ]);
}

function initializePageGridStates(blocks: LowCodePageBlock[]) {
  const gridBlocks = blocks.filter(
    (block): block is LowCodePageGridBlock => block.kind === 'grid'
  );
  const gridIds = new Set(gridBlocks.map((block) => block.id));

  Object.keys(runtime.state.grids).forEach((blockId) => {
    if (!gridIds.has(blockId)) delete runtime.state.grids[blockId];
  });

  gridBlocks.forEach((block) => {
    const grid = runtime.ensureGrid(block.id, {
      sourceKey: block.sourceKey,
      rowKey: getGridRowKey(block),
    });
    if (!block.sourceKey && !runtime.isGridInitialized(block.id) && Array.isArray(block.rows)) {
      runtime.setGridRows(block.id, block.rows.filter(isRecord), {
        rowKey: getGridRowKey(block),
      });
    }
  });
}

function syncPageGridStates(schema: LowCodePageRecord['schema'] = props.page.schema) {
  const blocks = flattenPageBlocks(schema);
  initializePageGridStates(blocks);

  blocks.forEach((block) => {
    if (block.kind !== 'grid') return;
    if (!block.sourceKey && runtime.isGridInitialized(block.id)) return;
    runtime.setGridRows(
      block.id,
      resolveGridRows(block, resolvedData.value, searchFilters.value),
      {
        sourceKey: block.sourceKey,
        rowKey: getGridRowKey(block),
      }
    );
  });
}

function refreshGridChangeSets() {
  Object.keys(runtime.state.grids).forEach((blockId) => {
    runtime.getGridChanges(blockId);
  });
}

function captureGridInteractionState() {
  return Object.fromEntries(
    Object.entries(runtime.state.grids).map(([blockId, grid]) => [
      blockId,
      {
        currentRow: grid.currentRow,
        selectedRows: [...grid.selectedRows],
        contextRow: grid.contextRow,
        currentCell: grid.currentCell
          ? { row: grid.currentCell.row, field: grid.currentCell.field }
          : null,
      },
    ])
  );
}

function restoreGridInteractionState(
  states: ReturnType<typeof captureGridInteractionState>
) {
  Object.entries(states).forEach(([blockId, state]) => {
    if (!runtime.state.grids[blockId]) return;
    runtime.setGridCurrentRow(blockId, state.currentRow);
    runtime.setGridSelectedRows(blockId, state.selectedRows);
    runtime.setGridContextRow(blockId, state.contextRow);
    runtime.setGridCurrentCell(blockId, state.currentCell);
  });
}

function getFormBlockTarget(block: LowCodePageGridBlock) {
  const blocks = flattenPageBlocks(props.page.schema);

  if (block.editorBlockId) {
    const target = blocks.find(
      (pageBlock) => pageBlock.kind === 'form' && pageBlock.id === block.editorBlockId
    );

    if (target && target.kind === 'form') {
      return target;
    }
  }

  return blocks.find(
    (pageBlock): pageBlock is LowCodePageFormBlock => pageBlock.kind === 'form'
  );
}

function findRuntimeBlock(blockId: string) {
  return flattenPageBlocks(props.page.schema).find((block) => block.id === blockId);
}

function searchTargetSourceKeys(block: LowCodePageSearchFormBlock) {
  return [...new Set([
    block.targetSourceKey,
    ...(Array.isArray(block.targetSourceKeys) ? block.targetSourceKeys : []),
  ].map((key) => readString(key)).filter(Boolean))];
}

async function persistRuntimeBlockUpdate(update: LowCodeRuntimeBlockUpdate) {
  const nextSchema = cloneRuntimeValueWithFunctions(props.page.schema);
  if (isRecord(props.page.schema.visualEditor)) {
    nextSchema.visualEditor = cloneRuntimeValueWithFunctions(props.page.schema.visualEditor);
  }
  const targetBlock = flattenPageBlocks(nextSchema).find(
    (block) => block.id === update.blockId
  );

  if (!targetBlock) {
    throw new Error(`未找到页面区块 ${update.blockId}`);
  }

  Object.assign(targetBlock, cloneRuntimeValue(update.changes));

  if (update.dataSources) {
    nextSchema.dataSources = {
      ...(nextSchema.dataSources ?? {}),
      ...cloneRuntimeValue(update.dataSources),
    };
  }

  if (isRecord(nextSchema.visualEditor)) {
    const visualPages = isRecord(nextSchema.visualEditor.pages)
      ? nextSchema.visualEditor.pages
      : {};

    Object.values(visualPages).forEach((visualPage) => {
      if (!isRecord(visualPage)) return;
      updateVisualButtonGroupBlocks(visualPage.blocks, targetBlock, update);
      updateVisualButtonGroupBlocks(visualPage.overlays, targetBlock, update);
    });
  }

  const nextVersion = (props.page.version ?? 0) + 1;
  const publishedAt = (nextSchema.status ?? props.page.status) === 'published'
    ? new Date().toISOString()
    : props.page.published_at;

  try {
    const saved = await host.getServiceApi().invoke<LowCodePageRecord>(
      'lowcode',
      'saveItem',
      {
        resource: 'lowcode_pages',
        id: props.page.id,
        data: {
          schema: nextSchema,
          version: nextVersion,
          published_at: publishedAt,
        },
      }
    );

    const reloadSuppression = {
      pageId: readString(saved.id, props.page.id),
      version: Number(saved.version ?? nextVersion),
      fullPath: readString(props.route?.fullPath ?? host.getRoute().fullPath),
    };
    runtimeBlockReloadSuppression = reloadSuppression;
    Object.assign(props.page, saved);
    Object.assign(props.page.schema, cloneRuntimeValue(update.changes.schema ? nextSchema : saved.schema));
    void nextTick(() => {
      if (runtimeBlockReloadSuppression === reloadSuppression) {
        runtimeBlockReloadSuppression = undefined;
      }
    });
    const renderedBlockId = readString(update.changes.id, update.blockId);
    let renderedBlock = flattenPageBlocks(props.page.schema).find(
      (block) => block.id === renderedBlockId,
    );
    if (renderedBlock) {
      Object.assign(renderedBlock, cloneRuntimeValue(update.changes));
    } else {
      const savedSchema = isRecord(saved.schema) ? saved.schema : nextSchema;
      renderedBlock = flattenPageBlocks(savedSchema).find(
        (block) => block.id === renderedBlockId,
      );
    }
    runtimeBlockRenderRevision.value += 1;
    message.value = targetBlock.kind === 'form' || targetBlock.kind === 'searchForm'
      ? '表单配置已保存。'
      : targetBlock.kind === 'grid'
        ? '表格配置已保存。'
        : '按钮配置已保存。';
    messageClass.value = 'lc-help';

    return renderedBlock ?? targetBlock;
  } catch (error) {
    message.value = error instanceof Error ? error.message : '页面配置保存失败。';
    messageClass.value = 'lc-error';
    throw error;
  }
}

function updateVisualButtonGroupBlocks(
  value: unknown,
  targetBlock: LowCodePageBlock,
  update: LowCodeRuntimeBlockUpdate
) {
  if (!Array.isArray(value)) return;

  value.forEach((candidate) => {
    if (!isRecord(candidate)) return;

    const visualProps = isRecord(candidate.props) ? candidate.props : {};
    if (candidate.componentKey === 'lowcode-button-group' && visualProps.blockId === update.blockId) {
      const changes = update.changes;
      const actions = Array.isArray(changes.actions) ? changes.actions : [];
      visualProps.blockId = changes.id ?? visualProps.blockId;
      visualProps.title = changes.title ?? '';
      visualProps.description = changes.description ?? '';
      visualProps.align = changes.align ?? 'left';
      visualProps.gap = changes.gap ?? 8;
      visualProps.buttons = actions.map(runtimeButtonToVisualButton);
      candidate.props = visualProps;
    }

    if (
      (targetBlock.kind === 'form' || targetBlock.kind === 'searchForm') &&
      visualProps.blockId === update.blockId &&
      ['form', 'lowcode-edit-form', 'lowcode-search-form'].includes(String(candidate.componentKey))
    ) {
      const schema = isRecord(update.changes.schema) ? update.changes.schema : {};
      const fields = Array.isArray(schema.fields) ? schema.fields : [];
      visualProps.fields = fields.map(runtimeFormFieldToVisualField);
      visualProps.initialValuesJson = JSON.stringify(
        isRecord(update.changes.initialValues)
          ? update.changes.initialValues
          : targetBlock.initialValues ?? {},
      );
      visualProps.formDesignerModel = cloneRuntimeValue(
        'formDesignerModel' in update.changes
          ? update.changes.formDesignerModel
          : null,
      );
      visualProps.formDesignerUpdatedAt = update.changes.formDesignerUpdatedAt ?? Date.now();
      candidate.props = visualProps;
    }

    if (
      targetBlock.kind === 'grid' &&
      visualProps.blockId === update.blockId &&
      candidate.componentKey === 'lowcode-grid'
    ) {
      syncRuntimeGridToVisualProps(visualProps, targetBlock, update);
      candidate.props = visualProps;
    }

    const slots = isRecord(visualProps.slots) ? visualProps.slots : {};
    Object.values(slots).forEach((slot) => {
      if (isRecord(slot)) updateVisualButtonGroupBlocks(slot.children, targetBlock, update);
    });
    updateVisualButtonGroupBlocks(visualProps.overlays, targetBlock, update);
  });
}

const visualGridOptionKeys = [
  'border',
  'stripe',
  'showOverflow',
  'showHeaderOverflow',
  'showFooterOverflow',
  'height',
  'minHeight',
  'maxHeight',
  'mobileDisplay',
  'rowHeight',
  'headerHeight',
  'overscanRowCount',
  'overscanColumnCount',
  'size',
  'loading',
  'round',
  'showHeader',
  'showFooter',
  'autoResize',
  'syncResize',
  'rowConfig',
  'columnConfig',
  'sortConfig',
  'filterConfig',
  'pagerConfig',
  'toolbarConfig',
  'proxyConfig',
  'editConfig',
  'checkboxConfig',
  'radioConfig',
  'treeConfig',
  'expandConfig',
];

function isRuntimeGridActionColumn(value: unknown) {
  if (!isRecord(value)) return false;
  return isRecord(value.slots) && value.slots.default === 'actions';
}

function runtimeGridEventsToVisualRows(
  events: unknown,
  eventNames: unknown
) {
  const eventRecord = isRecord(events) ? events : {};
  const eventNameRecord = isRecord(eventNames) ? eventNames : {};
  const keys = Array.from(new Set([
    ...Object.keys(eventRecord),
    ...Object.keys(eventNameRecord),
  ]));

  return keys.map((key) => ({
    key,
    enabled: true,
    eventName: readString(eventNameRecord[key]),
    directivesJson: JSON.stringify(
      Array.isArray(eventRecord[key]) ? eventRecord[key] : []
    ),
  }));
}

function syncRuntimeGridToVisualProps(
  visualProps: Record<string, unknown>,
  targetBlock: LowCodePageGridBlock,
  update: LowCodeRuntimeBlockUpdate
) {
  const schema = isRecord(update.changes.schema)
    ? update.changes.schema
    : targetBlock.schema;
  const grid = isRecord(schema.grid) ? schema.grid : {};
  const columns = Array.isArray(grid.columns) ? grid.columns : [];
  const sourceKey = readString(update.changes.sourceKey, targetBlock.sourceKey ?? 'records');
  const source = update.dataSources?.[sourceKey] ?? props.page.schema.dataSources?.[sourceKey];
  const rowActions = isRecord(schema.rowActions) ? schema.rowActions : {};

  visualGridOptionKeys.forEach((key) => delete visualProps[key]);
  Object.entries(grid).forEach(([key, value]) => {
    if (key !== 'columns') visualProps[key] = cloneRuntimeValue(value);
  });

  visualProps.blockId = update.changes.id ?? visualProps.blockId;
  visualProps.title = update.changes.title ?? schema.title ?? '';
  const requestedTableType = readString(
    update.changes.tableType,
    readString(targetBlock.tableType, 'default'),
  );
  const tableType = requestedTableType === 'normal'
    ? 'default'
    : requestedTableType === 'main' || requestedTableType === 'detail'
      ? requestedTableType
      : 'default';
  const sourceType = readString(
    update.changes.sourceType,
    readString(targetBlock.sourceType, readString(source?.sourceType, 'custom')),
  );
  const sourceTarget = readString(source?.tableName ?? source?.table_name);
  visualProps.tableType = tableType;
  visualProps.sourceType = sourceType;
  visualProps.tableName = sourceType === 'view'
    ? ''
    : readString(
        update.changes.tableName,
        readString(targetBlock.tableName, sourceType === 'table' ? sourceTarget : ''),
      );
  visualProps.viewName = sourceType === 'view'
    ? readString(
        update.changes.viewName,
        readString(targetBlock.viewName, readString(source?.viewName, sourceTarget)),
      )
    : '';
  visualProps.sourceKey = sourceKey;
  visualProps.serviceName = source?.serviceName ?? '';
  visualProps.serviceMethod = source?.serviceMethod ?? '';
  visualProps.saveMethod = source?.saveMethod ?? '';
  visualProps.deleteMethod = source?.deleteMethod ?? '';
  visualProps.postDataJson = JSON.stringify(source?.postData ?? {}, null, 2);
  visualProps.showRowActions = Boolean(
    rowActions.edit === true ||
      rowActions.delete === true ||
      (Array.isArray(rowActions.actions) && rowActions.actions.length) ||
      columns.some(isRuntimeGridActionColumn)
  );
  visualProps.columns = cloneRuntimeValue(
    columns.filter((column) => !isRuntimeGridActionColumn(column))
  );
  visualProps.gridEvents = runtimeGridEventsToVisualRows(
    schema.events,
    schema.eventNames
  );
  visualProps.gridDesignerUpdatedAt = update.changes.gridDesignerUpdatedAt ?? Date.now();
}

function runtimeFormFieldToVisualField(value: unknown): Record<string, unknown> {
  const field = isRecord(value) ? value : {};
  const props = isRecord(field.props) ? cloneRuntimeValue(field.props) : {};
  const rules = Array.isArray(field.rules) ? field.rules.filter(isRecord) : [];
  const optionProps = isRecord(field.optionProps) ? field.optionProps : {};

  return {
    field: readString(field.field),
    label: readString(field.label),
    component: readString(field.component, 'vxe-input'),
    placeholder: readString(props.placeholder),
    required: rules.some((rule) => rule.required === true),
    defaultValueType: readString(field.defaultValueType),
    defaultValueScript: readString(field.defaultValueScript),
    defaultValueProcedure: readString(field.defaultValueProcedure),
    updateScript: readString(field.updateScript),
    validationScript: readString(field.validationScript),
    validationMessage: readString(field.validationMessage),
    span: field.span ?? '',
    help: readString(field.help),
    optionsCode: readString(field.optionsCode),
    optionsSourceKey: readString(field.optionsSourceKey),
    optionLabel: readString(optionProps.label),
    optionValue: readString(optionProps.value),
    optionChildren: readString(optionProps.children),
    optionsJson: JSON.stringify(Array.isArray(field.options) ? field.options : []),
    propsJson: JSON.stringify(props),
    ...(Object.keys(props).length ? { props } : {}),
  };
}

function runtimeButtonToVisualButton(value: unknown): Record<string, unknown> {
  const action = isRecord(value) ? value : {};
  const { children, directives, ...button } = action;

  return {
    ...cloneRuntimeValue(button),
    directivesJson: JSON.stringify(Array.isArray(directives) ? directives : []),
    children: Array.isArray(children)
      ? children.map(runtimeButtonToVisualButton)
      : [],
  };
}

function deriveStaticFormModel(
  block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
  row?: Record<string, unknown>
) {
  return mergeFormModelValues(block.initialValues ?? {}, row ?? {});
}

function hasPersistedFormRecord(row?: Record<string, unknown>) {
  if (!row) return false;
  const recordId = row.id;
  return recordId !== undefined && recordId !== null && String(recordId).trim() !== '';
}

async function resolveFormDynamicDefaults(
  block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
  model: Record<string, unknown>,
  options: { skipAllocatingDefaults?: boolean } = {},
) {
  const nextModel = cloneRuntimeValue(model);
  for (const field of block.schema.fields) {
    if (field.field in nextModel) continue;

    const defaultValueType = readString(field.defaultValueType);
    const defaultValueScript = readString(field.defaultValueScript);
    const defaultValueProcedure = readString(field.defaultValueProcedure);
    if (
      options.skipAllocatingDefaults &&
      defaultValueType === 'procedure' &&
      defaultValueProcedure === 'public.generate_document_number'
    ) continue;
    if (
      (defaultValueType !== 'function' || !defaultValueScript) &&
      (defaultValueType !== 'procedure' || !defaultValueProcedure)
    ) continue;

    const event: LowCodeRuntimeEvent = {
      name: 'form.fieldDefaultValue',
      blockId: block.id,
      blockKind: block.kind,
      timestamp: Date.now(),
      payload: {
        field: field.field,
        values: cloneRuntimeValue(nextModel),
      },
    };
    try {
      const value = defaultValueType === 'procedure'
        ? await host.getServiceApi().invoke('lowcode', 'executeDefaultValueProcedure', {
            procedure: defaultValueProcedure,
            blockId: block.id,
            field: field.field,
            values: cloneRuntimeValue(nextModel),
          })
        : (await executeIsolatedScript(defaultValueScript, event, 'function')).value;
      if (typeof value !== 'undefined') nextModel[field.field] = cloneRuntimeValue(value);
    } catch (error) {
      reportRuntimeDirectiveError(error);
    }
  }
  return nextModel;
}

async function deriveFormModel(
  block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
  row?: Record<string, unknown>,
) {
  return resolveFormDynamicDefaults(
    block,
    deriveStaticFormModel(block, row),
    {
      skipAllocatingDefaults:
        hasPersistedFormRecord(row) ||
        (props.page.page_type === 'edit' && builtinPageFunctionMode.value !== 'add'),
    },
  );
}

async function deriveNewFormModel(
  block: LowCodePageFormBlock,
  mode: 'create' | 'copy',
  current: Record<string, unknown>,
) {
  const primaryKeys = new Set(['id', 'created_at', 'created_by', 'updated_at', 'updated_by']);
  const stateFields: Record<string, unknown> = {
    status: 'draft',
  };
  const values = mode === 'copy'
    ? cloneRuntimeValue(current)
    : cloneRuntimeValue(block.initialValues ?? {});

  primaryKeys.forEach((field) => {
    if (field === 'id') values[field] = '';
    else delete values[field];
  });
  Object.entries(stateFields).forEach(([field, value]) => {
    if (field in values || field in current) values[field] = value;
  });
  for (const field of block.schema.fields) {
    if (field.defaultValueType === 'function' || field.defaultValueType === 'procedure') {
      delete values[field.field];
    }
  }

  return resolveFormDynamicDefaults(block, values);
}

async function resolveGridDynamicDefaults(block: LowCodePageGridBlock) {
  const columns = block.schema.grid.columns ?? [];
  const dynamicColumns = columns.filter((column) => {
    const params = isRecord(column.params) ? column.params : {};
    const field = isRecord(params.lowcodeField) ? params.lowcodeField : {};
    const type = readString(field.defaultValueType);
    return Boolean(
      column.field &&
      (type === 'function' || type === 'procedure') &&
      (readString(field.defaultValueScript) || readString(field.defaultValueProcedure))
    );
  });
  if (!dynamicColumns.length) return;

  for (const column of dynamicColumns) {
    const params = isRecord(column.params) ? column.params : {};
    const field = isRecord(params.lowcodeField) ? params.lowcodeField : {};
    const defaultValueType = readString(field.defaultValueType);
    const defaultValueScript = readString(field.defaultValueScript);
    const defaultValueProcedure = readString(field.defaultValueProcedure);
    const event: LowCodeRuntimeEvent = {
      name: 'grid.fieldDefaultValue',
      blockId: block.id,
      blockKind: block.kind,
      timestamp: Date.now(),
      payload: {
        field: column.field,
        values: {},
      },
    };

    try {
      const value = defaultValueType === 'procedure'
        ? await host.getServiceApi().invoke('lowcode', 'executeDefaultValueProcedure', {
            procedure: defaultValueProcedure,
            blockId: block.id,
            field: column.field,
            values: {},
          })
        : (await executeIsolatedScript(defaultValueScript, event, 'function')).value;
      const editRender = isRecord(column.editRender) ? column.editRender : {};
      if (typeof value === 'undefined') delete editRender.defaultValue;
      else editRender.defaultValue = cloneRuntimeValue(value);
      column.editRender = editRender;
    } catch (error) {
      reportRuntimeDirectiveError(error);
    }
  }
}

function mergeFormModelValues(
  defaults: Record<string, unknown>,
  values: Record<string, unknown>
) {
  const nextModel = cloneRuntimeValue(defaults);

  for (const [key, value] of Object.entries(values)) {
    const defaultValue = nextModel[key];
    nextModel[key] = isRecord(defaultValue) && isRecord(value)
      ? mergeFormModelValues(defaultValue, value)
      : cloneRuntimeValue(value);
  }

  return nextModel;
}

function runtimeValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every(
      (item, index) => runtimeValuesEqual(item, right[index])
    );
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every(
      (key) => key in right && runtimeValuesEqual(left[key], right[key])
    );
  }

  return false;
}

function mergeChangedFormValue(
  target: unknown,
  baseline: unknown,
  current: unknown
): { changed: boolean; value: unknown } {
  if (runtimeValuesEqual(baseline, current)) {
    return { changed: false, value: target };
  }

  if (isRecord(baseline) && isRecord(current)) {
    const value = isRecord(target) ? cloneRuntimeValue(target) : {};
    let changed = false;

    for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)])) {
      if (!(key in current)) {
        delete value[key];
        changed = true;
        continue;
      }

      const merged = mergeChangedFormValue(value[key], baseline[key], current[key]);
      if (!merged.changed) continue;
      value[key] = merged.value;
      changed = true;
    }

    return { changed, value };
  }

  return { changed: true, value: cloneRuntimeValue(current) };
}

function captureFormBaselines() {
  Object.keys(formBaselines).forEach((blockId) => delete formBaselines[blockId]);
  Object.entries(formModels.value).forEach(([blockId, values]) => {
    formBaselines[blockId] = cloneRuntimeValue(values);
  });
}

function readDataSourceRecord(sourceKey: string) {
  const sourceValue = resolvedData.value[sourceKey];
  if (Array.isArray(sourceValue)) return isRecord(sourceValue[0]) ? sourceValue[0] : undefined;
  if (isRecord(sourceValue) && Array.isArray(sourceValue.rows)) {
    return isRecord(sourceValue.rows[0]) ? sourceValue.rows[0] : undefined;
  }
  return isRecord(sourceValue) ? sourceValue : undefined;
}

function collectFormSubmissionGroups() {
  const groups = new Map<string, LowCodePageFormBlock[]>();

  for (const block of flattenPageBlocks(props.page.schema)) {
    if (block.kind !== 'form') continue;
    const sourceKey = block.submitSourceKey ?? block.sourceKey;
    if (!sourceKey || !getDataSource(sourceKey)?.saveMethod) continue;
    groups.set(sourceKey, [...(groups.get(sourceKey) ?? []), block]);
  }

  return groups;
}

function buildFormSubmissionValues(
  sourceKey: string,
  blocks: LowCodePageFormBlock[]
) {
  const isCreating =
    props.page.page_type === 'edit' && builtinPageFunctionMode.value === 'add';
  if (isCreating) {
    return blocks.reduce<Record<string, unknown>>((values, block) => ({
      ...values,
      ...cloneRuntimeValue(formModels.value[block.id] ?? block.initialValues ?? {}),
    }), {});
  }

  const sourceRecord = readDataSourceRecord(sourceKey);
  const values = sourceRecord ? cloneRuntimeValue(sourceRecord) : {};

  for (const block of blocks) {
    const current = formModels.value[block.id] ?? {};
    const baseline = formBaselines[block.id] ?? {};

    for (const field of block.schema.fields) {
      const fieldName = readString(field.field);
      if (!fieldName || fieldName in values) continue;
      if (fieldName in baseline) values[fieldName] = cloneRuntimeValue(baseline[fieldName]);
      else if (fieldName in current) values[fieldName] = cloneRuntimeValue(current[fieldName]);
    }
  }

  for (const block of blocks) {
    const current = formModels.value[block.id] ?? {};
    const baseline = formBaselines[block.id] ?? {};

    for (const field of block.schema.fields) {
      const fieldName = readString(field.field);
      if (!fieldName || !(fieldName in current)) continue;
      const merged = mergeChangedFormValue(
        values[fieldName],
        baseline[fieldName],
        current[fieldName]
      );
      if (merged.changed) values[fieldName] = merged.value;
    }
  }

  return values;
}

async function saveFormSource(
  sourceKey: string,
  values: Record<string, unknown>
) {
  const source = getDataSource(sourceKey);
  if (!source) throw new Error(`Data source ${sourceKey} is unavailable.`);

  const request = resolveDataSourceRequest(source.key, source);
  const serviceName = request.serviceName;
  const serviceMethod = source.saveMethod ?? request.serviceMethod;

  if (!serviceName || !serviceMethod || (!source.saveMethod && isListItemsRequest(serviceName, serviceMethod))) {
    throw new Error(`Data source ${source.key} is missing save service.`);
  }

  return host.getServiceApi().invoke(serviceName, serviceMethod, {
    ...(source.postData ?? {}),
    ...values,
  });
}

function readSavedRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    if (isRecord(value.data)) return value.data;
    if (Array.isArray(value.rows) && isRecord(value.rows[0])) return value.rows[0];
    if (Array.isArray(value.items) && isRecord(value.items[0])) return value.items[0];
    if (isRecord(value.saved)) return value.saved;
    return value;
  }
  if (Array.isArray(value) && isRecord(value[0])) return value[0];
  return undefined;
}

function readRouteQueryWithoutRecordId() {
  const query = host.getRoute().query ?? {};
  return Object.fromEntries(
    Object.entries(query).filter(([key]) => key !== 'id'),
  );
}

function readSavedRecordId(
  saved: Record<string, unknown> | undefined,
  groups: Map<string, LowCodePageFormBlock[]>,
) {
  const savedId = readString(saved?.id);
  if (savedId) return savedId;

  for (const [sourceKey, blocks] of groups) {
    const values = buildFormSubmissionValues(sourceKey, blocks);
    const id = readString(values.id);
    if (id) return id;
  }
  return '';
}

async function submitForms(options: { reload?: boolean } = {}) {
  const groups = collectFormSubmissionGroups();
  if (!groups.size) return true;

  message.value = '';
  lastSavedFormRecord = undefined;

  try {
    for (const [sourceKey, blocks] of groups) {
      loadingBlockId.value = blocks[0]?.id ?? '';
      const saved = await saveFormSource(
        sourceKey,
        buildFormSubmissionValues(sourceKey, blocks),
      );
      if (!lastSavedFormRecord) lastSavedFormRecord = readSavedRecord(saved);
    }

    if (options.reload !== false) {
      await loadPageData(props.page);
    }
    await publishRuntimeEvent({
      name: 'form.saved',
      blockKind: 'form',
      timestamp: Date.now(),
      payload: {
        sourceKeys: Array.from(groups.keys()),
      },
    });
    message.value = host.t('runtime.form.saved');
    messageClass.value = 'lc-help';
    return true;
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : host.t('runtime.form.submitFailed');
    messageClass.value = 'lc-error';
    return false;
  } finally {
    loadingBlockId.value = '';
  }
}

function collectSharedFormDefaults(blocks: LowCodePageBlock[]) {
  const defaultsBySource: Record<string, Record<string, unknown>> = {};

  for (const block of blocks) {
    if (block.kind !== 'form') continue;
    const sourceKey = block.sourceKey ?? block.submitSourceKey;
    if (!sourceKey) continue;

    defaultsBySource[sourceKey] = mergeFormModelValues(
      defaultsBySource[sourceKey] ?? {},
      block.initialValues ?? {}
    );
  }

  return defaultsBySource;
}

function hydrateSourceBoundForms(
  blocks: LowCodePageBlock[],
  sources: Record<string, LowCodePageDataSource>,
  loadedSourceKeys: ReadonlySet<string>
) {
  for (const block of blocks) {
    if (block.kind !== 'form') continue;

    const sourceKey = block.sourceKey ?? block.submitSourceKey;
    if (!sourceKey || !loadedSourceKeys.has(sourceKey)) continue;
    const source = sourceKey ? sources[sourceKey] : undefined;
    const sourceValue = source ? resolvedData.value[source.key] : undefined;
    const sourceRecord = Array.isArray(sourceValue) ? sourceValue[0] : sourceValue;

    if (isRecord(sourceRecord)) {
      runtime.replaceForm(block.id, mergeFormModelValues(
        formModels.value[block.id] ?? {},
        sourceRecord
      ));
    }
  }
}

async function loadDataSourceEntry(
  key: string,
  source: LowCodePageDataSource,
  pageBlocks: LowCodePageBlock[]
) {
  const nodeAction = resolveLowCodeDataSourceNodeAction(pageBlocks, key);
  if (nodeAction) {
    if (source.autoLoad === false) return '';
    return executeScriptNodeAction({
      node: nodeAction.block.id,
      method: nodeAction.action.method,
    })
      .then(() => '')
      .catch((error: unknown) =>
        `${key}: ${error instanceof Error ? error.message : host.t('runtime.errors.loadDataSource')}`
      );
  }

  const version = beginSourceRequest(key);
  return invokeDataSource(key, source)
    .then(([resolvedKey, value]) => {
      if (!isCurrentSourceRequest(key, version)) return '';
      if (typeof value !== 'undefined') {
        runtime.setSource(resolvedKey, value, { resetGridBaseline: true });
      }
      return '';
    })
    .catch((error: unknown) => {
      if (!isCurrentSourceRequest(key, version)) return '';
      return `${key}: ${error instanceof Error ? error.message : host.t('runtime.errors.loadDataSource')}`;
    })
    .finally(() => finishSourceRequest(key, version));
}

async function loadDataSourceWaves(
  entries: Array<[string, LowCodePageDataSource]>,
  pageBlocks: LowCodePageBlock[],
  sources: Record<string, LowCodePageDataSource>
) {
  const pending = new Map(entries);
  const errors: string[] = [];

  while (pending.size) {
    const ready = [...pending.entries()].filter(([, source]) =>
      (source.loadAfterSourceKeys ?? []).every((dependencyKey) => !pending.has(dependencyKey))
    );
    if (!ready.length) {
      errors.push(`Data source dependency cycle: ${[...pending.keys()].join(', ')}`);
      break;
    }

    ready.forEach(([key]) => pending.delete(key));
    errors.push(...(await Promise.all(
      ready.map(([key, source]) => loadDataSourceEntry(key, source, pageBlocks))
    )).filter(Boolean));
    hydrateSourceBoundForms(pageBlocks, sources, new Set(ready.map(([key]) => key)));
  }

  return errors;
}

async function loadPageData(nextPage: LowCodePageRecord) {
  const sources = nextPage.schema.dataSources ?? {};
  const entries = Object.entries(sources);
  const pageBlocks = flattenPageBlocks(nextPage.schema);
  const sharedFormDefaults = collectSharedFormDefaults(pageBlocks);
  const preserveGrids = runtimePageId === nextPage.id;
  const gridInteractionState = preserveGrids ? captureGridInteractionState() : {};

  if (!preserveGrids) {
    builtinPageFunctionMode.value = resolveLowCodeEditPageMode(
      host.getRoute().query?.id,
    );
  }

  invalidateSourceRequests();
  runtime.resetData({ preserveGrids, preserveLocalGridRows: preserveGrids });
  runtimePageId = nextPage.id;
  initializePageGridStates(pageBlocks);

  for (const block of pageBlocks) {
    if (block.kind === 'grid') {
      await resolveGridDynamicDefaults(block);
    } else if (block.kind === 'form') {
      const sourceKey = block.sourceKey ?? block.submitSourceKey;
      runtime.replaceForm(block.id, await deriveFormModel(
        block,
        sourceKey ? sharedFormDefaults[sourceKey] : undefined
      ));
    } else if (block.kind === 'searchForm') {
      runtime.replaceForm(block.id, await deriveFormModel(block));
    }
  }

  if (!entries.length) {
    syncPageGridStates(nextPage.schema);
    restoreGridInteractionState(gridInteractionState);
    captureFormBaselines();
    return [];
  }

  const errors = await loadDataSourceWaves(entries, pageBlocks, sources);

  syncPageGridStates(nextPage.schema);
  restoreGridInteractionState(gridInteractionState);
  captureFormBaselines();

  return errors;
}

const loadingText = computed(() =>
  dataLoading.value ? host.t('runtime.loadingDataSources') : ''
);

watch(
  [() => props.page.id, () => props.page.version, () => props.route?.fullPath ?? host.getRoute().fullPath],
  async ([nextPage, nextVersion, nextFullPath]) => {
    if (
      runtimeBlockReloadSuppression?.pageId === nextPage &&
      runtimeBlockReloadSuppression.version === nextVersion &&
      runtimeBlockReloadSuppression.fullPath === readString(nextFullPath)
    ) {
      runtimeBlockReloadSuppression = undefined;
      return;
    }

    const currentLoad = ++loadSequence;
    message.value = '';
    dataLoading.value = true;

    try {
      const errors = await loadPageData(props.page);

      if (currentLoad !== loadSequence) {
        return;
      }

      if (errors.length) {
        message.value = errors[0];
        messageClass.value = 'lc-error';
      }
    } catch (error) {
      if (currentLoad !== loadSequence) {
        return;
      }

      message.value =
        error instanceof Error ? error.message : host.t('runtime.errors.loadPage');
      messageClass.value = 'lc-error';
    } finally {
      if (currentLoad === loadSequence) {
        dataLoading.value = false;
      }
    }
  },
  { immediate: true }
);

watch(
  () => flattenPageBlocks(props.page.schema)
    .filter((block): block is LowCodePageGridBlock => block.kind === 'grid')
    .map((block) => [block.id, block.sourceKey ?? '', getGridRowKey(block)]),
  () => syncPageGridStates(),
  { deep: true },
);

const unsubscribeRuntimeEvents = runtimeEventBus.subscribe(handlePublishedRuntimeEvent);
onBeforeUnmount(unsubscribeRuntimeEvents);

async function publishRuntimeEvent(event: LowCodeRuntimeEvent) {
  const action = isRecord(event.payload?.action) ? event.payload.action : undefined;
  const actionEvent = Boolean(action || readString(event.payload?.actionCode));
  if (actionEvent && runtime.state.status.mesCommandExecuting) {
    message.value = '当前操作仍在处理中，请稍候。';
    messageClass.value = 'lc-help';
    return;
  }
  const execution = publishRuntimeEventNow(event);
  if (action) pendingActionEvents.set(action, execution);

  try {
    await execution;
  } finally {
    if (action && pendingActionEvents.get(action) === execution) {
      pendingActionEvents.delete(action);
    }
  }
}

async function publishRuntimeEventNow(event: LowCodeRuntimeEvent) {
  try {
    await runtimeEventBus.publish(event);
    await props.onRuntimeEvent?.(event);
  } catch (error) {
    reportRuntimeDirectiveError(error);
    throw error;
  }
}

async function waitForActionEvent(action?: LowCodeAction | LowCodeButtonGroupAction) {
  if (!action) return;
  await pendingActionEvents.get(action as object);
}

async function handlePublishedRuntimeEvent(event: LowCodeRuntimeEvent) {
  if (isRuntimeEditPageModifyEvent(event)) {
    const modeChanged = builtinPageFunctionMode.value !== 'edit';
    builtinPageFunctionMode.value = 'edit';
    if (modeChanged) {
      await publishRuntimeEvent({
        name: 'page.modeChange',
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: { mode: 'edit' },
      });
    }
    return;
  }

  if (isBlockedEditPageSaveEvent(event)) return;

  let eventSucceeded = true;
  const directives = resolveEventDirectives(event, props.page.schema.eventHandlers);
  const executionContext: RuntimeDirectiveExecutionContext = {
    mesCommandStarted: false,
    mesCommandCompleted: false,
    mesCommandRefreshCompleted: false,
    mesCommandRefreshFailed: false,
  };

  try {
    for (const directive of directives) {
      try {
        await executeRuntimeDirective(directive, event, executionContext);
      } catch (error) {
        eventSucceeded = false;
        reportRuntimeDirectiveError(error);
        if (event.payload?.action === 'confirm') throw error;
        break;
      }
    }

    const eventAction = isRecord(event.payload?.action) ? event.payload.action : undefined;
    const actionScript = readString(event.payload?.script ?? eventAction?.script);
    if (actionScript) {
      try {
        const result = await executeButtonScript(actionScript, event);
        if (result === false) eventSucceeded = false;
      } catch (error) {
        eventSucceeded = false;
        reportRuntimeDirectiveError(error);
      }
    }

    if (
      eventSucceeded &&
      (directives.length > 0 || Boolean(actionScript)) &&
      isSuccessfulEditPageSaveEvent(event)
    ) {
      await enterScanModeAfterSave(event);
    }
  } finally {
    if (executionContext.mesCommandStarted) {
      runtime.state.status.mesCommandExecuting = false;
      runtime.state.status.mesCommandActionKey = '';
    }
  }
}

function isBlockedEditPageSaveEvent(event: LowCodeRuntimeEvent) {
  return props.page.page_type === 'edit' &&
    isLowCodeEditPageReadonly(builtinPageFunctionMode.value) &&
    isSuccessfulEditPageSaveEvent(event);
}

function isRuntimeEditPageModifyEvent(event: LowCodeRuntimeEvent) {
  if (props.page.page_type !== 'edit') return false;
  const action = isRecord(event.payload?.action) ? event.payload.action : {};
  return isLowCodeEditPageModifyAction({
    code: readString(event.payload?.actionCode ?? action.code),
  });
}

function isSuccessfulEditPageSaveEvent(event: LowCodeRuntimeEvent) {
  if (props.page.page_type !== 'edit') return false;
  const action = isRecord(event.payload?.action) ? event.payload.action : {};
  return isLowCodeEditPageSaveAction({
    code: readString(event.payload?.actionCode ?? action.code),
  });
}

async function enterScanModeAfterSave(event: LowCodeRuntimeEvent) {
  const modeChanged = builtinPageFunctionMode.value !== 'scan';
  builtinPageFunctionMode.value = 'scan';
  captureFormBaselines();
  if (!modeChanged) return;

  await publishRuntimeEvent({
    name: 'page.modeChange',
    blockId: event.blockId,
    blockKind: event.blockKind,
    timestamp: Date.now(),
    payload: { mode: 'scan' },
  });
}

function readScriptStringArg(args: unknown[], index: number, label: string) {
  const value = readString(args[index]);
  if (!value) throw new Error(`脚本 API 参数 ${label} 不能为空。`);
  return value;
}

function readScriptRecordArg(args: unknown[], index: number) {
  return isRecord(args[index]) ? cloneRuntimeValue(args[index]) : {};
}

function readScriptRowsArg(args: unknown[], index: number) {
  return Array.isArray(args[index])
    ? args[index].filter(isRecord).map((row) => cloneRuntimeValue(row))
    : [];
}

function readScriptOptionsArg(args: unknown[], label: string) {
  if (!isRecord(args[0])) throw new Error(`${label} 参数必须是对象。`);
  return cloneRuntimeValue(args[0]);
}

function findNestedRuntimeBlock(block: LowCodePageBlock, blockId: string) {
  return flattenBlocks(getChildBlocks(block)).find((child) => child.id === blockId);
}

function createNodeDialogConfig(
  block: LowCodePageOverlayBlock,
  options: Record<string, unknown>,
): GlobalDialogConfig {
  const resultNodeId = readString(options.resultNode ?? block.resultNode);
  const resultNode = resultNodeId
    ? findNestedRuntimeBlock(block, resultNodeId)
    : flattenBlocks(getChildBlocks(block)).find(
        (child): child is LowCodePageFormBlock => child.kind === 'form',
      );
  if (!resultNode || resultNode.kind !== 'form') {
    throw new Error(`弹框 "${block.id}" 未配置结果表单。`);
  }

  const suppliedData = isRecord(options.data) ? options.data : {};
  const model = mergeFormModelValues(
    resultNode.initialValues ?? {},
    mergeFormModelValues(
      isRecord(runtime.state.forms[resultNode.id])
        ? runtime.state.forms[resultNode.id]
        : {},
      suppliedData,
    ),
  );
  return {
    id: block.id,
    title: readString(block.title, block.id),
    width: block.width,
    showFooter: true,
    model,
    form: { schema: cloneRuntimeValue(resultNode.schema) },
    actions: [
      {
        code: 'cancel',
        label: readString(block.cancelLabel, '取消'),
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: readString(block.confirmLabel, '确定'),
        role: 'confirm',
        status: 'primary',
      },
    ],
  };
}

async function executeScriptNodeAction(options: Record<string, unknown>) {
  const node = readString(options.node);
  const method = readString(options.method);
  if (!node) throw new Error('executeAction 参数 node 不能为空。');
  if (!method) throw new Error('executeAction 参数 method 不能为空。');

  const block = findRuntimeBlock(node);
  if (!block) throw new Error(`页面节点 "${node}" 不存在。`);

  const action = resolveLowCodeNodeAction(block.kind, method);
  if (!action) throw new Error(`节点 "${node}" 不支持动作 "${method}"。`);
  assertEditPageNodeActionWritable(block.kind, method);

  if (action.execute) {
    return action.execute({
      block,
      options,
      blocks: flattenPageBlocks(props.page.schema),
      searchFilters: searchFilters.value,
      grids: runtime.state.grids,
      editPageMode: props.page.page_type === 'edit'
        ? builtinPageFunctionMode.value
        : undefined,
      getDataSource,
      resolveDataSourceRequest: (sourceKey, source, postData) =>
        resolveDataSourceRequest(sourceKey, source, postData, false),
      resolveRuntimePostData,
      invokeDataSourceRequest: async (request, source) => {
        try {
          return await host.getServiceApi().invoke(
            request.serviceName,
            request.serviceMethod,
            request.postData,
          );
        } catch (error) {
          if (shouldReturnEmptyForUnavailableList(error, source.serviceMethod ?? request.serviceMethod)) {
            return [];
          }
          throw error;
        }
      },
      getSourceValue: (sourceKey) => runtime.state.sources[sourceKey],
      setSource: (sourceKey, value, sourceOptions) =>
        runtime.setSource(sourceKey, value, sourceOptions),
      syncGridStates: () => syncPageGridStates(),
      beginSourceRequest,
      isCurrentSourceRequest,
      finishSourceRequest,
      setLoadingGrid: (blockId, loading) => {
        if (loading) {
          loadingGridId.value = blockId;
        } else if (loadingGridId.value === blockId) {
          loadingGridId.value = '';
        }
      },
      getFormValues: (blockId) => runtime.state.forms[blockId] ?? {},
      getFormBaseline: (blockId) => formBaselines[blockId] ?? {},
      patchFormValues: (blockId, values) => runtime.patchForm(blockId, values),
      replaceFormValues: (blockId, values) => runtime.replaceForm(blockId, values),
      validateForm: (blockId) => runtime.getFormController(blockId)?.validate()
        ?? Promise.reject(new Error(`表单节点 "${blockId}" 当前未挂载，无法校验。`)),
      clearFormValidation: (blockId) =>
        runtime.getFormController(blockId)?.clearValidation(),
      refreshFormOptions: (blockId, refreshOptions) =>
        refreshFormNodeOptions(blockId, refreshOptions),
      setGridRows: (blockId, rows, actionOptions) =>
        runtime.setGridRows(blockId, rows, actionOptions),
      getGridChanges: (blockId) => runtime.getGridChanges(blockId),
      setGridCurrentRow: async (blockId, row) => {
        runtime.setGridCurrentRow(blockId, row);
        await runtime.getGridController(blockId)?.setCurrentRow(
          runtime.state.grids[blockId]?.currentRow ?? null,
        );
      },
      validateGrid: (blockId) => runtime.getGridController(blockId)?.validate()
        ?? Promise.reject(new Error(`表格节点 "${blockId}" 当前未挂载，无法校验。`)),
    });
  }

  if (action.executor === 'overlay.open' && isOverlayBlock(block)) {
    const result = await openLowCodeGlobalDialog(createNodeDialogConfig(block, options));
    if (result.action !== 'confirm') return null;
    return cloneScriptValue(result.values, {});
  }

  throw new Error(`节点动作执行器 "${action.executor}" 与节点 "${node}" 不匹配。`);
}

function assertEditPageNodeActionWritable(
  kind: string,
  method: string,
) {
  if (
    props.page.page_type !== 'edit' ||
    !isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
  ) return;

  const writeMethods: Record<string, Set<string>> = {
    form: new Set(['setData', 'resetData']),
    grid: new Set(['addRow', 'deleteCurrentRow']),
  };
  if (!writeMethods[kind]?.has(method)) return;
  throw new Error('当前页面为只读状态，请先点击修改。');
}

function resolveScriptPageApi(options: Record<string, unknown>) {
  const apiName = readString(options.api);
  if (!apiName) throw new Error('executeHttp 参数 api 不能为空。');
  const api = props.page.schema.apis?.[apiName];
  if (!api) throw new Error(`页面 API "${apiName}" 未声明。`);
  return { apiName, api };
}

async function executeScriptHttp(options: Record<string, unknown>) {
  const { apiName, api } = resolveScriptPageApi(options);
  const configuredMethod = readString(api.method, 'POST').toUpperCase();
  const method = readString(options.method, configuredMethod).toUpperCase();
  if (method !== configuredMethod) {
    throw new Error(`页面 API "${apiName}" 只允许使用 ${configuredMethod}。`);
  }
  if (!isRecord(options.body) && typeof options.body !== 'undefined') {
    throw new Error('executeHttp 参数 body 必须是对象。');
  }

  const result = await host.getServiceApi().invoke(
    api.serviceName,
    api.serviceMethod,
    {
      ...(api.postData ?? {}),
      ...(isRecord(options.body) ? cloneRuntimeValue(options.body) : {}),
    },
  );
  return api.resultPath ? cloneScriptValue(readPath(result, api.resultPath), null) : result;
}

function sanitizeScriptDialogConfig(value: Record<string, unknown>): GlobalDialogConfig {
  const allowedKeys = new Set([
    'id',
    'title',
    'width',
    'height',
    'className',
    'props',
    'showFooter',
    'model',
    'form',
    'grid',
    'content',
    'actions',
  ]);
  const config = Object.fromEntries(
    Object.entries(cloneRuntimeValue(value)).filter(([key]) => allowedKeys.has(key)),
  ) as GlobalDialogConfig;

  if (isRecord(config.props)) {
    config.props = Object.fromEntries(
      Object.entries(config.props).filter(([, item]) => typeof item !== 'function'),
    );
  }

  return config;
}

function sanitizeScriptAction(value: unknown) {
  if (!isRecord(value)) return undefined;

  const {
    script: _script,
    directives: _directives,
    children: _children,
    ...action
  } = value;
  return cloneScriptValue(action, {});
}

function sanitizeScriptEventPayload(value: unknown) {
  const payload = isRecord(value) ? cloneScriptValue(value, {}) : {};
  const safeAction = sanitizeScriptAction(payload.action);
  delete payload.script;
  delete payload.directives;
  if (safeAction) payload.action = safeAction;
  else delete payload.action;
  return payload;
}

function createScriptContext(event: LowCodeRuntimeEvent): LowCodeScriptContextSnapshot {
  refreshGridChangeSets();
  const route = host.getRoute();
  const eventPayload = cloneScriptValue(event.payload ?? {}, {});
  const safeAction = sanitizeScriptAction(eventPayload.action);
  const contextPolicy = props.page.schema.scriptPolicy?.context;
  const selectContextEntries = <T>(
    source: Record<string, T>,
    keys: string[] | undefined,
  ) => Array.isArray(keys)
    ? Object.fromEntries(keys.filter((key) => key in source).map((key) => [key, source[key]]))
    : source;
  delete eventPayload.script;
  delete eventPayload.directives;
  if (safeAction) eventPayload.action = safeAction;
  else delete eventPayload.action;

  const context = cloneScriptValue({
    page: {
      id: props.page.id,
      code: props.page.code,
      route: props.page.route,
      title: props.page.title,
      pageType: props.page.page_type,
      mode: props.page.page_type === 'edit'
        ? builtinPageFunctionMode.value
        : undefined,
      version: props.page.version,
    },
    route: {
      query: route.query ?? {},
      params: route.params ?? {},
      path: route.path ?? '',
      fullPath: route.fullPath ?? '',
    },
    data: selectContextEntries(resolvedData.value, contextPolicy?.dataSourceKeys),
    forms: selectContextEntries(formModels.value, contextPolicy?.formBlockIds),
    searches: selectContextEntries(searchFilters.value, contextPolicy?.searchSourceKeys),
    grids: selectContextEntries(gridStates.value, contextPolicy?.gridBlockIds),
    event: {
      ...eventPayload,
      name: event.name,
      blockId: event.blockId,
      blockKind: event.blockKind,
      timestamp: event.timestamp,
    },
    policy: {
      apiNames: Array.isArray(props.page.schema.scriptPolicy?.apiNames)
        ? props.page.schema.scriptPolicy.apiNames.filter(
            (name): name is string => typeof name === 'string' && Boolean(name.trim()),
          )
        : [],
      capabilities: Array.isArray(props.page.schema.scriptPolicy?.capabilities)
        ? [
            ...props.page.schema.scriptPolicy.capabilities,
            ...(hasSchemaPageFunctions()
              ? ['action.execute' as const]
              : []),
            ...(Object.keys(props.page.schema.apis ?? {}).length > 0
              ? ['http.execute' as const]
              : []),
            ...(hasRuntimePageFunctions()
              ? ['pageFunction.execute' as const]
              : []),
          ].filter((capability, index, capabilities) =>
            capabilities.indexOf(capability) === index,
          )
        : [
            ...(hasSchemaPageFunctions()
              ? ['action.execute' as const]
              : []),
            ...(Object.keys(props.page.schema.apis ?? {}).length > 0
              ? ['http.execute' as const]
              : []),
            ...(hasRuntimePageFunctions()
              ? ['pageFunction.execute' as const]
              : []),
          ],
    },
  }, {
    page: {},
    route: {},
    data: {},
    forms: {},
    searches: {},
    grids: {},
    event: {},
    policy: { apiNames: [] },
  });
  return compactLowCodeScriptContext(
    context,
    props.page.schema.scriptPolicy?.limits?.maxPayloadBytes
      ?? DEFAULT_LOW_CODE_SCRIPT_MAX_PAYLOAD_BYTES,
  );
}

function resolvePageFunction(options: Record<string, unknown>) {
  const name = readString(options.name);
  if (!name) throw new Error('executeFunction 参数 name 不能为空。');
  const pageFunction = props.page.schema.functions?.find(
    (item) => item.name === name && item.enabled !== false,
  );
  if (pageFunction) return { kind: 'schema' as const, pageFunction };

  const builtinFunction = resolveBuiltinLowCodePageFunction(
    props.page.page_type,
    name,
  );
  if (builtinFunction) return { kind: 'builtin' as const, pageFunction: builtinFunction };

  throw new Error(`页面函数 "${name}" 不存在、未启用或不适用于当前页面类型。`);
}

function getBuiltinSelectedRows() {
  const grids = Object.values(runtime.state.grids);
  for (const grid of grids) {
    if (!grid) continue;
    if (grid.selectedRows.length) return cloneRuntimeValue(grid.selectedRows);
    if (grid.currentRow) return [cloneRuntimeValue(grid.currentRow)];
    if (grid.contextRow) return [cloneRuntimeValue(grid.contextRow)];
  }
  return [];
}

function getBuiltinFormRecords() {
  return Object.values(formModels.value).filter(isRecord).map((values) =>
    cloneRuntimeValue(values),
  );
}

function resolveBuiltinSourceForRows(rows: Record<string, unknown>[]) {
  const matchingGrid = Object.values(runtime.state.grids).find((grid) => {
    if (!grid.sourceKey) return false;
    return rows.some((row) =>
      grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])),
    );
  });
  if (matchingGrid?.sourceKey) return getDataSource(matchingGrid.sourceKey);

  const sourceKey = readString(
    isRecord(rows[0]) ? rows[0].sourceKey : undefined,
  );
  if (sourceKey) return getDataSource(sourceKey);

  return Object.values(props.page.schema.dataSources ?? {}).find(
    (source) => Boolean(source.saveMethod),
  );
}

function resolveBuiltinDeleteSourceForRows(rows: Record<string, unknown>[]) {
  const matchingGridEntry = Object.entries(runtime.state.grids).find(([, grid]) => {
    if (!grid) return false;
    return rows.some((row) =>
      grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])),
    );
  });
  const matchingGridBlock = matchingGridEntry
    ? flattenPageBlocks(props.page.schema).find(
        (block): block is LowCodePageGridBlock =>
          block.kind === 'grid' && block.id === matchingGridEntry[0],
      )
    : undefined;
  const sourceKey = readString(
    matchingGridBlock?.deleteSourceKey ??
      matchingGridBlock?.sourceKey ??
      matchingGridEntry?.[1]?.sourceKey ??
      rows[0]?.sourceKey,
  );
  return sourceKey ? getDataSource(sourceKey) : undefined;
}

async function updateBuiltinRecords(
  rows: Record<string, unknown>[],
  values: Record<string, unknown>,
) {
  const source = resolveBuiltinSourceForRows(rows);
  if (!source) throw new Error('当前页面没有可保存的数据源。');
  const request = resolveDataSourceRequest(source.key, source);
  const serviceName = request.serviceName;
  const serviceMethod = source.saveMethod ?? (
    request.serviceMethod === 'listItems' && (
      readString(request.postData.resource) || readString(request.postData.tableName)
    )
      ? 'saveItem'
      : request.serviceMethod
  );
  if (!serviceName || !serviceMethod) {
    throw new Error(`数据源 ${source.key} 未配置保存方法。`);
  }

  const rowKey = Object.values(runtime.state.grids).find(
    (grid) => grid.sourceKey === source.key,
  )?.rowKey ?? 'id';
  return Promise.all(rows.map((row) => {
    const id = row[rowKey];
    if (typeof id === 'undefined' || id === null || id === '') {
      throw new Error('选中数据缺少主键，无法保存。');
    }
    return host.getServiceApi().invoke(serviceName, serviceMethod, {
      ...resolveRuntimePostData(source.postData),
      resource: readString(
        source.postData?.resource,
        readString(source.tableName ?? source.table_name),
      ),
      [rowKey]: id,
      data: values,
    });
  }));
}

async function deleteBuiltinRecords(rows: Record<string, unknown>[]) {
  const source = resolveBuiltinDeleteSourceForRows(rows);
  if (!source) throw new Error('当前页面没有可删除的数据源。');

  const request = resolveDataSourceRequest(source.key, source);
  const serviceName = request.serviceName;
  const serviceMethod = source.deleteMethod ?? request.serviceMethod;
  if (
    !serviceName ||
    !serviceMethod ||
    (!source.deleteMethod && isListItemsRequest(serviceName, serviceMethod))
  ) {
    throw new Error(`数据源 ${source.key} 未配置删除方法。`);
  }

  const matchingGrid = Object.values(runtime.state.grids).find((grid) =>
    rows.some((row) =>
      grid.rows.some((candidate) => Object.is(candidate[grid.rowKey], row[grid.rowKey])),
    ),
  );
  const rowKey = matchingGrid?.rowKey ?? 'id';
  const postData = {
    ...resolveRuntimePostData(source.postData),
    resource: readString(
      source.postData?.resource,
      readString(source.tableName ?? source.table_name),
    ),
  };

  return Promise.all(rows.map((row) => {
    const id = row[rowKey];
    if (typeof id === 'undefined' || id === null || id === '') {
      throw new Error('选中数据缺少主键，无法删除。');
    }
    return host.getServiceApi().invoke(serviceName, serviceMethod, {
      ...postData,
      [rowKey]: id,
    });
  }));
}

async function resetBuiltinForms(mode: 'create' | 'copy') {
  const formRecords: Record<string, Record<string, unknown>> = {};

  for (const block of flattenPageBlocks(props.page.schema)) {
    if (block.kind !== 'form') continue;
    const current = formModels.value[block.id] ?? {};
    const values = await deriveNewFormModel(block, mode, current);
    runtime.replaceForm(block.id, values);
    formRecords[block.id] = cloneRuntimeValue(values);
  }

  return formRecords;
}

async function clearBuiltinDetailGrids() {
  const clearedSourceKeys = new Set<string>();

  for (const block of flattenPageBlocks(props.page.schema)) {
    if (block.kind !== 'grid' || block.tableType !== 'detail') continue;

    if (block.sourceKey) {
      if (!clearedSourceKeys.has(block.sourceKey)) {
        clearedSourceKeys.add(block.sourceKey);
        sourceRequestVersions.delete(block.sourceKey);
        runtime.setSourceLoading(block.sourceKey, false);
        const sourceValue = resolvedData.value[block.sourceKey];
        runtime.setSource(
          block.sourceKey,
          isRecord(sourceValue) && Array.isArray(sourceValue.rows)
            ? { ...sourceValue, rows: [] }
            : [],
        );
      }
    } else {
      runtime.setGridRows(block.id, [], { rowKey: getGridRowKey(block) });
    }
    if (loadingGridId.value === block.id) loadingGridId.value = '';
    await runtime.getGridController(block.id)?.clearValidation();
  }
}

function patchBuiltinForms(values: Record<string, unknown>) {
  let patched = false;
  for (const block of flattenPageBlocks(props.page.schema)) {
    if (block.kind !== 'form') continue;
    const model = formModels.value[block.id] ?? {};
    const applicableValues = Object.fromEntries(
      Object.entries(values).filter(([field]) =>
        field in model || block.schema.fields.some((item) => item.field === field),
      ),
    );
    if (!Object.keys(applicableValues).length) continue;
    runtime.patchForm(block.id, applicableValues);
    patched = true;
  }
  if (!patched) throw new Error('当前页面没有与操作状态匹配的表单字段。');
  return cloneRuntimeValue(formModels.value);
}

async function resolveBuiltinExitRoute(args: Record<string, unknown>) {
  const explicitRoute = readString(args.route);
  if (explicitRoute) return explicitRoute;

  const fromPage = readString(host.getRoute().query?.fromPage);
  if (fromPage) {
    const page = await findLowCodePage({ code: fromPage });
    if (readString(page?.route)) return page!.route;
  }

  if (props.page.page_type === 'edit') {
    const parent = await findLowCodePage({ edit_page_id: props.page.id });
    if (readString(parent?.route)) return parent!.route;
    if (props.page.route.endsWith('/edit')) return props.page.route.slice(0, -5);
  }

  return '/dashboard';
}

function createBuiltinPageFunctionContext(
  args: Record<string, unknown>,
  event: LowCodeRuntimeEvent,
): BuiltinLowCodePageFunctionContext {
  const pageType = props.page.page_type;
  if (pageType !== 'list' && pageType !== 'edit') {
    throw new Error(`页面类型 "${pageType}" 不支持内置页面函数。`);
  }

  return {
    pageType,
    args,
    getSelectedRows: () => {
      const payloadRows = Array.isArray(event.payload?.rows)
        ? event.payload.rows.filter(isRecord)
        : [];
      const payloadRow = isRecord(event.payload?.row) ? [event.payload.row] : [];
      return cloneRuntimeValue(payloadRows.length ? payloadRows : payloadRow.length ? payloadRow : getBuiltinSelectedRows());
    },
    getFormRecords: getBuiltinFormRecords,
    navigateToEdit: async (row = {}) => {
      const route = readString(args.route) || await resolveEditPageRoute(
        row,
        readString(args.rowKey, 'id'),
      );
      if (!route) throw new Error('当前列表页没有关联编辑页。');
      return host.getRouter().push(route);
    },
    updateRecords: updateBuiltinRecords,
    deleteRecords: deleteBuiltinRecords,
    invokeService: (serviceName, serviceMethod, postData) =>
      host.getServiceApi().invoke(serviceName, serviceMethod, postData),
    prepareForms: async (mode) => {
      builtinPageFunctionMode.value = 'add';
      if (mode === 'create') await clearBuiltinDetailGrids();
      const result = await resetBuiltinForms(mode);
      return result;
    },
    patchForms: async (values) => patchBuiltinForms(values),
    getMode: () => builtinPageFunctionMode.value,
    submitForms: async (options = {}) => {
      if (
        isLowCodeEditPageReadonly(builtinPageFunctionMode.value) &&
        options.allowScan !== true
      ) return false;
      const navigateAfterCreate = builtinPageFunctionMode.value === 'add';
      const groups = collectFormSubmissionGroups();
      if (!groups.size) throw new Error('当前编辑页没有配置可保存的表单数据源。');
      const preserveMode = options.allowScan === true;
      const saved = await submitForms({ reload: preserveMode || !navigateAfterCreate });
      if (!saved) return false;

      if (preserveMode) return true;

      if (!navigateAfterCreate) {
        builtinPageFunctionMode.value = 'scan';
        captureFormBaselines();
        return true;
      }

      const savedId = readSavedRecordId(lastSavedFormRecord, groups);
      builtinPageFunctionMode.value = 'scan';
      captureFormBaselines();
      if (!savedId) return saved;
      await host.getRouter().push(appendRouteQuery(props.page.route, {
        ...readRouteQueryWithoutRecordId(),
        id: savedId,
      }));
      return saved;
    },
    setMode: async (mode) => {
      builtinPageFunctionMode.value = mode;
      await publishRuntimeEvent({
        name: 'page.modeChange',
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: { mode },
      });
    },
    refresh: async () => {
      const errors = await loadPageData(props.page);
      if (errors.length) throw new Error(errors[0]);
      return cloneRuntimeValue(resolvedData.value);
    },
    print: async () => {
      if (typeof globalThis.print !== 'function') throw new Error('当前环境不支持打印。');
      globalThis.print();
      return true;
    },
    exit: async () => host.getRouter().push(await resolveBuiltinExitRoute(args)),
    notify: (nextMessage, status = 'info') => {
      message.value = nextMessage;
      messageClass.value = status === 'error' ? 'lc-error' : 'lc-help';
    },
  };
}

async function executePageFunction(
  options: Record<string, unknown>,
  event: LowCodeRuntimeEvent,
) {
  const resolvedFunction = resolvePageFunction(options);
  if (typeof options.args !== 'undefined' && !isRecord(options.args)) {
    throw new Error('executeFunction 参数 args 必须是对象。');
  }
  const args = isRecord(options.args) ? cloneRuntimeValue(options.args) : {};
  if (resolvedFunction.kind === 'builtin') {
    return resolvedFunction.pageFunction.execute(
      createBuiltinPageFunctionContext(args, event),
    );
  }
  const pageFunction = resolvedFunction.pageFunction;
  const callStack = Array.isArray(event.payload?.pageFunctionStack)
    ? event.payload.pageFunctionStack.filter(
        (item): item is string => typeof item === 'string' && Boolean(item),
      )
    : [];
  if (callStack.length >= MAX_PAGE_FUNCTION_CALL_DEPTH) {
    throw new Error(`页面函数调用深度不能超过 ${MAX_PAGE_FUNCTION_CALL_DEPTH} 层。`);
  }
  if (callStack.includes(pageFunction.name)) {
    throw new Error(`页面函数 "${pageFunction.name}" 不允许递归调用。`);
  }
  const functionEvent: LowCodeRuntimeEvent = {
    name: `pageFunction.${pageFunction.name}`,
    blockId: event.blockId,
    blockKind: event.blockKind,
    timestamp: Date.now(),
    payload: {
      args,
      callerEvent: sanitizeScriptEventPayload(event.payload),
      pageFunctionStack: [...callStack, pageFunction.name],
    },
  };
  const result = await executeIsolatedScript(pageFunction.script, functionEvent);
  return result.value;
}

async function handleScriptCapability(
  request: LowCodeScriptCapabilityRequest,
  context: LowCodeScriptContextSnapshot,
  event: LowCodeRuntimeEvent,
) {
  const args = request.args;
  const allowedCapabilities = context.policy?.capabilities;
  if (!Array.isArray(allowedCapabilities) || !allowedCapabilities.includes(request.name)) {
    throw new Error(`脚本能力 "${request.name}" 未经当前页面授权。`);
  }

  switch (request.name) {
    case 'action.execute':
      return executeScriptNodeAction(readScriptOptionsArg(args, 'executeAction'));
    case 'http.execute':
      return executeScriptHttp(readScriptOptionsArg(args, 'executeHttp'));
    case 'pageFunction.execute':
      return executePageFunction(
        readScriptOptionsArg(args, 'executeFunction'),
        event,
      );
    case 'api.invoke': {
      const apiName = readScriptStringArg(args, 0, 'name');
      return invokeRegisteredLowCodeScriptApi(
        apiName,
        readScriptRecordArg(args, 1),
        context,
      );
    }
    case 'source.refresh': {
      const sourceKey = readScriptStringArg(args, 0, 'sourceKey');
      if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
      const errors = await refreshDataSources([sourceKey]);
      if (errors.length) throw new Error(errors[0]);
      return cloneScriptValue(resolvedData.value[sourceKey], null);
    }
    case 'source.refreshAll': {
      const errors = await refreshDataSources();
      if (errors.length) throw new Error(errors[0]);
      return cloneScriptValue(resolvedData.value, {});
    }
    case 'source.set': {
      assertEditPageCapabilityWritable('source.set');
      const sourceKey = readScriptStringArg(args, 0, 'sourceKey');
      if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
      runtime.setSource(sourceKey, cloneRuntimeValue(args[1]));
      syncPageGridStates();
      return true;
    }
    case 'form.patch': {
      const blockId = readScriptStringArg(args, 0, 'blockId');
      const block = findRuntimeBlock(blockId);
      if (!block || (block.kind !== 'form' && block.kind !== 'searchForm')) {
        throw new Error(`表单 "${blockId}" 不存在。`);
      }
      if (block.kind === 'form') assertEditPageCapabilityWritable('form.patch');
      runtime.patchForm(blockId, readScriptRecordArg(args, 1));
      await runtime.getFormController(blockId)?.setValues?.(
        runtime.state.forms[blockId] ?? {},
      );
      return cloneScriptValue(runtime.state.forms[blockId], {});
    }
    case 'form.replace': {
      const blockId = readScriptStringArg(args, 0, 'blockId');
      const block = findRuntimeBlock(blockId);
      if (!block || (block.kind !== 'form' && block.kind !== 'searchForm')) {
        throw new Error(`表单 "${blockId}" 不存在。`);
      }
      if (block.kind === 'form') assertEditPageCapabilityWritable('form.replace');
      runtime.replaceForm(blockId, readScriptRecordArg(args, 1));
      await runtime.getFormController(blockId)?.setValues?.(
        runtime.state.forms[blockId] ?? {},
      );
      return cloneScriptValue(runtime.state.forms[blockId], {});
    }
    case 'grid.setRows': {
      const blockId = readScriptStringArg(args, 0, 'blockId');
      const block = findRuntimeBlock(blockId);
      if (!block || block.kind !== 'grid') throw new Error(`表格 "${blockId}" 不存在。`);
      const rows = readScriptRowsArg(args, 1);
      if (block.sourceKey) runtime.setSource(block.sourceKey, rows);
      else runtime.setGridRows(blockId, rows, { rowKey: getGridRowKey(block) });
      syncPageGridStates();
      return rows;
    }
    case 'search.patch': {
      const sourceKey = readScriptStringArg(args, 0, 'sourceKey');
      if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
      runtime.patchSearch(sourceKey, readScriptRecordArg(args, 1));
      return cloneScriptValue(runtime.state.searches[sourceKey], {});
    }
    case 'search.replace': {
      const sourceKey = readScriptStringArg(args, 0, 'sourceKey');
      if (!getDataSource(sourceKey)) throw new Error(`数据源 "${sourceKey}" 不存在。`);
      runtime.replaceSearch(sourceKey, readScriptRecordArg(args, 1));
      return cloneScriptValue(runtime.state.searches[sourceKey], {});
    }
    case 'page.refresh': {
      const errors = await loadPageData(props.page);
      if (errors.length) throw new Error(errors[0]);
      return true;
    }
    case 'router.push': {
      const target = args[0];
      if (typeof target !== 'string' && !isRecord(target)) {
        throw new Error('路由参数必须是字符串或对象。');
      }
      await host.getRouter().push(cloneRuntimeValue(target));
      return true;
    }
    case 'message.success':
    case 'message.info':
    case 'message.warning':
    case 'message.error': {
      const nextMessage = readScriptStringArg(args, 0, 'message');
      message.value = nextMessage;
      messageClass.value = request.name === 'message.error' ? 'lc-error' : 'lc-help';
      return true;
    }
    case 'dialog.open': {
      if (!isRecord(args[0])) throw new Error('弹框配置必须是对象。');
      const config = sanitizeScriptDialogConfig(args[0]);
      if (!readString(config.title)) throw new Error('弹框标题不能为空。');
      const result = await openLowCodeGlobalDialog(config);
      return cloneScriptValue<Record<string, unknown>>(
        result as unknown as Record<string, unknown>,
        { action: 'close', values: {} },
      );
    }
    case 'event.emit': {
      const name = readScriptStringArg(args, 0, 'eventName');
      await publishRuntimeEvent({
        name,
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: sanitizeScriptEventPayload(args[1]),
      });
      return true;
    }
    default:
      throw new Error(`脚本能力 "${request.name}" 未注册。`);
  }
}

function assertEditPageCapabilityWritable(capability: string) {
  if (
    props.page.page_type !== 'edit' ||
    !isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
  ) return;
  throw new Error(`当前页面为只读状态，不能执行 ${capability}。`);
}

async function executeIsolatedScript(
  script: string,
  event: LowCodeRuntimeEvent,
  executionMode: LowCodeScriptExecutionMode = 'script',
) {
  const context = createScriptContext(event);
  return executeLowCodeScript(
    {
      script,
      context,
      executionMode,
      limits: props.page.schema.scriptPolicy?.limits,
    },
    (request) => handleScriptCapability(request, context, event),
  );
}

async function executeButtonScript(script: string, event: LowCodeRuntimeEvent) {
  const result = await executeIsolatedScript(script, event);
  return result.value;
}

function reportRuntimeDirectiveError(error: unknown) {
  message.value =
    error instanceof Error ? error.message : host.t('runtime.errors.directive');
  messageClass.value = 'lc-error';
}

function eventRow(event: LowCodeRuntimeEvent) {
  return isRecord(event.payload?.row) ? event.payload.row : {};
}

function directiveScope(event: LowCodeRuntimeEvent): RuntimeExpressionScope {
  return {
    event,
    row: eventRow(event),
    value: event.payload?.value,
    values: isRecord(event.payload?.values) ? event.payload.values : {},
  };
}

function resolveDirectiveString(value: unknown, event: LowCodeRuntimeEvent, fallback = '') {
  const resolved = resolveRuntimeValue(value, directiveScope(event));
  if (typeof resolved === 'string') return resolved.trim() || fallback;
  if (typeof resolved === 'number' || typeof resolved === 'boolean') return String(resolved);
  return fallback;
}

function resolveDirectiveRecord(value: unknown, event: LowCodeRuntimeEvent) {
  const resolved = resolveRuntimeValue(value, directiveScope(event));
  return isRecord(resolved) ? resolved : {};
}

function isLowCodePageRecordLike(value: unknown): value is LowCodePageRecord {
  return isRecord(value) && isRecord(value.schema) && typeof value.code === 'string';
}

function resolvePageReferenceConfig(value: unknown, event: LowCodeRuntimeEvent) {
  const resolved = resolveRuntimeValue(value, directiveScope(event));

  if (isRecord(resolved) && isRecord(value) && isLowCodePageRecordLike(value.page)) {
    return {
      ...resolved,
      page: value.page,
    };
  }

  return resolved;
}

function resolveDirectiveData(directive: LowCodeRuntimeDirective, event: LowCodeRuntimeEvent) {
  const rawValue =
    typeof directive.value !== 'undefined'
      ? directive.value
      : typeof directive.values !== 'undefined'
        ? directive.values
        : typeof directive.rows !== 'undefined'
          ? directive.rows
          : typeof directive.row !== 'undefined'
            ? directive.row
            : event.payload?.row ?? event.payload?.values ?? event.payload?.value;

  return resolveRuntimeValue(rawValue, directiveScope(event));
}

function resolveDirectiveSourceKeys(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  if (Array.isArray(directive.sourceKeys)) {
    return directive.sourceKeys
      .map((key) => resolveDirectiveString(key, event))
      .filter(Boolean);
  }

  const sourceKey = resolveDirectiveString(directive.sourceKey, event);
  return sourceKey ? [sourceKey] : [];
}

function normalizeRows(value: unknown) {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function resolveRowKey(directive: LowCodeRuntimeDirective, event: LowCodeRuntimeEvent) {
  return resolveDirectiveString(directive.rowKey, event, 'id');
}

function isTruthyRuntimeValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized) && !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
  }

  return Boolean(value);
}

function shouldExecuteDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  if (directive.disabled) return false;
  if (typeof directive.when === 'undefined') return true;

  return isTruthyRuntimeValue(resolveRuntimeValue(directive.when, directiveScope(event)));
}

function mergeDataSourceValue(
  currentValue: unknown,
  nextValue: unknown,
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const mode = directive.mode ?? 'replace';

  if (mode === 'merge') {
    return isRecord(currentValue) && isRecord(nextValue)
      ? { ...currentValue, ...nextValue }
      : nextValue;
  }

  if (mode === 'append' || mode === 'prepend') {
    const currentRows = Array.isArray(currentValue) ? currentValue : [];
    const nextRows = normalizeRows(nextValue);
    return mode === 'append'
      ? [...currentRows, ...nextRows]
      : [...nextRows, ...currentRows];
  }

  if (mode === 'patch') {
    if (isRecord(currentValue) && isRecord(nextValue)) {
      return { ...currentValue, ...nextValue };
    }

    const rowKey = resolveRowKey(directive, event);
    const rows = Array.isArray(currentValue) ? [...currentValue] : [];
    normalizeRows(nextValue).forEach((nextRow) => {
      const index = rows.findIndex((row) => isRecord(row) && row[rowKey] === nextRow[rowKey]);
      if (index >= 0 && isRecord(rows[index])) {
        rows[index] = { ...rows[index], ...nextRow };
      } else {
        rows.push(nextRow);
      }
    });
    return rows;
  }

  if (mode === 'remove') {
    const rowKey = resolveRowKey(directive, event);
    const rows = Array.isArray(currentValue) ? currentValue : [];
    const removeKeys = new Set(normalizeRows(nextValue).map((row) => row[rowKey]));
    return rows.filter((row) => !isRecord(row) || !removeKeys.has(row[rowKey]));
  }

  return nextValue;
}

function applyDataSourceDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const [sourceKey] = resolveDirectiveSourceKeys(directive, event);
  if (!sourceKey) return;

  runtime.setSource(sourceKey, mergeDataSourceValue(
    resolvedData.value[sourceKey],
    resolveDirectiveData(directive, event),
    directive,
    event
  ));
  syncPageGridStates();
}

function applyGridRowsDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
  if (!blockId) return;

  const target = findRuntimeBlock(blockId);
  if (!target || target.kind !== 'grid') return;

  const nextValue = resolveDirectiveData(directive, event);

  if (target.sourceKey) {
    runtime.setSource(target.sourceKey, mergeDataSourceValue(
      resolvedData.value[target.sourceKey],
      nextValue,
      directive,
      event
    ));
    syncPageGridStates();
    return;
  }

  target.rows = mergeDataSourceValue(
    target.rows ?? [],
    nextValue,
    directive,
    event
  ) as Record<string, unknown>[];
  syncPageGridStates();
}

function applyFormValuesDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
  if (!blockId) return;

  const nextValues = resolveDirectiveRecord(
    directive.values ?? directive.value ?? event.payload?.values ?? event.payload?.row,
    event
  );

  if (directive.mode === 'replace') {
    runtime.replaceForm(blockId, nextValues);
    return;
  }

  runtime.patchForm(blockId, nextValues);
}

function applyFormFieldDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
  const field = resolveDirectiveString(directive.field, event);
  if (!blockId || !field) return;

  runtime.patchForm(blockId, {
    [field]: resolveRuntimeValue(directive.value, directiveScope(event)),
  });
}

async function applySearchFiltersDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const [sourceKey] = resolveDirectiveSourceKeys(directive, event);
  if (!sourceKey) return;

  const values = resolveDirectiveRecord(
    directive.values ?? directive.value ?? event.payload?.values,
    event
  );
  if (directive.mode === 'replace') runtime.replaceSearch(sourceKey, values);
  else runtime.patchSearch(sourceKey, values);

  await refreshDataSources([sourceKey]);
}

function setRuntimeMessage(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const nextMessage = resolveDirectiveString(directive.message ?? directive.value, event);
  if (!nextMessage) return;

  message.value = nextMessage;
  messageClass.value = directive.status === 'error' ? 'lc-error' : 'lc-help';
}

async function invokeServiceDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent,
  executionContext: RuntimeDirectiveExecutionContext,
) {
  const sourceKey = resolveDirectiveString(directive.sourceKey, event);
  const source = getDataSource(sourceKey);
  const directivePostData = resolveRuntimeValue(
    directive.postData ?? source?.postData ?? {},
    directiveScope(event)
  ) as Record<string, unknown>;
  const request = source
    ? resolveDataSourceRequest(sourceKey, source, directivePostData)
    : { serviceName: '', serviceMethod: '', postData: directivePostData };
  const serviceName = resolveDirectiveString(directive.serviceName, event, request.serviceName);
  const serviceMethod = resolveDirectiveString(
    directive.serviceMethod,
    event,
    request.serviceMethod
  );

  if (!serviceName || !serviceMethod) return;

  const normalizedRequest = normalizeLegacyAdminListRequest(
    serviceName,
    serviceMethod,
    request.postData
  );

  const mesCommand = isDesktopMesCommand(
    normalizedRequest.serviceName,
    normalizedRequest.serviceMethod,
  );
  let result: unknown;
  if (mesCommand) {
    if (runtime.state.status.mesCommandExecuting) {
      throw new Error('当前操作仍在处理中，请稍候。');
    }
    executionContext.mesCommandStarted = true;
    runtime.state.status.mesCommandExecuting = true;
    runtime.state.status.mesCommandActionKey = [
      event.blockId ?? '',
      readString(event.payload?.actionCode, normalizedRequest.serviceMethod),
    ].join(':');
    const commandRequest = await prepareDesktopMesCommandRequest(normalizedRequest.postData);
    result = await invokeDesktopMesCommand(() => host
      .getServiceApi()
      .invoke(
        normalizedRequest.serviceName,
        normalizedRequest.serviceMethod,
        commandRequest.postData,
        { requestId: commandRequest.requestId },
      ));
    executionContext.mesCommandCompleted = true;
  } else {
    result = await host
      .getServiceApi()
      .invoke(
        normalizedRequest.serviceName,
        normalizedRequest.serviceMethod,
        normalizedRequest.postData
      );
  }
  const assignTo = resolveDirectiveString(directive.assignTo, event);

  if (assignTo) {
    runtime.setSource(assignTo, mergeDataSourceValue(
      resolvedData.value[assignTo],
      result,
      directive,
      event
    ));
    syncPageGridStates();
  }

  if (directive.refreshSourceKeys?.length) {
    const sourceKeys = directive.refreshSourceKeys
      .map((key) => resolveDirectiveString(key, event))
      .filter(Boolean);
    try {
      await refreshDataSources(sourceKeys, {
        ordered: mesCommand,
        strict: mesCommand,
      });
      if (mesCommand) executionContext.mesCommandRefreshCompleted = true;
    } catch (error) {
      if (mesCommand) executionContext.mesCommandRefreshFailed = true;
      throw error;
    }
  }
}

function resolveDialogFollowUpDirectives(
  directive: LowCodeRuntimeDirective,
  action: string
) {
  const actionKey = `${action}Directives`;
  const actionDirectives = directive[actionKey];

  return normalizeLowCodeDirectives(
    actionDirectives ??
      (action === 'confirm'
        ? directive.confirmDirectives
        : action === 'cancel'
          ? directive.cancelDirectives
          : directive.closeDirectives)
  );
}

async function openGlobalDialogDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const rawConfig = resolveRuntimeValue(
    directive.config ?? directive.value ?? {},
    directiveScope(event)
  );
  if (!isRecord(rawConfig)) return;

  const config = rawConfig as GlobalDialogConfig;
  const model = resolveDirectiveRecord(
    directive.model ?? config.model ?? config.form?.model ?? {},
    event
  );
  const createFollowUpEvent = (
    action: string,
    values: Record<string, unknown>,
    payload?: unknown,
  ): LowCodeRuntimeEvent => ({
    name: resolveDirectiveString(
      directive.resultEvent ?? directive.event,
      event,
      `dialog.${action}`
    ),
    blockId: event.blockId,
    blockKind: event.blockKind,
    timestamp: Date.now(),
    payload: {
      action,
      values,
      payload,
      directives: resolveDialogFollowUpDirectives(directive, action),
    },
  });
  const result = await openLowCodeGlobalDialog({
    ...config,
    model,
    form: config.form
      ? {
          ...config.form,
          model,
        }
      : config.form,
    onConfirm: async (context) => {
      const configuredResult = await config.onConfirm?.(context);
      if (
        configuredResult === false ||
        (isRecord(configuredResult) && 'close' in configuredResult && configuredResult.close === false)
      ) {
        return configuredResult;
      }

      await publishRuntimeEvent(createFollowUpEvent(
        'confirm',
        context.model,
        isRecord(configuredResult) ? configuredResult.payload : undefined,
      ));
      return configuredResult;
    },
  });
  if (result.action === 'confirm') return;
  const followUpDirectives = resolveDialogFollowUpDirectives(directive, result.action);
  const resultEvent = resolveDirectiveString(
    directive.resultEvent ?? directive.event,
    event,
    `dialog.${result.action}`
  );

  if (!resultEvent && !followUpDirectives.length) return;

  await publishRuntimeEvent({
    name: resultEvent,
    blockId: event.blockId,
    blockKind: event.blockKind,
    timestamp: Date.now(),
    payload: {
      action: result.action,
      values: result.values,
      payload: result.payload,
      directives: followUpDirectives,
    },
  });
}

function getOptionalServiceApi() {
  if (props.serviceApi) return props.serviceApi;

  try {
    return host.getServiceApi();
  } catch {
    return undefined;
  }
}

function getOptionalRouter() {
  return props.router ?? host.getRouter();
}

function getCurrentRoute() {
  return props.route ?? host.getRoute();
}

async function openPageReferenceDialogDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const rawConfig = resolvePageReferenceConfig(
    directive.config ?? directive.value ?? {},
    event
  );
  if (!isRecord(rawConfig)) return;

  const result = await openLowCodePageReferenceDialog({
    ...(rawConfig as LowCodePageReferenceDialogConfig),
    serviceApi:
      (rawConfig as LowCodePageReferenceDialogConfig).serviceApi ?? getOptionalServiceApi(),
    router: (rawConfig as LowCodePageReferenceDialogConfig).router ?? getOptionalRouter(),
    route: (rawConfig as LowCodePageReferenceDialogConfig).route ?? getCurrentRoute(),
    locale: (rawConfig as LowCodePageReferenceDialogConfig).locale ?? props.locale,
    messages: (rawConfig as LowCodePageReferenceDialogConfig).messages ?? props.messages,
    theme: (rawConfig as LowCodePageReferenceDialogConfig).theme ?? props.theme,
  });
  const resultPayload: Record<string, unknown> = isRecord(result.payload)
    ? result.payload
    : {};
  const row = isRecord(resultPayload.row) ? resultPayload.row : undefined;
  const followUpDirectives = resolveDialogFollowUpDirectives(directive, result.action);
  const resultEvent = resolveDirectiveString(
    directive.resultEvent ?? directive.event,
    event,
    `reference.${result.action}`
  );

  if (!resultEvent && !followUpDirectives.length) return;

  await publishRuntimeEvent({
    name: resultEvent,
    blockId: event.blockId,
    blockKind: event.blockKind,
    timestamp: Date.now(),
    payload: {
      action: result.action,
      values: result.values,
      payload: result.payload,
      ...(row ? { row } : {}),
      value: resultPayload.value,
      label: resultPayload.label,
      page: resultPayload.page,
      referenceBlockId: resultPayload.blockId,
      referenceBlockKind: resultPayload.blockKind,
      directives: followUpDirectives,
    },
  });
}

function setBlockOpen(blockId: string, open: boolean) {
  const target = findRuntimeBlock(blockId);
  if (target && 'open' in target) {
    target.open = open;
    if (!open && isOverlayBlock(target)) {
      closeNestedOverlays(target);
    }
  }
}

function closeNestedOverlays(block: LowCodePageOverlayBlock) {
  (block.overlays ?? []).forEach((overlay) => {
    overlay.open = false;
    closeNestedOverlays(overlay);
  });
}

function toggleBlockOpen(blockId: string) {
  const target = findRuntimeBlock(blockId);
  if (target && 'open' in target) {
    setBlockOpen(blockId, target.open === false);
  }
}

async function executeRuntimeDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent,
  executionContext: RuntimeDirectiveExecutionContext,
) {
  const refreshAfterMesCommand = executionContext.mesCommandCompleted
    && !executionContext.mesCommandRefreshCompleted
    && !executionContext.mesCommandRefreshFailed;
  const directiveContext: LowCodeRuntimeDirectiveContext = {
    shouldExecuteDirective,
    resolveDirectiveString,
    resolveDirectiveRecord,
    resolveDirectiveSourceKeys,
    applyDataSourceDirective,
    applyGridRowsDirective,
    applyFormValuesDirective,
    applyFormFieldDirective,
    applySearchFiltersDirective,
    refreshDataSources: async (sourceKeys) => {
      try {
        const errors = await refreshDataSources(sourceKeys, {
          ordered: refreshAfterMesCommand,
          strict: refreshAfterMesCommand,
        });
        if (refreshAfterMesCommand) {
          executionContext.mesCommandRefreshCompleted = true;
        }
        return errors;
      } catch (error) {
        if (refreshAfterMesCommand) executionContext.mesCommandRefreshFailed = true;
        throw error;
      }
    },
    refreshPage: () => loadPageData(props.page).then(() => undefined),
    invokeServiceDirective: (nextDirective, nextEvent) =>
      invokeServiceDirective(nextDirective, nextEvent, executionContext),
    navigate: (route) => (route ? host.getRouter().push(route) : undefined),
    setRuntimeMessage,
    emitRuntimeEvent: publishRuntimeEvent,
    setBlockOpen,
    toggleBlockOpen,
    openGlobalDialog: openGlobalDialogDirective,
    openPageReferenceDialog: openPageReferenceDialogDirective,
  };

  await executeLowCodeRuntimeDirective(directive, event, directiveContext);
}

async function handleFormSubmit(
  block: LowCodeRuntimeBlock,
  values: Record<string, unknown>,
  action?: LowCodeAction,
) {
  await waitForActionEvent(action);
  if (block.kind !== 'form') return;
  if (
    props.page.page_type === 'edit' &&
    isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
  ) return;
  const source = getDataSource(block.submitSourceKey ?? block.sourceKey);

  if (!source) {
    return;
  }

  loadingBlockId.value = block.id;
  message.value = '';

  try {
    await saveFormSource(source.key, values);
    message.value = host.t('runtime.form.saved');
    messageClass.value = 'lc-help';
    await loadPageData(props.page);
    await publishRuntimeEvent({
      name: 'form.saved',
      blockId: block.id,
      blockKind: block.kind,
      timestamp: Date.now(),
      payload: {
        sourceKey: source.key,
        values,
      },
    });
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : host.t('runtime.form.submitFailed');
    messageClass.value = 'lc-error';
  } finally {
    loadingBlockId.value = '';
  }
}

async function handleFormAction(
  block: LowCodeRuntimeBlock,
  action: LowCodeAction,
  values: Record<string, unknown>
) {
  await waitForActionEvent(action);
  if (action.route) {
    await host.getRouter().push(resolveRuntimeRoute(action.route, values));
    return;
  }

  if (action.code === 'submit') {
    await handleFormSubmit(block, values);
  }
}

function hasEnabledRefreshDirective(action: LowCodeAction | LowCodeButtonGroupAction) {
  return normalizeLowCodeDirectives(action.directives).some((directive) =>
    !directive.disabled && [
      'refreshDataSource',
      'refreshDataSources',
      'refreshPage',
    ].includes(directive.type.trim())
  );
}

async function handleToolbarAction(action: LowCodeAction | LowCodeButtonGroupAction) {
  await waitForActionEvent(action);
  if (action.route) {
    await host.getRouter().push(resolveRuntimeRoute(action.route));
    return;
  }

  if (action.code === 'refresh') {
    if (readString(action.script) || hasEnabledRefreshDirective(action)) return;
    await loadPageData(props.page);
  }
}

async function handleSearchSubmit(
  block: LowCodePageSearchFormBlock,
  values: Record<string, unknown>,
  action?: LowCodeAction,
) {
  await waitForActionEvent(action);
  const sourceKeys = searchTargetSourceKeys(block);
  if (!sourceKeys.length) return;
  sourceKeys.forEach((sourceKey) => runtime.replaceSearch(sourceKey, values));
  await refreshDataSources(sourceKeys);
}

async function handleSearchAction(
  block: LowCodePageSearchFormBlock,
  action: LowCodeAction,
  values: Record<string, unknown>
) {
  await waitForActionEvent(action);
  const sourceKeys = searchTargetSourceKeys(block);
  if (action.type === 'reset' && sourceKeys.length) {
    sourceKeys.forEach((sourceKey) => runtime.replaceSearch(sourceKey, {}));
    await refreshDataSources(sourceKeys);
    return;
  }

  if (action.code === 'submit') {
    await handleSearchSubmit(block, values);
  }
}

async function handleGridEdit(
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
  if (
    props.page.page_type === 'edit' &&
    isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
  ) return;
  const linkedEditRoute = await resolveLinkedEditPageRoute(block, row);

  if (linkedEditRoute) {
    await host.getRouter().push(linkedEditRoute);
    return;
  }

  const editRoute = block.editRoute ?? block.schema.rowActions?.editRoute;

  if (editRoute) {
    await host.getRouter().push(resolveRuntimeRoute(editRoute, row));
    return;
  }

  const formBlock = getFormBlockTarget(block);

  if (!formBlock) {
    return;
  }

  runtime.replaceForm(formBlock.id, await deriveFormModel(formBlock, row));
  message.value = '';
}

async function handleGridDelete(
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
  if (
    props.page.page_type === 'edit' &&
    isLowCodeEditPageReadonly(builtinPageFunctionMode.value)
  ) return;
  const source = getDataSource(block.deleteSourceKey ?? block.sourceKey);

  if (!source) {
    return;
  }

  loadingGridId.value = block.id;
  message.value = '';

  try {
    const request = resolveDataSourceRequest(source.key, source);
    const serviceName = request.serviceName;
    const serviceMethod = source.deleteMethod ?? request.serviceMethod;

    if (!serviceName || !serviceMethod || (!source.deleteMethod && isListItemsRequest(serviceName, serviceMethod))) {
      throw new Error(`Data source ${source.key} is missing delete service.`);
    }

    await host.getServiceApi().invoke(serviceName, serviceMethod, {
      ...(source.postData ?? {}),
      ...row
    });
    message.value = host.t('runtime.grid.deleted');
    messageClass.value = 'lc-help';
    await loadPageData(props.page);
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : host.t('runtime.grid.deleteFailed');
    messageClass.value = 'lc-error';
  } finally {
    loadingGridId.value = '';
  }
}
</script>

<style scoped>
.lowcode-runtime-shell {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: stretch;
  width: 100%;
  min-width: 0;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.lowcode-runtime-page {
  position: relative;
}

.lc-page-loading-overlay {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 20;
  pointer-events: none;
}

.lc-page-loading-overlay span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  border: 1px solid #d8dee8;
  border-radius: 6px;
  background: rgb(255 255 255 / 92%);
  box-shadow: 0 6px 18px rgb(15 23 42 / 8%);
  color: #475467;
  font-size: 12px;
  line-height: 18px;
  padding: 4px 10px;
}

@media (max-width: 820px) {
  .lowcode-runtime-page {
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .lowcode-runtime-page > .lc-runtime-block--fill.lc-node-tabs {
    flex: 0 0 min(560px, calc(100dvh - 16px));
    min-height: min(560px, calc(100dvh - 16px));
  }
}
</style>
