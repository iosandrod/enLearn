<template>
  <vxe-pulldown
    ref="pulldownRef"
    class="lc-base-info"
    :disabled="disabled"
    :popup-config="popupConfig"
    @visible-change="handleVisibleChange"
  >
    <vxe-input
      :id="field.field"
      v-bind="inputProps"
      :model-value="displayValue"
      :disabled="disabled"
      :readonly="readonly"
      :editable="!inputReadonly"
      :suffix-icon="suffixIcon"
      @focus="openPanel"
      @suffix-click="openPanel"
      @update:model-value="handleInput"
    />

    <template #dropdown>
      <div class="lc-base-info-panel" :style="panelStyle">
        <div v-if="searchable" class="lc-base-info-panel__search">
          <vxe-input
            v-model="keyword"
            clearable
            prefix-icon="vxe-icon-search"
            :placeholder="searchPlaceholder"
          />
        </div>

        <div v-if="errorMessage" class="lc-base-info-panel__message is-error" role="alert">
          {{ errorMessage }}
        </div>

        <vxe-grid
          v-else
          class="lc-base-info-panel__grid"
          :border="true"
          :stripe="true"
          :loading="loading"
          :data="rows"
          :columns="gridColumns"
          :height="gridHeight"
          :show-overflow="'tooltip'"
          :row-config="rowConfig"
          :empty-text="emptyText"
          @cell-dblclick="handleRowDblclick"
        />
      </div>
    </template>
  </vxe-pulldown>
</template>

<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';
import type { VxePulldownInstance } from 'vxe-pc-ui';
import { useLowCodeHost } from '../../../core/host';
import { getLowCodePage } from '../../../runtime/lowcode-pages';
import { normalizeLowCodeGridColumns } from '../../../utils/lowcode';
import type {
  LowCodeGridColumn,
  LowCodePageDataSource,
  LowCodePageGridBlock,
  LowCodeRelateInfoConfig,
} from '../../../types/lowcode';
import type { LowCodeFormMaterialProps } from '../types';
import {
  extractRelateInfoRows,
  filterRelateInfoRows,
  findRelateInfoGrid,
  getRelateInfoDisplayValueTarget,
  isRelateInfoRecord,
  mapRelateInfoRow,
  normalizeRelateInfoMappings,
  readRelateInfoDisplayValue,
  readRelateInfoPath,
  readRelateInfoString,
  readRelateInfoStringArray,
  resolveRelateInfoColumns,
  type RelateInfoRow,
} from './relate-info';

type RelateInfoPatchPayload = {
  values: Record<string, unknown>;
  row: RelateInfoRow | null;
};

type ResolvedSource = {
  serviceName: string;
  serviceMethod: string;
  postData: Record<string, unknown>;
  resultPath?: string;
  pageGrid?: LowCodePageGridBlock;
  localRows?: RelateInfoRow[];
  tableName?: string;
  entityMetadata?: RelateInfoRow;
};

const DEFAULT_POPUP_WIDTH = 880;
const DEFAULT_GRID_HEIGHT = 320;

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: unknown];
  patchModel: [payload: RelateInfoPatchPayload];
  select: [payload: { row: RelateInfoRow; values: Record<string, unknown> }];
}>();

const host = useLowCodeHost();
const pulldownRef = ref<VxePulldownInstance>();
const displayValue = ref<unknown>('');
const keyword = ref('');
const rows = ref<RelateInfoRow[]>([]);
const columns = ref<LowCodeGridColumn[]>([]);
const loading = ref(false);
const panelVisible = ref(false);
const errorMessage = ref('');
const loaded = ref(false);
const metadata = ref<unknown[]>([]);
let resolvedSource: ResolvedSource | undefined;
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestSequence = 0;
let displayRequestSequence = 0;
let activeRequestKey = '';

const config = computed<LowCodeRelateInfoConfig>(() => {
  const value = props.field.props?.relateInfoConfig;
  return isRelateInfoRecord(value) ? value as LowCodeRelateInfoConfig : {};
});

const inputProps = computed(() => {
  const result = { ...(props.field.props ?? {}) };
  delete result.relateInfoConfig;
  delete result.filterable;
  delete result.readonly;
  delete result.disabled;
  return result;
});

const disabled = computed(() => props.field.props?.disabled === true);
const readonly = computed(() => props.field.props?.readonly === true);
const inputReadonly = computed(() => readonly.value || config.value.allowInput !== true);
const suffixIcon = computed(() =>
  readRelateInfoString(inputProps.value.suffixIcon, 'vxe-icon-search')
);
const searchable = computed(() => config.value.searchable !== false);
const searchPlaceholder = computed(() =>
  readRelateInfoString(config.value.searchPlaceholder, '搜索关联资料')
);
const emptyText = computed(() => loading.value ? '加载中' : '暂无数据');
const rowConfig = computed(() => ({
  keyField: readRelateInfoString(config.value.rowKey, 'id'),
  isCurrent: true,
}));
const popupWidth = computed(() => config.value.popupWidth ?? DEFAULT_POPUP_WIDTH);
const popupConfig = computed(() => ({
  trigger: 'default' as const,
  transfer: true,
  width: popupWidth.value,
  className: 'lc-base-info-pulldown',
}));
const panelStyle = computed(() => ({
  width: typeof popupWidth.value === 'number'
    ? `${popupWidth.value}px`
    : popupWidth.value,
}));
const gridHeight = computed(() => config.value.popupHeight ?? DEFAULT_GRID_HEIGHT);
const gridColumns = computed(() => normalizeLowCodeGridColumns(columns.value));
const displayValueField = computed(() =>
  getRelateInfoDisplayValueTarget(config.value, props.field.field)
);
const selectedValueIdentity = computed(() => JSON.stringify({
  modelValue: props.modelValue,
  displayValue: props.formValues?.[displayValueField.value],
  displayValueField: displayValueField.value,
  source: sourceIdentity.value,
  valueField: config.value.valueField,
  displayField: config.value.displayField,
}));
const sourceIdentity = computed(() => JSON.stringify({
  sourceType: config.value.sourceType,
  tableName: config.value.tableName,
  viewName: config.value.viewName,
  entityCode: config.value.entityCode,
  pageId: config.value.pageId,
  pageCode: config.value.pageCode,
  pageRoute: config.value.pageRoute,
  lowcodePage: config.value.lowcodePage,
  sourceKey: config.value.sourceKey,
  serviceName: config.value.serviceName,
  serviceMethod: config.value.serviceMethod,
  postData: config.value.postData,
}));

watch(
  [() => props.modelValue, () => props.formValues?.[displayValueField.value]],
  ([modelValue, labelValue]) => {
    if (panelVisible.value && keyword.value) return;
    displayValue.value = labelValue ?? modelValue ?? '';
  },
  { immediate: true },
);

watch(sourceIdentity, () => {
  requestSequence += 1;
  displayRequestSequence += 1;
  activeRequestKey = '';
  loading.value = false;
  loaded.value = false;
  resolvedSource = undefined;
  rows.value = [];
  columns.value = [];
  metadata.value = [];
  errorMessage.value = '';
});

watch(selectedValueIdentity, () => {
  const modelValue = props.modelValue;
  const labelValue = props.formValues?.[displayValueField.value];
  if (
    labelValue !== null &&
    typeof labelValue !== 'undefined' &&
    String(labelValue).trim()
  ) {
    return;
  }
  if (modelValue === '' || modelValue === null || typeof modelValue === 'undefined') return;
  void loadSelectedDisplayValue();
}, { immediate: true });

watch(keyword, () => {
  if (!panelVisible.value) return;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void loadRows(true), 260);
});

onBeforeUnmount(() => {
  requestSequence += 1;
  displayRequestSequence += 1;
  if (searchTimer) clearTimeout(searchTimer);
});

function tableNameFromEntityCode(entityCode: string) {
  return entityCode === 'users' ? 'profiles' : entityCode;
}

function serviceNameFromTable(tableName: string) {
  const name = tableName.split('.').at(-1) ?? '';
  if (name.startsWith('planning_')) return 'planning';
  if (name.startsWith('mes_')) return 'mes';
  return 'admin';
}

function supportsSearch(serviceName: string, serviceMethod: string) {
  return serviceMethod === 'listItems' && [
    'admin',
    'lowcode',
    'planning',
    'mes',
  ].includes(serviceName);
}

function resolvePageLookup(current: LowCodeRelateInfoConfig) {
  const lowcodePage = readRelateInfoString(current.lowcodePage);
  return {
    id: readRelateInfoString(current.pageId),
    code: readRelateInfoString(current.pageCode, lowcodePage),
    route: readRelateInfoString(current.pageRoute),
  };
}

function isPageSource(current: LowCodeRelateInfoConfig) {
  const lookup = resolvePageLookup(current);
  return current.sourceType === 'lowcode_page' ||
    current.sourceType === 'lowcodePage' ||
    Boolean(lookup.id || lookup.code || lookup.route);
}

function readMetadataSchema(value: unknown) {
  if (isRelateInfoRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return isRelateInfoRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function metadataFields(value: unknown) {
  const schema = readMetadataSchema(value);
  return Array.isArray(schema.fields) ? schema.fields : [];
}

async function loadEntityMetadata(entityCode: string, tableName: string) {
  const tableBaseName = tableName.split('.').at(-1) ?? '';
  const lookups: Array<Record<string, string> | undefined> = [
    entityCode ? { code: entityCode } : undefined,
    tableName ? { table_name: tableName } : undefined,
    tableName && !tableName.includes('.') ? { table_name: `public.${tableName}` } : undefined,
    tableBaseName ? { code: tableBaseName } : undefined,
  ];

  for (const filters of lookups.filter(
    (candidate): candidate is Record<string, string> => Boolean(candidate),
  )) {
    const result = await host.getServiceApi().invoke<unknown>(
      'admin',
      'listItems',
      {
        resource: 'admin_entities',
        filters,
        limit: 1,
      },
    );
    const entity = extractRelateInfoRows(result)[0];
    if (entity) return entity;
  }

  return undefined;
}

function resolveEntityRequest(
  current: LowCodeRelateInfoConfig,
  entity: RelateInfoRow | undefined,
) {
  const schema = readMetadataSchema(entity?.schema);
  const entityCode = readRelateInfoString(current.entityCode, readRelateInfoString(entity?.code));
  const tableName = readRelateInfoString(
    current.tableName ?? current.viewName,
    readRelateInfoString(entity?.table_name ?? entity?.tableName,
      entityCode ? tableNameFromEntityCode(entityCode) : ''),
  );
  const serviceName = readRelateInfoString(
    current.serviceName,
    readRelateInfoString(schema.service, serviceNameFromTable(tableName || entityCode)),
  );
  const serviceMethod = readRelateInfoString(
    current.serviceMethod,
    readRelateInfoString(schema.listMethod, 'listItems'),
  );
  const resource = readRelateInfoString(
    current.resource,
    readRelateInfoString(schema.resource, entityCode || tableName.split('.').at(-1)),
  );

  return {
    serviceName,
    serviceMethod,
    tableName,
    postData: {
      ...(isRelateInfoRecord(current.postData) ? current.postData : {}),
      ...(resource && serviceName !== 'admin' ? { resource } : {}),
      ...(entityCode && serviceName === 'admin' ? { entityCode } : {}),
      ...(tableName ? { tableName } : {}),
    },
  };
}

function resolveSourceRequest(
  source: LowCodePageDataSource,
  overrides: LowCodeRelateInfoConfig,
) {
  const sourcePostData = isRelateInfoRecord(source.postData) ? source.postData : {};
  const overridePostData = isRelateInfoRecord(overrides.postData) ? overrides.postData : {};
  const entityCode = readRelateInfoString(
    overrides.entityCode ?? source.entityCode ?? source.entity_code ??
      overridePostData.entityCode ?? sourcePostData.entityCode,
  );
  const tableName = readRelateInfoString(
    overrides.tableName ?? overrides.viewName ?? source.tableName ?? source.table_name ??
      source.viewName ?? overridePostData.tableName ?? sourcePostData.tableName,
    entityCode ? tableNameFromEntityCode(entityCode) : '',
  );
  const hasTableTarget = Boolean(tableName || entityCode);
  const serviceName = readRelateInfoString(
    overrides.serviceName,
    readRelateInfoString(source.serviceName, hasTableTarget ? 'admin' : ''),
  );
  const resource = readRelateInfoString(
    overrides.resource,
    readRelateInfoString(
      overridePostData.resource ?? sourcePostData.resource,
      entityCode || tableName.split('.').at(-1),
    ),
  );

  return {
    serviceName,
    serviceMethod: readRelateInfoString(
      overrides.serviceMethod,
      readRelateInfoString(source.serviceMethod, hasTableTarget ? 'listItems' : ''),
    ),
    postData: {
      ...sourcePostData,
      ...overridePostData,
      ...(resource && serviceName !== 'admin' ? { resource } : {}),
      ...(entityCode ? { entityCode } : {}),
      ...(tableName ? { tableName } : {}),
    },
    tableName,
  };
}

async function resolveConfiguredSource(): Promise<ResolvedSource> {
  const current = config.value;

  if (isPageSource(current)) {
    const lookup = resolvePageLookup(current);
    const page = await getLowCodePage(host.getServiceApi(), lookup);
    const pageGrid = findRelateInfoGrid(page.schema, readRelateInfoString(current.sourceKey));
    const sourceEntries = Object.entries(page.schema.dataSources ?? {});
    const fallbackSourceKey = sourceEntries.find(([, source]) => {
      const postData = isRelateInfoRecord(source.postData) ? source.postData : {};
      return Boolean(
        source.tableName || source.table_name || source.viewName ||
        source.entityCode || source.entity_code ||
        postData.tableName || postData.table_name ||
        postData.entityCode || postData.entity_code
      );
    })?.[0] ?? sourceEntries[0]?.[0];
    const sourceKey = readRelateInfoString(
      current.sourceKey,
      readRelateInfoString(pageGrid?.sourceKey, fallbackSourceKey),
    );
    const source = sourceKey ? page.schema.dataSources?.[sourceKey] : undefined;

    if (!source) {
      if (Array.isArray(pageGrid?.rows)) {
        return {
          serviceName: '',
          serviceMethod: '',
          postData: {},
          pageGrid,
          localRows: pageGrid.rows.filter(isRelateInfoRecord),
        };
      }
      throw new Error('关联页面未配置可用的表格数据源。');
    }

    const request = resolveSourceRequest(source, current);
    return {
      ...request,
      resultPath: readRelateInfoString(current.resultPath),
      pageGrid,
    };
  }

  const resource = readRelateInfoString(current.resource);
  const resourceEntityCode = resource.split('.').at(-1) ?? resource;
  let entityCode = readRelateInfoString(current.entityCode, resourceEntityCode);
  let tableName = readRelateInfoString(
    current.tableName ?? current.viewName,
    resource || (entityCode ? tableNameFromEntityCode(entityCode) : ''),
  );
  if (!tableName && !entityCode) {
    throw new Error('请在 relateInfoConfig 中配置业务资源或低代码页面。');
  }

  let entityMetadata: RelateInfoRow | undefined;
  try {
    entityMetadata = await loadEntityMetadata(entityCode, tableName);
    entityCode ||= readRelateInfoString(entityMetadata?.code);
    tableName ||= readRelateInfoString(
      entityMetadata?.table_name ?? entityMetadata?.tableName,
      entityCode ? tableNameFromEntityCode(entityCode) : '',
    );
  } catch {
    // Explicit service and table configuration remains usable without metadata access.
  }
  const request = resolveEntityRequest({
    ...current,
    entityCode,
    tableName,
  }, entityMetadata);

  return {
    ...request,
    resultPath: readRelateInfoString(current.resultPath),
    entityMetadata,
  };
}

function configuredSearchFields() {
  const configured = Array.isArray(config.value.searchFields)
    ? config.value.searchFields.map((field) => readRelateInfoString(field)).filter(Boolean)
    : [];
  const searchField = readRelateInfoString(config.value.searchField);
  if (searchField) configured.unshift(searchField);
  if (configured.length) return [...new Set(configured)];

  return readRelateInfoStringArray(config.value.displayField);
}

function createRequestPostData(source: ResolvedSource) {
  const pageSizeValue = Number(config.value.pageSize);
  const pageSize = Number.isFinite(pageSizeValue) && pageSizeValue > 0
    ? Math.min(1000, Math.round(pageSizeValue))
    : 100;
  const postData: Record<string, unknown> = {
    ...source.postData,
    limit: pageSize,
    pageSize,
  };
  const requiredFilters = postData.requiredFilters ?? postData.required_filters;
  const requiredFilterNames = Array.isArray(requiredFilters)
    ? requiredFilters.map((field) => readRelateInfoString(field)).filter(Boolean)
    : [];
  if (requiredFilterNames.length && isRelateInfoRecord(postData.filters)) {
    const filters = { ...postData.filters };
    requiredFilterNames.forEach((field) => delete filters[field]);
    if (Object.keys(filters).length) postData.filters = filters;
    else delete postData.filters;
  }
  delete postData.page;
  delete postData.offset;
  delete postData.requiredFilters;
  delete postData.required_filters;
  const search = keyword.value.trim();
  const searchFields = configuredSearchFields();

  if (
    search &&
    searchFields.length &&
    supportsSearch(source.serviceName, source.serviceMethod)
  ) {
    postData.search = search;
    postData.searchFields = searchFields;
  }

  return postData;
}

async function loadSelectedDisplayValue() {
  const expectedValue = props.modelValue;
  const sequence = ++displayRequestSequence;

  try {
    let source = resolvedSource;
    if (!source) {
      source = await resolveConfiguredSource();
      if (
        sequence !== displayRequestSequence ||
        !Object.is(props.modelValue, expectedValue)
      ) return;
      resolvedSource = source;
    }

    const valueField = readRelateInfoString(config.value.valueField, 'id');
    let selectedRow: RelateInfoRow | undefined;

    if (source.localRows) {
      selectedRow = source.localRows.find((row) =>
        Object.is(readRelateInfoPath(row, valueField), expectedValue) ||
          String(readRelateInfoPath(row, valueField) ?? '') === String(expectedValue)
      );
    } else if (source.serviceName && source.serviceMethod) {
      const postData = createRequestPostData(source);
      const filters = isRelateInfoRecord(postData.filters) ? postData.filters : {};
      delete postData.search;
      delete postData.searchFields;
      postData.filters = { ...filters, [valueField]: expectedValue };
      postData.limit = 1;
      postData.pageSize = 1;
      selectedRow = extractRelateInfoRows(await host.getServiceApi().invoke(
        source.serviceName,
        source.serviceMethod,
        postData,
      ), source.resultPath)[0];
    }

    if (
      sequence !== displayRequestSequence ||
      !Object.is(props.modelValue, expectedValue) ||
      !selectedRow
    ) {
      return;
    }
    const label = readRelateInfoDisplayValue(selectedRow, config.value, props.field.field);
    if (label === null || typeof label === 'undefined') return;
    displayValue.value = label;
    const displayTarget = displayValueField.value;
    if (displayTarget && displayTarget !== props.field.field) {
      emit('patchModel', { values: { [displayTarget]: label }, row: selectedRow });
    }
  } catch {
    // The stored value remains visible when a display-label lookup is unavailable.
  }
}

async function loadMetadata(source: ResolvedSource) {
  if (source.pageGrid) return [];
  const entityFields = metadataFields(source.entityMetadata?.schema);
  if (entityFields.length) return entityFields;
  if (!source.tableName) return [];
  try {
    const value = await host.getServiceApi().invoke<unknown[]>(
      'lowcode',
      'listTableColumns',
      { tableName: source.tableName },
    );
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

async function loadRows(force = false) {
  const requestKey = `${sourceIdentity.value}\u0000${keyword.value.trim()}`;
  if (loading.value && activeRequestKey === requestKey) return;
  if (!force && loaded.value) return;
  const sequence = ++requestSequence;
  activeRequestKey = requestKey;
  loading.value = true;
  errorMessage.value = '';

  try {
    let source = resolvedSource;
    if (!source) {
      const nextSource = await resolveConfiguredSource();
      if (sequence !== requestSequence) return;
      resolvedSource = nextSource;
      source = nextSource;
    }
    const metadataPromise = loadMetadata(source);
    let nextRows: RelateInfoRow[];

    if (source.localRows) {
      nextRows = filterRelateInfoRows(
        source.localRows,
        keyword.value,
        configuredSearchFields(),
      );
    } else {
      if (!source.serviceName || !source.serviceMethod) {
        throw new Error('关联数据源缺少 serviceName 或 serviceMethod。');
      }
      const result = await host.getServiceApi().invoke(
        source.serviceName,
        source.serviceMethod,
        createRequestPostData(source),
      );
      nextRows = extractRelateInfoRows(result, source.resultPath);
      if (keyword.value.trim()) {
        nextRows = filterRelateInfoRows(
          nextRows,
          keyword.value,
          configuredSearchFields(),
        );
      }
    }

    const nextMetadata = await metadataPromise;
    if (sequence !== requestSequence) return;
    metadata.value = nextMetadata;
    rows.value = nextRows;
    columns.value = resolveRelateInfoColumns(
      config.value,
      source.pageGrid,
      metadata.value,
      nextRows,
    );
    loaded.value = true;
    await nextTick();
  } catch (error) {
    if (sequence !== requestSequence) return;
    rows.value = [];
    columns.value = [];
    errorMessage.value = error instanceof Error ? error.message : '关联资料加载失败。';
  } finally {
    if (sequence === requestSequence) {
      activeRequestKey = '';
      loading.value = false;
    }
  }
}

async function openPanel() {
  if (disabled.value || readonly.value) return;
  if (!pulldownRef.value?.isPanelVisible()) {
    await pulldownRef.value?.showPanel();
  }
  if (!loaded.value || config.value.reloadOnFocus === true) {
    void loadRows(true);
  }
}

function closePanel(instance = pulldownRef.value) {
  return instance?.hidePanel() ?? Promise.resolve();
}

function handleVisibleChange({ visible }: { visible: boolean }) {
  panelVisible.value = visible;
  if (!visible) {
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = undefined;
    }
    const hadKeyword = Boolean(keyword.value.trim());
    if (hadKeyword) {
      requestSequence += 1;
      activeRequestKey = '';
      loading.value = false;
      loaded.value = false;
    }
    keyword.value = '';
    const labelValue = props.formValues?.[displayValueField.value];
    displayValue.value = labelValue ?? props.modelValue ?? '';
  }
}

function clearMappedValues() {
  const values: Record<string, unknown> = Object.fromEntries(
    normalizeRelateInfoMappings(config.value, props.field.field).map((mapping) => [
      mapping.targetField,
      '',
    ]),
  );
  const displayTarget = displayValueField.value;
  if (displayTarget && displayTarget !== props.field.field) values[displayTarget] = '';
  emit('patchModel', { values, row: null });
}

function handleInput(value: unknown) {
  const isEmpty = value === '' || value === null || typeof value === 'undefined';
  if (inputReadonly.value) {
    if (!readonly.value && isEmpty) {
      displayValue.value = '';
      keyword.value = '';
      clearMappedValues();
    }
    return;
  }
  displayValue.value = value ?? '';
  keyword.value = String(value ?? '');

  if (isEmpty) {
    clearMappedValues();
    return;
  }

  const currentMapping = normalizeRelateInfoMappings(config.value, props.field.field).find(
    (mapping) => mapping.targetField === props.field.field,
  );
  const displayFields = readRelateInfoStringArray(config.value.displayField);
  if (!displayFields.length || (
    displayFields.length === 1 && displayFields[0] === currentMapping?.sourceField
  )) {
    emit('update:modelValue', value);
  }
}

async function handleRowDblclick(payload: unknown) {
  if (disabled.value || readonly.value) return;
  if (!isRelateInfoRecord(payload) || !isRelateInfoRecord(payload.row)) return;
  const pulldown = pulldownRef.value;
  const row = payload.row;
  const values = mapRelateInfoRow(row, config.value, props.field.field);
  displayValue.value = readRelateInfoDisplayValue(row, config.value, props.field.field) ?? '';
  const closePromise = closePanel(pulldown);
  emit('patchModel', { values, row });
  emit('select', { row, values });
  await closePromise;
}
</script>

<style>
.lc-base-info,
.lc-base-info > .vxe-pulldown--content,
.lc-base-info .vxe-input {
  width: 100%;
  min-width: 0;
}

.lc-base-info-panel {
  display: grid;
  padding: 8px;
  gap: 8px;
  box-sizing: border-box;
  background: #fff;
}

.lc-base-info-panel__search {
  width: min(360px, 100%);
}

.lc-base-info-panel__message {
  display: grid;
  min-height: 96px;
  place-items: center;
  padding: 16px;
  color: #475569;
  font-size: 13px;
  text-align: center;
}

.lc-base-info-panel__message.is-error {
  color: #b42318;
}

.lc-base-info-panel__grid {
  width: 100%;
  min-width: 0;
}
</style>
