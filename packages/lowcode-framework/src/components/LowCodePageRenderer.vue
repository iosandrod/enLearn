<template>
  <div class="lowcode-runtime-page" :class="themeClass" :style="themeStyle">
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
      @form-submit="({ block: formBlock, values }) => handleFormSubmit(formBlock, values)"
      @form-action="({ block: formBlock, action, values }) => handleFormAction(formBlock, action, values)"
      @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
      @grid-delete="({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)"
      @toolbar-action="({ action }) => handleToolbarAction(action)"
      @search-submit="({ block: searchBlock, values }) => handleSearchSubmit(searchBlock, values)"
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
      @form-submit="({ block: formBlock, values }) => handleFormSubmit(formBlock, values)"
      @form-action="({ block: formBlock, action, values }) => handleFormAction(formBlock, action, values)"
      @grid-edit="({ block: gridBlock, row }) => handleGridEdit(gridBlock, row)"
      @grid-delete="({ block: gridBlock, row }) => handleGridDelete(gridBlock, row)"
      @toolbar-action="({ action }) => handleToolbarAction(action)"
      @search-submit="({ block: searchBlock, values }) => handleSearchSubmit(searchBlock, values)"
      @search-action="({ block: searchBlock, action, values }) => handleSearchAction(searchBlock, action, values)"
      @runtime-event="publishRuntimeEvent"
    />

    <p v-if="message" :class="messageClass">{{ message }}</p>
    <GlobalDialogHost v-if="showGlobalDialogHost" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import type {
  LowCodeAction,
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageRecord,
  LowCodePageFormBlock,
  LowCodePageGridBlock,
  LowCodePageRelation,
  LowCodePageOverlayBlock,
  LowCodePageSearchFormBlock,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent
} from '../types/lowcode';
import type { LowCodeRuntimeBlock } from '../lowcode/block-materials';
import GlobalDialogHost from './GlobalDialogHost';
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

const host = useLowCodeHost(() => ({
  serviceApi: props.serviceApi,
  router: props.router,
  route: props.route,
  locale: props.locale,
  messages: props.messages,
  theme: props.theme,
}));
const loadingBlockId = ref('');
const loadingGridId = ref('');
const message = ref('');
const messageClass = ref('lc-help');
const dataLoading = ref(false);
const resolvedData = reactive<Record<string, unknown>>({});
const formModels = reactive<Record<string, Record<string, unknown>>>({});
const searchFilters = reactive<Record<string, Record<string, unknown>>>({});
const runtimeEventBus = createLowCodeEventBus();
let loadSequence = 0;

const themeClass = computed(() => host.getTheme().className);
const themeStyle = computed(() =>
  Object.fromEntries(
    Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])
  )
);
const layoutBlocks = computed(() =>
  markLastBlockFill(props.page.schema.blocks.filter((block) => !isOverlayBlock(block)))
);
const pageOverlays = computed<LowCodePageOverlayBlock[]>(() => [
  ...props.page.schema.blocks.filter(isOverlayBlock),
  ...(props.page.schema.overlays ?? []),
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function clearObject(target: Record<string, unknown>) {
  Object.keys(target).forEach((key) => delete target[key]);
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
  const currentForm = currentBlockId ? formModels[currentBlockId] ?? {} : {};
  const currentRoute = host.getRoute();
  const expressionRoot = {
    row: scope.row ?? (isRecord(eventPayload.row) ? eventPayload.row : {}),
    route: {
      query: currentRoute.query ?? {},
      params: currentRoute.params ?? {},
      path: currentRoute.path ?? '',
      fullPath: currentRoute.fullPath ?? ''
    },
    data: resolvedData,
    form: currentForm,
    forms: formModels,
    search: searchFilters,
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

function isListItemsRequest(serviceName: string, serviceMethod: string) {
  return serviceName === 'admin' && serviceMethod === 'listItems';
}

function mergeDataSourceSearchFilters(
  key: string,
  postData: Record<string, unknown>
) {
  const sourceFilters = searchFilters[key];

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

function resolveDataSourceRequest(
  key: string,
  source: LowCodePageDataSource,
  postDataOverride?: Record<string, unknown>
) {
  const basePostData = resolveRuntimePostData(postDataOverride ?? source.postData);
  const postData = mergeDataSourceSearchFilters(
    key,
    withDataSourceTargetPostData(source, basePostData)
  );
  const service = resolveDataSourceService(source, postData);

  return { serviceName: service.serviceName, serviceMethod: service.serviceMethod, postData };
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

function readRelationMetadataString(
  relation: LowCodePageRelation | undefined,
  key: string,
  fallback = ''
) {
  return readString(relation?.metadata?.[key], fallback);
}

function findPageRelation(actionKey: string, block?: LowCodePageGridBlock) {
  const relations = props.page.relations?.outgoing ?? [];
  const blockActionKey = block ? `${block.id}.${actionKey}` : '';

  return (
    (blockActionKey
      ? relations.find((relation) => relation.actionKey === blockActionKey)
      : undefined) ??
    relations.find((relation) => {
      if (relation.actionKey !== actionKey) return false;
      const blockId = readRelationMetadataString(relation, 'blockId');
      return !block || !blockId || blockId === block.id;
    })
  );
}

function getGridRowKey(block: LowCodePageGridBlock, relation?: LowCodePageRelation) {
  const metadataRowKey = readRelationMetadataString(relation, 'rowKey');
  if (metadataRowKey) return metadataRowKey;

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

function resolveRelationRoute(
  relation: LowCodePageRelation,
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
  const route = readString(relation.targetPageRoute);
  if (!route) return '';

  const rowKey = getGridRowKey(block, relation);
  const queryKey = readRelationMetadataString(relation, 'queryKey', rowKey);
  const resolvedRoute = resolveRuntimeRoute(route, row);

  return appendRouteQuery(resolvedRoute, {
    fromPage: props.page.code,
    [queryKey]: row[rowKey],
  });
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

  const data = await host.getServiceApi().invoke(
    serviceName,
    serviceMethod,
    postData
  );

  return [key, data] as const;
}

async function refreshDataSources(sourceKeys: string[] = []) {
  const allEntries = Object.entries(props.page.schema.dataSources ?? {});
  const entries = sourceKeys.length
    ? sourceKeys
        .map((key) => {
          const source = getDataSource(key);
          return source ? ([key, source] as const) : undefined;
        })
        .filter((entry): entry is readonly [string, LowCodePageDataSource] => Boolean(entry))
    : allEntries;

  const results = await Promise.allSettled(
    entries.map(([key, source]) => invokeDataSource(key, source, true))
  );
  const errors: string[] = [];

  results.forEach((result, index) => {
    const [key] = entries[index];

    if (result.status === 'fulfilled') {
      const [resolvedKey, value] = result.value;
      if (typeof value !== 'undefined') {
        resolvedData[resolvedKey] = value;
      }
      return;
    }

    errors.push(
      `${key}: ${result.reason instanceof Error ? result.reason.message : host.t('runtime.errors.refreshDataSource')}`
    );
  });

  if (errors.length) {
    message.value = errors[0];
    messageClass.value = 'lc-error';
  }

  return errors;
}

function getChildBlocks(block: LowCodePageBlock): LowCodePageBlock[] {
  const children: LowCodePageBlock[] = [];

  if ('blocks' in block && Array.isArray(block.blocks)) {
    children.push(...block.blocks);
  }

  if (block.kind === 'tabs') {
    children.push(...block.tabs.flatMap((tab) => tab.blocks));
  }

  if (isOverlayBlock(block) && Array.isArray(block.overlays)) {
    children.push(...block.overlays);
  }

  return children;
}

function flattenBlocks(blocks: LowCodePageBlock[]): LowCodePageBlock[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(getChildBlocks(block))]);
}

function flattenPageBlocks(schema: LowCodePageRecord['schema']) {
  return flattenBlocks([
    ...schema.blocks,
    ...(schema.overlays ?? []),
  ]);
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

function deriveFormModel(
  block: LowCodePageFormBlock | LowCodePageSearchFormBlock,
  row?: Record<string, unknown>
) {
  const nextModel = {
    ...(block.initialValues ?? {})
  };

  if (row && isRecord(row)) {
    Object.assign(nextModel, row);
  }

  return nextModel;
}

async function loadPageData(nextPage: LowCodePageRecord) {
  const entries = Object.entries(nextPage.schema.dataSources ?? {});

  clearObject(resolvedData);
  clearObject(formModels);
  clearObject(searchFilters);

  for (const block of flattenPageBlocks(nextPage.schema)) {
    if (block.kind === 'form' || block.kind === 'searchForm') {
      formModels[block.id] = deriveFormModel(block);
    }
  }

  if (!entries.length) {
    return [];
  }

  const results = await Promise.allSettled(
    entries.map(([key, source]) => invokeDataSource(key, source))
  );

  const errors: string[] = [];

  results.forEach((result, index) => {
    const [key] = entries[index];

    if (result.status === 'fulfilled') {
      const [resolvedKey, value] = result.value;
      if (typeof value !== 'undefined') {
        resolvedData[resolvedKey] = value;
      }
      return;
    }

    errors.push(
      `${key}: ${result.reason instanceof Error ? result.reason.message : host.t('runtime.errors.loadDataSource')}`
    );
  });

  for (const block of flattenPageBlocks(nextPage.schema)) {
    if (block.kind !== 'form') continue;

    const source = getDataSource(block.sourceKey ?? block.submitSourceKey);
    const sourceValue = source ? resolvedData[source.key] : undefined;

    if (isRecord(sourceValue)) {
      formModels[block.id] = {
        ...formModels[block.id],
        ...sourceValue
      };
    }
  }

  return errors;
}

const loadingText = computed(() =>
  dataLoading.value ? host.t('runtime.loadingDataSources') : ''
);

watch(
  [() => props.page, () => host.getRoute().fullPath],
  async ([nextPage]) => {
    const currentLoad = ++loadSequence;
    message.value = '';
    dataLoading.value = true;

    try {
      const errors = await loadPageData(nextPage);

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

const unsubscribeRuntimeEvents = runtimeEventBus.subscribe(handlePublishedRuntimeEvent);
onBeforeUnmount(unsubscribeRuntimeEvents);

async function publishRuntimeEvent(event: LowCodeRuntimeEvent) {
  try {
    await runtimeEventBus.publish(event);
    await props.onRuntimeEvent?.(event);
  } catch (error) {
    reportRuntimeDirectiveError(error);
  }
}

async function handlePublishedRuntimeEvent(event: LowCodeRuntimeEvent) {
  const directives = resolveEventDirectives(event, props.page.schema.eventHandlers);

  for (const directive of directives) {
    try {
      await executeRuntimeDirective(directive, event);
    } catch (error) {
      reportRuntimeDirectiveError(error);
      break;
    }
  }
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

  resolvedData[sourceKey] = mergeDataSourceValue(
    resolvedData[sourceKey],
    resolveDirectiveData(directive, event),
    directive,
    event
  );
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
    resolvedData[target.sourceKey] = mergeDataSourceValue(
      resolvedData[target.sourceKey],
      nextValue,
      directive,
      event
    );
    return;
  }

  target.rows = mergeDataSourceValue(
    target.rows ?? [],
    nextValue,
    directive,
    event
  ) as Record<string, unknown>[];
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
    formModels[blockId] = { ...nextValues };
    return;
  }

  formModels[blockId] = {
    ...(formModels[blockId] ?? {}),
    ...nextValues,
  };
}

function applyFormFieldDirective(
  directive: LowCodeRuntimeDirective,
  event: LowCodeRuntimeEvent
) {
  const blockId = resolveDirectiveString(directive.blockId, event, event.blockId ?? '');
  const field = resolveDirectiveString(directive.field, event);
  if (!blockId || !field) return;

  formModels[blockId] = {
    ...(formModels[blockId] ?? {}),
    [field]: resolveRuntimeValue(directive.value, directiveScope(event)),
  };
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
  searchFilters[sourceKey] =
    directive.mode === 'replace'
      ? { ...values }
      : {
          ...(searchFilters[sourceKey] ?? {}),
          ...values,
        };

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
  event: LowCodeRuntimeEvent
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

  const result = await host
    .getServiceApi()
    .invoke(serviceName, serviceMethod, request.postData);
  const assignTo = resolveDirectiveString(directive.assignTo, event);

  if (assignTo) {
    resolvedData[assignTo] = mergeDataSourceValue(
      resolvedData[assignTo],
      result,
      directive,
      event
    );
  }

  if (directive.refreshSourceKeys?.length) {
    await refreshDataSources(
      directive.refreshSourceKeys
        .map((key) => resolveDirectiveString(key, event))
        .filter(Boolean)
    );
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
  const result = await openLowCodeGlobalDialog({
    ...config,
    model,
    form: config.form
      ? {
          ...config.form,
          model,
        }
      : config.form,
  });
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
  event: LowCodeRuntimeEvent
) {
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
    refreshDataSources,
    refreshPage: () => loadPageData(props.page).then(() => undefined),
    invokeServiceDirective,
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
  values: Record<string, unknown>
) {
  if (block.kind !== 'form') return;
  const source = getDataSource(block.submitSourceKey ?? block.sourceKey);

  if (!source) {
    return;
  }

  loadingBlockId.value = block.id;
  message.value = '';

  try {
    const request = resolveDataSourceRequest(source.key, source);
    const serviceName = request.serviceName;
    const serviceMethod = source.saveMethod ?? request.serviceMethod;

    if (!serviceName || !serviceMethod || (!source.saveMethod && isListItemsRequest(serviceName, serviceMethod))) {
      throw new Error(`Data source ${source.key} is missing save service.`);
    }

    await host.getServiceApi().invoke(serviceName, serviceMethod, {
      ...(source.postData ?? {}),
      ...values
    });
    message.value = host.t('runtime.form.saved');
    messageClass.value = 'lc-help';
    await loadPageData(props.page);
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
  if (action.route) {
    await host.getRouter().push(resolveRuntimeRoute(action.route, values));
    return;
  }

  if (action.code === 'submit') {
    await handleFormSubmit(block, values);
  }
}

async function handleToolbarAction(action: LowCodeAction) {
  if (action.route) {
    await host.getRouter().push(resolveRuntimeRoute(action.route));
    return;
  }

  if (action.code === 'refresh') {
    await loadPageData(props.page);
  }
}

async function handleSearchSubmit(
  block: LowCodePageSearchFormBlock,
  values: Record<string, unknown>
) {
  if (!block.targetSourceKey) return;
  searchFilters[block.targetSourceKey] = { ...values };
  await refreshDataSources([block.targetSourceKey]);
}

async function handleSearchAction(
  block: LowCodePageSearchFormBlock,
  action: LowCodeAction,
  values: Record<string, unknown>
) {
  if (action.type === 'reset' && block.targetSourceKey) {
    searchFilters[block.targetSourceKey] = {};
    await refreshDataSources([block.targetSourceKey]);
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
  const editRelation = findPageRelation('edit', block);
  const relationRoute = editRelation ? resolveRelationRoute(editRelation, block, row) : '';

  if (relationRoute) {
    await host.getRouter().push(relationRoute);
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

  formModels[formBlock.id] = deriveFormModel(formBlock, row);
  message.value = '';
}

async function handleGridDelete(
  block: LowCodePageGridBlock,
  row: Record<string, unknown>
) {
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
</style>
