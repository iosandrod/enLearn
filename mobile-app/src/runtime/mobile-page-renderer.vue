<template>
  <div class="mobile-page-runtime">
    <div v-if="message" :class="['runtime-message', `is-${messageTone}`]">
      <span class="runtime-message-text">{{ message }}</span>
    </div>

    <ul class="mobile-page-list" :numberOfRows="page.schema.blocks.length">
      <li
        v-for="block in page.schema.blocks"
        :key="block.id"
        class="mobile-page-block-row"
        :type="block.kind"
      >
        <MobileBlockRenderer
          :block="block"
          :resolved-data="resolvedData"
          :form-models="formModels"
          :active-action-codes="activeActionCodes"
          @runtime-event="handleRuntimeEvent"
        />
      </li>
      <li v-if="loadingSources" class="mobile-page-block-row" type="loading">
        <div class="data-loading">
          <span class="data-loading-text">正在同步页面数据...</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from '@vue/runtime-core';

import { resolveRuntimeValue } from './expression';
import MobileBlockRenderer from './mobile-block-renderer.vue';
import { registerDefaultMobileMaterials } from './materials';
import {
  isMobileAuthenticationError,
  type MobileServiceApi,
} from './service-api';
import type {
  MobileFormModels,
  MobilePageRecord,
  MobileRuntimeEvent,
  SharedLowCodeDirective,
} from './types';

registerDefaultMobileMaterials();

const props = defineProps<{
  page: MobilePageRecord;
  serviceApi: MobileServiceApi;
}>();

const emit = defineEmits<{
  navigate: [path: string];
  pageTitleChange: [title: string];
  authenticationRequired: [];
}>();

const resolvedData = reactive<Record<string, unknown>>({});
const formModels = reactive<MobileFormModels>({});
const searchFilters = reactive<Record<string, Record<string, unknown>>>({});
const activeActionCodes = reactive<Record<string, string>>({});
const loadingSources = ref(false);
const message = ref('');
const messageTone = ref<'success' | 'error' | 'info' | 'warning'>('info');
let messageTimer: ReturnType<typeof setTimeout> | undefined;

function collectBlocks(blocks: MobilePageRecord['schema']['blocks']): MobilePageRecord['schema']['blocks'] {
  return blocks.flatMap((block) => {
    const nested = Array.isArray(block.blocks) ? collectBlocks(block.blocks) : [];
    const tabBlocks = Array.isArray(block.tabs)
      ? block.tabs.flatMap((tab: { blocks?: MobilePageRecord['schema']['blocks'] }) =>
          collectBlocks(tab.blocks ?? [])
        )
      : [];
    return [block, ...nested, ...tabBlocks];
  });
}

function clearRecord(record: Record<string, unknown>) {
  Object.keys(record).forEach((key) => delete record[key]);
}

function initializeResolvedData() {
  clearRecord(resolvedData);
  Object.keys(formModels).forEach((key) => delete formModels[key]);
  Object.keys(searchFilters).forEach((key) => delete searchFilters[key]);
  Object.keys(activeActionCodes).forEach((key) => delete activeActionCodes[key]);
  Object.assign(resolvedData, props.page.resolvedData ?? {});

  collectBlocks(props.page.schema.blocks).forEach((block) => {
    if (block.kind === 'form' || block.kind === 'searchForm') {
      formModels[block.id] = { ...(block.initialValues ?? {}) };
    }
  });
}

async function loadDataSources(sourceKeys?: string[], force = false) {
  const sources = props.page.schema.dataSources ?? {};
  const entries = Object.entries(sources).filter(([key, source]) =>
    (!sourceKeys || sourceKeys.includes(key)) && (force || source.autoLoad !== false)
  );

  if (!entries.length) return;

  loadingSources.value = true;
  try {
    await Promise.all(entries.map(async ([key, source]) => {
      const configuredFilters = source.postData?.filters;
      const filters = {
        ...(configuredFilters && typeof configuredFilters === 'object' && !Array.isArray(configuredFilters)
          ? configuredFilters
          : {}),
        ...(searchFilters[key] ?? {}),
      };
      resolvedData[key] = await props.serviceApi.loadDataSource(
        source,
        Object.keys(filters).length ? { filters } : {}
      );
    }));
  } catch (error) {
    if (isMobileAuthenticationError(error)) {
      emit('authenticationRequired');
      return;
    }
    showMessage(
      error instanceof Error ? error.message : '页面数据加载失败',
      'error'
    );
  } finally {
    loadingSources.value = false;
  }
}

function showMessage(
  text: string,
  tone: 'success' | 'error' | 'info' | 'warning' = 'info'
) {
  if (messageTimer) clearTimeout(messageTimer);
  message.value = text;
  messageTone.value = tone;
  messageTimer = setTimeout(() => {
    message.value = '';
  }, 2800);
}

function eventScope(event: MobileRuntimeEvent) {
  return {
    data: resolvedData,
    forms: formModels,
    event: event.payload ?? {},
    row: event.payload?.row,
    values: event.payload?.values,
  };
}

async function executeDirective(directive: SharedLowCodeDirective, event: MobileRuntimeEvent) {
  if (directive.disabled) return;

  const scope = eventScope(event);
  switch (directive.type) {
    case 'showMessage': {
      const text = String(resolveRuntimeValue(directive.message ?? directive.value ?? '', scope));
      showMessage(text, directive.status ?? 'info');
      break;
    }
    case 'navigate':
    case 'routePush': {
      const path = String(resolveRuntimeValue(directive.route ?? directive.value ?? '', scope));
      emit('navigate', path);
      break;
    }
    case 'refreshPage':
      initializeResolvedData();
      await loadDataSources();
      break;
    case 'refreshDataSource':
    case 'refreshDataSources':
      await loadDataSources(
        directive.sourceKeys ?? (directive.sourceKey ? [directive.sourceKey] : undefined),
        true
      );
      break;
    case 'invokeService': {
      if (!directive.serviceName || !directive.serviceMethod) return;
      const result = await props.serviceApi.invoke(
        directive.serviceName,
        directive.serviceMethod,
        resolveRuntimeValue(directive.postData ?? {}, scope) as Record<string, unknown>
      );
      if (directive.assignTo) resolvedData[directive.assignTo] = result;
      if (directive.refreshSourceKeys?.length) {
        await loadDataSources(directive.refreshSourceKeys, true);
      }
      break;
    }
    case 'setDataSource':
    case 'updateDataSource': {
      const key = directive.sourceKey ?? '';
      if (key) resolvedData[key] = resolveRuntimeValue(directive.value, scope);
      break;
    }
    case 'setSearchFilters': {
      const key = directive.sourceKey ?? '';
      if (!key) break;
      const value = resolveRuntimeValue(directive.values ?? directive.value ?? {}, scope);
      const filters = value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : {};
      searchFilters[key] = directive.mode === 'replace'
        ? { ...filters }
        : { ...(searchFilters[key] ?? {}), ...filters };
      await loadDataSources([key], true);
      break;
    }
    default:
      console.warn(`Unsupported mobile directive: ${directive.type}`);
  }
}

function matchesHandler(event: MobileRuntimeEvent, handler: NonNullable<MobilePageRecord['schema']['eventHandlers']>[number]) {
  return (
    !handler.disabled &&
    (handler.event === '*' || handler.event === event.name) &&
    (!handler.blockId || handler.blockId === event.blockId) &&
    (!handler.blockKind || handler.blockKind === event.blockKind) &&
    (!handler.actionCode || handler.actionCode === event.payload?.actionCode)
  );
}

async function handleRuntimeEvent(event: MobileRuntimeEvent) {
  if (event.payload?.actionCode && event.blockId) {
    activeActionCodes[event.blockId] = event.payload.actionCode;
  }

  const inlineDirectives = event.payload?.directives ?? [];
  const configuredDirectives = (props.page.schema.eventHandlers ?? [])
    .filter((handler) => matchesHandler(event, handler))
    .flatMap((handler) => handler.directives);

  for (const directive of [...inlineDirectives, ...configuredDirectives]) {
    try {
      await executeDirective(directive, event);
    } catch (error) {
      if (isMobileAuthenticationError(error)) {
        emit('authenticationRequired');
        break;
      }
      showMessage(error instanceof Error ? error.message : '操作失败', 'error');
      break;
    }
  }
}

async function initializePage() {
  emit('pageTitleChange', props.page.title || props.page.schema.title || '业务页面');
  initializeResolvedData();
  await loadDataSources();
}

onMounted(initializePage);
watch(() => props.page.id, initializePage);
</script>

<style scoped>
.mobile-page-runtime {
  flex: 1;
  display: flex;
  min-height: 0;
  position: relative;
}

.mobile-page-list {
  flex: 1;
  background-color: #eef1f4;
}

.mobile-page-block-row {
  padding-top: 7px;
  padding-right: 12px;
  padding-bottom: 7px;
  padding-left: 12px;
}

.runtime-message {
  position: absolute;
  z-index: 20;
  top: 10px;
  right: 16px;
  left: 16px;
  padding-top: 10px;
  padding-right: 12px;
  padding-bottom: 10px;
  padding-left: 12px;
  border-radius: 6px;
}

.runtime-message.is-success {
  background-color: #d7f6e9;
}

.runtime-message.is-error {
  background-color: #ffe1df;
}

.runtime-message.is-warning {
  background-color: #fff1cc;
}

.runtime-message.is-info {
  background-color: #dcecff;
}

.runtime-message-text {
  color: #17212b;
  font-size: 13px;
  line-height: 19px;
}

.data-loading {
  padding: 14px;
  align-items: center;
}

.data-loading-text {
  color: #68737d;
  font-size: 12px;
}
</style>
