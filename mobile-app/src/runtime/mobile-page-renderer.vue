<template>
  <div class="mobile-page-runtime">
    <div v-if="message" :class="['runtime-message', `is-${messageTone}`]">
      <span class="runtime-message-text">{{ message }}</span>
    </div>

    <ul class="mobile-page-list" :numberOfRows="layoutBlocks.length">
      <li
        v-for="block in layoutBlocks"
        :key="block.id"
        class="mobile-page-block-row"
        :type="block.kind"
      >
        <MobileBlockRenderer
          :block="block"
          :resolved-data="resolvedData"
          :form-models="formModels"
          :active-action-codes="activeActionCodes"
          :grid-states="gridStates"
          :service-api="serviceApi"
          @runtime-event="handleRuntimeEvent"
        />
      </li>
      <li v-if="loadingSources" class="mobile-page-block-row" type="loading">
        <div class="data-loading">
          <span class="data-loading-text">正在同步页面数据...</span>
        </div>
      </li>
    </ul>

    <MobileOverlayHost
      :overlays="overlayBlocks"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      :grid-states="gridStates"
      :service-api="serviceApi"
      @runtime-event="handleRuntimeEvent"
    />

    <MobilePageReference
      v-if="pageReferenceBlock"
      :block="pageReferenceBlock"
      :service-api="serviceApi"
      @close="closePageReference"
      @result="settlePageReference"
    />

    <dialog
      v-if="confirmRequest"
      class="runtime-confirm-dialog"
      transparent
      :animated="false"
      animation-type="none"
      @request-close="settleConfirm(false)"
    >
      <div class="runtime-confirm-mask" @click="settleConfirm(false)">
        <div class="runtime-confirm-panel" @click.stop>
          <span class="runtime-confirm-title">{{ confirmRequest.title }}</span>
          <span class="runtime-confirm-copy">{{ confirmRequest.message }}</span>
          <div class="runtime-confirm-actions">
            <button class="runtime-confirm-action" @click="settleConfirm(false)">
              <span class="runtime-confirm-action-text">取消</span>
            </button>
            <button class="runtime-confirm-action is-danger" @click="settleConfirm(true)">
              <span class="runtime-confirm-action-text is-danger">{{ confirmRequest.confirmLabel }}</span>
            </button>
          </div>
        </div>
      </div>
    </dialog>

    <MobileModal
      v-if="globalDialogBlock"
      :block="globalDialogBlock"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      :grid-states="gridStates"
      :service-api="serviceApi"
      @runtime-event="handleRuntimeEvent"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from '@vue/runtime-core';
import { useRoute } from '@hippy/vue-router-next-history';

import { resolveRuntimeValue } from './expression';
import MobileBlockRenderer from './mobile-block-renderer.vue';
import MobileOverlayHost from './mobile-overlay-host.vue';
import MobileModal from './materials/mobile-modal.vue';
import MobilePageReference from './materials/mobile-page-reference.vue';
import { invokeMobileNativeCapability } from './native-capabilities';
import { uploadMesMobileAsset } from './mobile-files';
import { registerMobileBackHandler } from './mobile-back';
import { validateMobileFormValues } from './mobile-form';
import { getRuntimeConfig } from '../config';
import { readPageDataCache, writePageDataCache } from './runtime-cache';
import {
  enrichMobileMesCommandRequest,
  enqueueOfflineRequest,
  flushOfflineQueue,
  isTransientMobileWriteError,
} from './offline-queue';
import { isMobileMesCommand } from './service-request';
import { mobileNetwork } from './network-status';
import {
  allMobilePageBlocks,
  collectMobileBlocks,
  isMobileOverlayBlock,
  mobileLayoutBlocks,
  mobileOverlayBlocks,
} from './mobile-page-structure';
import { registerDefaultMobileMaterials } from './materials';
import {
  isMobileAuthenticationError,
  type MobileServiceApi,
} from './service-api';
import type {
  MobileFormModels,
  MobilePageRecord,
  MobileRuntimeBlock,
  MobileRuntimeEvent,
  MobileGridRuntimeStates,
  SharedLowCodeDirective,
} from './types';

registerDefaultMobileMaterials();
const route = useRoute();

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
const gridStates = reactive<MobileGridRuntimeStates>({});
const loadingSources = ref(false);
const message = ref('');
const messageTone = ref<'success' | 'error' | 'info' | 'warning'>('info');
let messageTimer: ReturnType<typeof setTimeout> | undefined;
const globalDialogBlock = ref<MobileRuntimeBlock | null>(null);
const pageReferenceBlock = ref<Record<string, unknown> | null>(null);
const confirmRequest = ref<{
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
} | null>(null);
const routeScope = computed(() => ({
  query: route.query as Record<string, unknown>,
  params: route.params as Record<string, unknown>,
  path: route.path,
  fullPath: route.fullPath,
}));

const layoutBlocks = computed(() => mobileLayoutBlocks(props.page));
const overlayBlocks = computed(() => mobileOverlayBlocks(props.page));

function allPageBlocks() {
  return allMobilePageBlocks(props.page);
}

function clearRecord(record: Record<string, unknown>) {
  Object.keys(record).forEach((key) => delete record[key]);
}

function normalizeDirectiveList(value: unknown): SharedLowCodeDirective[] {
  return Array.isArray(value)
    ? value.filter((item): item is SharedLowCodeDirective =>
        isRecord(item) && typeof item.type === 'string'
      )
    : [];
}

function settleConfirm(confirmed: boolean) {
  const request = confirmRequest.value;
  if (!request) return;
  confirmRequest.value = null;
  request.resolve(confirmed);
}

function closePageReference() {
  pageReferenceBlock.value = null;
}

async function settlePageReference(payload: Record<string, unknown>) {
  const block = pageReferenceBlock.value;
  pageReferenceBlock.value = null;
  if (!block) return;
  const directives = normalizeDirectiveList(block.confirmDirectives ?? block.selectDirectives);
  const eventName = String(block.resultEvent ?? block.event ?? 'reference.select');
  await handleRuntimeEvent({
    name: eventName,
    blockId: typeof block.sourceBlockId === 'string' ? block.sourceBlockId : undefined,
    blockKind: typeof block.sourceBlockKind === 'string' ? block.sourceBlockKind : undefined,
    timestamp: Date.now(),
    payload: { ...payload, directives },
  });
}

function requestConfirmation(
  title: string,
  text: string,
  confirmLabel = '确定',
) {
  return new Promise<boolean>((resolve) => {
    confirmRequest.value = {
      title,
      message: text,
      confirmLabel,
      resolve,
    };
  });
}

function initializeResolvedData() {
  clearRecord(resolvedData);
  Object.keys(formModels).forEach((key) => delete formModels[key]);
  Object.keys(searchFilters).forEach((key) => delete searchFilters[key]);
  Object.keys(activeActionCodes).forEach((key) => delete activeActionCodes[key]);
  Object.keys(gridStates).forEach((key) => delete gridStates[key]);
  Object.assign(resolvedData, props.page.resolvedData ?? {});

  allPageBlocks().forEach((block) => {
    if (block.kind === 'form' || block.kind === 'searchForm') {
      formModels[block.id] = { ...(block.initialValues ?? {}) };
    }
    if (block.kind === 'grid') {
      gridStates[block.id] = { rows: [], currentRow: null, selectedRows: [] };
    }
  });
}

function readDataSourceRecord(sourceKey: string) {
  const value = resolvedData[sourceKey];
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : undefined;
  if (isRecord(value) && Array.isArray(value.rows)) {
    return isRecord(value.rows[0]) ? value.rows[0] : undefined;
  }
  return isRecord(value) ? value : undefined;
}

function synchronizeFormsFromDataSources() {
  allPageBlocks().forEach((block) => {
    if (block.kind !== 'form' || !block.sourceKey) return;
    const record = readDataSourceRecord(block.sourceKey);
    if (record) formModels[block.id] = { ...(block.initialValues ?? {}), ...record };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRows(value: unknown) {
  if (Array.isArray(value)) return value.filter(isRecord);
  return isRecord(value) ? [value] : [];
}

function isTruthyRuntimeValue(value: unknown) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return Boolean(normalized)
      && !['false', '0', 'no', 'off', 'null', 'undefined'].includes(normalized);
  }
  return Boolean(value);
}

function mergeRuntimeValue(
  currentValue: unknown,
  nextValue: unknown,
  directive: SharedLowCodeDirective,
  event: MobileRuntimeEvent,
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
    return mode === 'append' ? [...currentRows, ...nextRows] : [...nextRows, ...currentRows];
  }
  const rowKey = String(resolveRuntimeValue(directive.rowKey ?? 'id', eventScope(event)) || 'id');
  if (mode === 'patch') {
    if (isRecord(currentValue) && isRecord(nextValue)) return { ...currentValue, ...nextValue };
    const rows = Array.isArray(currentValue) ? [...currentValue] : [];
    normalizeRows(nextValue).forEach((nextRow) => {
      const index = rows.findIndex((row) => isRecord(row) && row[rowKey] === nextRow[rowKey]);
      if (index >= 0 && isRecord(rows[index])) rows[index] = { ...rows[index], ...nextRow };
      else rows.push(nextRow);
    });
    return rows;
  }
  if (mode === 'remove') {
    const removeKeys = new Set(normalizeRows(nextValue).map((row) => row[rowKey]));
    return (Array.isArray(currentValue) ? currentValue : [])
      .filter((row) => !isRecord(row) || !removeKeys.has(row[rowKey]));
  }
  return nextValue;
}

function closeNestedOverlays(block: MobileRuntimeBlock) {
  (block.overlays ?? []).forEach((overlay) => {
    overlay.open = false;
    closeNestedOverlays(overlay);
  });
}

function setBlockOpen(blockId: string, open: boolean) {
  if (globalDialogBlock.value?.id === blockId) {
    if (!open) globalDialogBlock.value = null;
    else globalDialogBlock.value.open = true;
    return;
  }
  const block = allPageBlocks().find((item) => item.id === blockId);
  if (!block || !isMobileOverlayBlock(block)) return;
  block.open = open;
  if (!open) closeNestedOverlays(block);
}

const unregisterBackHandler = registerMobileBackHandler(() => {
  if (pageReferenceBlock.value) {
    pageReferenceBlock.value = null;
    return true;
  }
  if (globalDialogBlock.value) {
    globalDialogBlock.value = null;
    return true;
  }
  const openOverlays = allPageBlocks().filter(
    (block) => isMobileOverlayBlock(block) && block.open !== false
  );
  const topOverlay = openOverlays[openOverlays.length - 1];
  if (!topOverlay) return false;
  setBlockOpen(topOverlay.id, false);
  return true;
});

function getDataSource(key?: string) {
  return key ? props.page.schema.dataSources?.[key] : undefined;
}

function firstFormBlock() {
  return allPageBlocks().find((block) => block.kind === 'form');
}

function resolveGridEditor(block: MobileRuntimeBlock) {
  if (block.editorBlockId) {
    const target = allPageBlocks().find(
      (item) => item.id === block.editorBlockId && item.kind === 'form'
    );
    if (target) return target;
  }
  return firstFormBlock();
}

function formValuesFromRow(block: MobileRuntimeBlock, row: Record<string, unknown>) {
  const fields: Array<{ field?: unknown }> = Array.isArray(block.schema?.fields)
    ? block.schema.fields
    : [];
  const values = fields.reduce((result: Record<string, unknown>, field) => {
    const key = typeof field.field === 'string' ? field.field : '';
    if (key && Object.prototype.hasOwnProperty.call(row, key)) result[key] = row[key];
    return result;
  }, {});
  return { ...(block.initialValues ?? {}), ...values };
}

function linkedEditRoute(block: MobileRuntimeBlock, row: Record<string, unknown>) {
  const pageId = props.page.edit_page_id;
  if (!pageId) return '';
  const rowKey = String(block.schema?.grid?.rowConfig?.keyField ?? 'id');
  const rowValue = row[rowKey];
  const query = [
    `pageId=${encodeURIComponent(pageId)}`,
    `fromPage=${encodeURIComponent(props.page.code)}`,
    ...(rowValue === undefined || rowValue === null
      ? []
      : [`${encodeURIComponent(rowKey)}=${encodeURIComponent(String(rowValue))}`]),
  ].join('&');
  return `/runtime?${query}`;
}

async function handleFormSubmit(event: MobileRuntimeEvent) {
  if (!event.blockId) return;
  const block = allPageBlocks().find(
    (item) => item.id === event.blockId && item.kind === 'form'
  );
  if (!block) return;
  const source = getDataSource(block.submitSourceKey ?? block.sourceKey);
  if (!source) return;

  const values = event.payload?.values ?? {};
  const mobileSource = source as typeof source & {
    offlineWrite?: boolean;
    offline_write?: boolean;
  };
  const offlineEnabled = mobileSource.offlineWrite === true || mobileSource.offline_write === true;
  const request = props.serviceApi.prepareSaveDataSource(source, values);
  const config = getRuntimeConfig();
  if (mobileNetwork.status === 'offline') {
    if (!offlineEnabled) {
      throw new Error('当前离线，该表单未启用离线写入。');
    }
    await enqueueOfflineRequest({
      accountId: config.accountId,
      userId: config.userId,
      pageId: props.page.id,
      sourceKey: source.key,
      request,
    });
    showMessage('已保存到离线队列，联网后自动同步', 'warning');
    return;
  }

  try {
    await props.serviceApi.replay(request);
  } catch (error) {
    if (!offlineEnabled || !isTransientMobileWriteError(error)) throw error;
    await enqueueOfflineRequest({
      accountId: config.accountId,
      userId: config.userId,
      pageId: props.page.id,
      sourceKey: source.key,
      request,
    });
    showMessage('网络中断，操作已进入离线队列', 'warning');
    return;
  }
  showMessage('保存成功', 'success');
  await loadDataSources(undefined, true);
  await handleRuntimeEvent({
    name: 'form.saved',
    blockId: block.id,
    blockKind: block.kind,
    timestamp: Date.now(),
    payload: {
      sourceKey: source.key,
      values: event.payload?.values ?? {},
    },
  });
}

async function handleGridRowAction(event: MobileRuntimeEvent) {
  if (!event.blockId || !event.payload?.actionCode || !event.payload.row) return;
  const block = allPageBlocks().find(
    (item) => item.id === event.blockId && item.kind === 'grid'
  );
  if (!block) return;

  if (event.payload.actionCode === 'edit') {
    const linkedRoute = linkedEditRoute(block, event.payload.row);
    if (linkedRoute) {
      emit('navigate', linkedRoute);
      return;
    }
    const route = block.editRoute ?? block.schema?.rowActions?.editRoute;
    if (route) {
      emit('navigate', String(resolveRuntimeValue(route, eventScope(event))));
      return;
    }
    const editor = resolveGridEditor(block);
    if (editor) {
      formModels[editor.id] = formValuesFromRow(editor, event.payload.row);
      const parentOverlay = allPageBlocks().find(
        (candidate) => isMobileOverlayBlock(candidate)
          && collectMobileBlocks(candidate.blocks ?? []).some((child) => child.id === editor.id)
      );
      if (parentOverlay) setBlockOpen(parentOverlay.id, true);
    }
    return;
  }

  if (event.payload.actionCode === 'delete') {
    const source = getDataSource(block.deleteSourceKey ?? block.sourceKey);
    if (!source) return;
    const action: Record<string, unknown> = isRecord(event.payload.action)
      ? event.payload.action
      : {};
    const confirmed = await requestConfirmation(
      String(action.confirmTitle ?? '确认删除'),
      String(action.confirmMessage ?? `确定删除当前${block.title || '记录'}吗？此操作不可撤销。`),
      String(action.confirmLabel ?? '删除'),
    );
    if (!confirmed) return;
    await props.serviceApi.deleteDataSource(source, event.payload.row);
    showMessage('删除成功', 'success');
    await loadDataSources([source.key], true);
  }
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
      const resolvedPostData = resolveRuntimeValue(source.postData ?? {}, {
        data: resolvedData,
        forms: formModels,
        route: routeScope.value,
      }) as Record<string, unknown>;
      const configuredFilters = resolvedPostData.filters;
      const filters = {
        ...(configuredFilters && typeof configuredFilters === 'object' && !Array.isArray(configuredFilters)
          ? configuredFilters
          : {}),
        ...(searchFilters[key] ?? {}),
      };
      resolvedData[key] = await props.serviceApi.loadDataSource(
        { ...source, postData: resolvedPostData },
        Object.keys(filters).length ? { filters } : {}
      );
    }));
    synchronizeFormsFromDataSources();
    await writePageDataCache(
      getRuntimeConfig().accountId,
      getRuntimeConfig().userId,
      props.page.id,
      Object.fromEntries(entries.map(([key]) => [key, resolvedData[key]])),
    );
  } catch (error) {
    if (isMobileAuthenticationError(error)) {
      emit('authenticationRequired');
      return;
    }
    const cached = await readPageDataCache(
      getRuntimeConfig().accountId,
      getRuntimeConfig().userId,
      props.page.id,
    );
    const cachedValues = cached?.data ?? {};
    const restoredKeys = entries
      .map(([key]) => key)
      .filter((key) => Object.prototype.hasOwnProperty.call(cachedValues, key));
    restoredKeys.forEach((key) => {
      resolvedData[key] = cachedValues[key];
    });
    if (restoredKeys.length) {
      synchronizeFormsFromDataSources();
      showMessage('网络不可用，已显示最近一次同步的数据', 'warning');
    } else {
      showMessage(
        error instanceof Error ? error.message : '页面数据加载失败',
        'error'
      );
    }
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
  const currentForm = event.blockId ? formModels[event.blockId] ?? {} : {};
  return {
    data: resolvedData,
    forms: formModels,
    form: currentForm,
    searches: searchFilters,
    grids: gridStates,
    route: routeScope.value,
    event: event.payload ?? {},
    row: event.payload?.row,
    values: event.payload?.values,
  };
}

function openPageReference(directive: SharedLowCodeDirective, event: MobileRuntimeEvent) {
  const config = resolveRuntimeValue(
    directive.config ?? directive.value ?? {},
    eventScope(event),
  );
  if (!isRecord(config)) return;
  pageReferenceBlock.value = {
    ...config,
    sourceBlockId: event.blockId,
    sourceBlockKind: event.blockKind,
    resultEvent: directive.resultEvent ?? directive.event ?? config.resultEvent,
    confirmDirectives: directive.confirmDirectives ?? config.confirmDirectives,
    open: true,
  };
}

async function openGlobalDialog(directive: SharedLowCodeDirective, event: MobileRuntimeEvent) {
  const rawConfig = resolveRuntimeValue(
    directive.config ?? directive.value ?? {},
    eventScope(event),
  );
  if (!isRecord(rawConfig)) return;

  const id = String(rawConfig.id ?? `runtime-dialog-${Date.now()}`);
  const formConfig = isRecord(rawConfig.form) ? rawConfig.form : {};
  const formSchema = isRecord(formConfig.schema) ? formConfig.schema : {};
  const fields = Array.isArray(formSchema.fields) ? formSchema.fields : [];
  const resolvedModel = resolveRuntimeValue(
    directive.model ?? rawConfig.model ?? formConfig.model ?? {},
    eventScope(event),
  );
  const resultFormId = `${id}-form`;
  formModels[resultFormId] = isRecord(resolvedModel) ? { ...resolvedModel } : {};
  const resultEvent = String(directive.resultEvent ?? directive.event ?? 'dialog.result');

  globalDialogBlock.value = {
    id,
    kind: 'modal',
    title: String(rawConfig.title ?? '业务操作'),
    description: typeof rawConfig.description === 'string' ? rawConfig.description : undefined,
    width: rawConfig.width,
    open: true,
    showFooter: true,
    confirmLabel: String(rawConfig.confirmLabel ?? '确定'),
    cancelLabel: String(rawConfig.cancelLabel ?? '取消'),
    blocks: fields.length
      ? [{
          id: resultFormId,
          kind: 'form',
          appearance: 'plain',
          initialValues: formModels[resultFormId],
          schema: { ...formSchema, fields, actions: [] },
        }]
      : [{
          id: `${id}-message`,
          kind: 'text',
          tone: 'muted',
          content: String(rawConfig.content ?? rawConfig.message ?? ''),
        }],
    confirmDirectives: [{
      type: 'confirmGlobalDialog',
      blockId: id,
      formId: resultFormId,
      formSchema,
      event: resultEvent,
      directives: normalizeDirectiveList(directive.confirmDirectives),
    }],
    cancelDirectives: [{
      type: 'emitEvent',
      event: resultEvent,
      payload: {
        action: 'cancel',
        directives: normalizeDirectiveList(directive.cancelDirectives),
      },
    }, { type: 'closeBlock', blockId: id }],
    closeDirectives: [{ type: 'closeBlock', blockId: id }],
  };
}

async function executeDirective(directive: SharedLowCodeDirective, event: MobileRuntimeEvent) {
  if (directive.disabled) return;

  const scope = eventScope(event);
  if (directive.when !== undefined && !isTruthyRuntimeValue(resolveRuntimeValue(directive.when, scope))) {
    return;
  }
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
    case 'openGlobalDialog':
    case 'openDialog':
      await openGlobalDialog(directive, event);
      break;
    case 'openPageReferenceDialog':
    case 'openLowCodePageReferenceDialog':
    case 'openReferenceDialog':
      openPageReference(directive, event);
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
      const postData = resolveRuntimeValue(
        directive.postData ?? {},
        scope,
      ) as Record<string, unknown>;
      const mesCommand = isMobileMesCommand(directive.serviceName, directive.serviceMethod);
      let result: unknown;
      if (mesCommand) {
        const config = getRuntimeConfig();
        const request = await enrichMobileMesCommandRequest(
          props.serviceApi.prepareRequest(
            directive.serviceName,
            directive.serviceMethod,
            postData,
          ),
          config.accountId,
          config.userId,
        );
        if (mobileNetwork.status === 'offline') {
          await enqueueOfflineRequest({
            accountId: config.accountId,
            userId: config.userId,
            pageId: props.page.id,
            sourceKey: directive.sourceKey ?? '',
            request,
          });
          showMessage('操作已保存到离线队列，联网后自动同步', 'warning');
          return;
        }
        try {
          result = await props.serviceApi.replay(request);
        } catch (error) {
          if (!isTransientMobileWriteError(error)) throw error;
          await enqueueOfflineRequest({
            accountId: config.accountId,
            userId: config.userId,
            pageId: props.page.id,
            sourceKey: directive.sourceKey ?? '',
            request,
          });
          showMessage('网络中断，操作已进入离线队列', 'warning');
          return;
        }
      } else {
        result = await props.serviceApi.invoke(
          directive.serviceName,
          directive.serviceMethod,
          postData,
        );
      }
      if (directive.assignTo) resolvedData[directive.assignTo] = result;
      if (directive.refreshSourceKeys?.length) {
        await loadDataSources(directive.refreshSourceKeys, true);
      }
      break;
    }
    case 'confirmGlobalDialog': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? '', scope));
      const formId = String(resolveRuntimeValue(directive.formId ?? '', scope));
      const formSchema = isRecord(directive.formSchema) ? directive.formSchema : {};
      const values = formId ? formModels[formId] ?? {} : {};
      const errors = validateMobileFormValues(formSchema as any, values);
      const firstError = Object.values(errors)[0];
      if (firstError) {
        showMessage(firstError, 'error');
        break;
      }

      const eventName = String(resolveRuntimeValue(directive.event ?? 'dialog.result', scope));
      const followUps = normalizeDirectiveList(directive.directives);
      for (const followUp of followUps) {
        await executeDirective(followUp, {
          name: eventName,
          blockId: event.blockId,
          blockKind: event.blockKind,
          timestamp: Date.now(),
          payload: { actionCode: 'confirm', values },
        });
      }
      if (blockId) setBlockOpen(blockId, false);
      break;
    }
    case 'invokePageApi':
    case 'callPageApi': {
      const apiName = String(resolveRuntimeValue(
        directive.apiName ?? directive.api ?? directive.value ?? '',
        scope,
      ));
      const api = apiName ? props.page.schema.apis?.[apiName] : undefined;
      if (!api) throw new Error(`页面 API "${apiName}" 未声明。`);
      const directivePostData = isRecord(directive.postData) ? directive.postData : {};
      const result = await props.serviceApi.invoke(
        api.serviceName,
        api.serviceMethod,
        resolveRuntimeValue(
          { ...(api.postData ?? {}), ...directivePostData },
          scope,
        ) as Record<string, unknown>,
      );
      if (directive.assignTo) resolvedData[directive.assignTo] = result;
      break;
    }
    case 'setDataSource':
    case 'updateDataSource': {
      const key = directive.sourceKey ?? '';
      if (key) {
        const nextValue = resolveRuntimeValue(directive.value ?? directive.rows, scope);
        resolvedData[key] = mergeRuntimeValue(resolvedData[key], nextValue, directive, event);
      }
      break;
    }
    case 'setGridRows':
    case 'updateGridRows': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? event.blockId ?? '', scope));
      const block = allPageBlocks().find((item) => item.id === blockId && item.kind === 'grid');
      const key = directive.sourceKey ?? block?.sourceKey ?? '';
      if (!key) break;
      const nextValue = resolveRuntimeValue(directive.rows ?? directive.value ?? [], scope);
      resolvedData[key] = mergeRuntimeValue(resolvedData[key], nextValue, directive, event);
      break;
    }
    case 'setFormValues':
    case 'updateFormModel':
    case 'setFormData':
    case 'updateFormData': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? event.blockId ?? '', scope));
      if (!blockId) break;
      const values = resolveRuntimeValue(
        directive.values ?? directive.value ?? event.payload?.values ?? {},
        scope,
      );
      if (!isRecord(values)) break;
      formModels[blockId] = directive.mode === 'replace'
        ? { ...values }
        : { ...(formModels[blockId] ?? {}), ...values };
      break;
    }
    case 'setFormField':
    case 'updateFormField': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? event.blockId ?? '', scope));
      const field = String(resolveRuntimeValue(directive.field ?? '', scope));
      if (!blockId || !field) break;
      formModels[blockId] = {
        ...(formModels[blockId] ?? {}),
        [field]: resolveRuntimeValue(directive.value, scope),
      };
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
    case 'updateSearchFilters': {
      const key = directive.sourceKey ?? '';
      if (!key) break;
      const value = resolveRuntimeValue(directive.values ?? directive.value ?? {}, scope);
      if (!isRecord(value)) break;
      searchFilters[key] = directive.mode === 'replace'
        ? { ...value }
        : { ...(searchFilters[key] ?? {}), ...value };
      await loadDataSources([key], true);
      break;
    }
    case 'invokeNative':
    case 'scanCode':
    case 'capturePhoto':
    case 'pickImage':
    case 'pickFile': {
      const typeMap: Record<string, 'scan' | 'camera' | 'gallery' | 'file'> = {
        scanCode: 'scan',
        capturePhoto: 'camera',
        pickImage: 'gallery',
        pickFile: 'file',
      };
      const capability = typeMap[directive.type]
        ?? String(resolveRuntimeValue(directive.capability ?? directive.value ?? '', scope));
      if (!['scan', 'camera', 'gallery', 'file'].includes(capability)) {
        throw new Error(`不支持的移动原生能力：${capability}`);
      }
      const options = resolveRuntimeValue(directive.options ?? directive.postData ?? {}, scope);
      const result = await invokeMobileNativeCapability(
        capability as 'scan' | 'camera' | 'gallery' | 'file',
        isRecord(options) ? options : {},
      );
      const uploaded = isRecord(result)
        && 'uri' in result
        && directive.upload === true
        ? await uploadMesMobileAsset(
            props.serviceApi,
            result as Parameters<typeof uploadMesMobileAsset>[1],
            isRecord(directive.uploadOptions) ? directive.uploadOptions : {},
          )
        : result;
      if (directive.assignTo) resolvedData[directive.assignTo] = uploaded;
      if (directive.blockId && directive.field) {
        formModels[directive.blockId] = {
          ...(formModels[directive.blockId] ?? {}),
          [directive.field]: isRecord(uploaded) && 'value' in uploaded
            ? uploaded.value
            : isRecord(uploaded) && 'id' in uploaded
              ? uploaded.id
              : uploaded,
        };
      }
      break;
    }
    case 'emitEvent': {
      const eventName = String(resolveRuntimeValue(directive.event ?? '', scope));
      if (!eventName) break;
      const resolvedPayload = resolveRuntimeValue(
        directive.payload ?? {},
        scope,
      ) as Record<string, unknown>;
      const nestedDirectives = normalizeDirectiveList(resolvedPayload.directives);
      await handleRuntimeEvent({
        name: eventName,
        blockId: event.blockId,
        blockKind: event.blockKind,
        timestamp: Date.now(),
        payload: {
          ...resolvedPayload,
          ...(nestedDirectives.length ? { directives: nestedDirectives } : {}),
        },
      });
      break;
    }
    case 'dispatchWindowEvent':
    case 'dispatchBrowserEvent': {
      if (__PLATFORM__ !== 'web' || typeof window === 'undefined') break;
      const eventName = String(resolveRuntimeValue(
        directive.event ?? directive.eventName ?? directive.value ?? '',
        scope,
      )).trim();
      if (!eventName.startsWith('enlearn:')) {
        throw new Error('移动端浏览器事件名称必须使用 enlearn: 前缀。');
      }
      const detail = resolveRuntimeValue(directive.payload ?? {}, scope);
      window.dispatchEvent(new CustomEvent(eventName, { detail }));
      break;
    }
    case 'openBlock':
    case 'openModal': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? '', scope));
      if (blockId) setBlockOpen(blockId, true);
      break;
    }
    case 'closeBlock':
    case 'closeModal': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? '', scope));
      if (blockId) setBlockOpen(blockId, false);
      break;
    }
    case 'toggleModal': {
      const blockId = String(resolveRuntimeValue(directive.blockId ?? '', scope));
      const block = allPageBlocks().find(
        (item) => item.id === blockId && isMobileOverlayBlock(item)
      );
      if (block) setBlockOpen(blockId, block.open === false);
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

  if (event.blockId && event.blockKind === 'grid') {
    const state = gridStates[event.blockId]
      ?? { rows: [], currentRow: null, selectedRows: [] };
    const row = isRecord(event.payload?.row) ? event.payload?.row : null;
    if (event.name === 'grid.rowCurrentChange') state.currentRow = row;
    if (event.name === 'grid.radioChange') state.selectedRows = row ? [row] : [];
    if (event.name === 'grid.checkboxChange' || event.name === 'grid.checkboxAll') {
      const records = event.payload?.records
        ?? event.payload?.checkboxRecords
        ?? event.payload?.selectedRows;
      state.selectedRows = Array.isArray(records) ? records.filter(isRecord) : state.selectedRows;
    }
    const block = allPageBlocks().find((item) => item.id === event.blockId);
    const source = block?.sourceKey ? resolvedData[block.sourceKey] : block?.rows;
    state.rows = Array.isArray(source)
      ? source.filter(isRecord)
      : isRecord(source) && Array.isArray(source.rows)
        ? source.rows.filter(isRecord)
        : [];
    gridStates[event.blockId] = state;
  }

  const inlineDirectives = event.payload?.directives ?? [];
  const configuredDirectives = (props.page.schema.eventHandlers ?? [])
    .filter((handler) => matchesHandler(event, handler))
    .flatMap((handler) => handler.directives);

  const hasConfiguredDirectives = inlineDirectives.length > 0 || configuredDirectives.length > 0;

  if (event.name === 'form.submit' && !hasConfiguredDirectives) {
    try {
      await handleFormSubmit(event);
    } catch (error) {
      if (isMobileAuthenticationError(error)) emit('authenticationRequired');
      else showMessage(error instanceof Error ? error.message : '保存失败', 'error');
    }
  }

  if (event.name === 'grid.rowAction' && !hasConfiguredDirectives) {
    try {
      await handleGridRowAction(event);
    } catch (error) {
      if (isMobileAuthenticationError(error)) emit('authenticationRequired');
      else showMessage(error instanceof Error ? error.message : '操作失败', 'error');
    }
  }

  if (
    (event.name === 'toolbar.action' || event.name === 'toolbar.click' || event.name === 'buttonGroup.click')
    && event.payload?.actionCode === 'refresh'
    && !hasConfiguredDirectives
  ) {
    await loadDataSources(undefined, true);
  }

  if (
    (event.name === 'searchForm.submit' || event.name === 'searchForm.action')
    && event.blockId
  ) {
    const block = allPageBlocks().find(
      (item) => item.id === event.blockId && item.kind === 'searchForm'
    );
    const targetSourceKey = block?.targetSourceKey;
    const isReset = event.payload?.actionCode === 'reset';
    const hasInlineSearchDirective = inlineDirectives.some(
      (directive) => directive.type === 'setSearchFilters'
    );
    if (targetSourceKey && !hasInlineSearchDirective) {
      const values = event.payload?.values;
      searchFilters[targetSourceKey] = isReset
        ? {}
        : values && typeof values === 'object' && !Array.isArray(values)
          ? { ...values }
          : {};
      await loadDataSources([targetSourceKey], true);
    }
  }

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

async function synchronizePendingWrites() {
  if (mobileNetwork.status !== 'online') return;
  const config = getRuntimeConfig();
  if (!config.accountId || !config.userId) return;
  try {
    const result = await flushOfflineQueue(
      props.serviceApi,
      config.accountId,
      config.userId,
    );
    if (result.completed > 0) {
      showMessage(`已同步 ${result.completed} 条离线操作`, 'success');
      await loadDataSources(undefined, true);
    }
  } catch (error) {
    if (isMobileAuthenticationError(error)) emit('authenticationRequired');
    else showMessage(error instanceof Error ? error.message : '离线操作同步失败', 'error');
  }
}

onMounted(initializePage);
watch(() => props.page.id, initializePage);
watch(() => mobileNetwork.status, (status, previous) => {
  if (status === 'online' && previous !== 'online') void synchronizePendingWrites();
}, { immediate: true });
onBeforeUnmount(() => {
  unregisterBackHandler();
  if (messageTimer) clearTimeout(messageTimer);
});
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

.runtime-confirm-dialog {
  width: 100%;
  height: 100%;
}

.runtime-confirm-mask {
  flex: 1;
  padding: 18px;
  align-items: center;
  justify-content: center;
  background-color: rgba(13, 25, 34, 0.52);
}

.runtime-confirm-panel {
  width: 100%;
  max-width: 420px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
}

.runtime-confirm-title {
  color: #172b38;
  font-size: 16px;
  line-height: 23px;
  font-weight: bold;
}

.runtime-confirm-copy {
  margin-top: 8px;
  color: #5d6f79;
  font-size: 13px;
  line-height: 20px;
}

.runtime-confirm-actions {
  margin-top: 18px;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
}

.runtime-confirm-action {
  min-width: 72px;
  height: 40px;
  margin-left: 8px;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 4px;
}

.runtime-confirm-action.is-danger {
  background-color: #b63b36;
}

.runtime-confirm-action-text {
  color: #405761;
  font-size: 13px;
}

.runtime-confirm-action-text.is-danger {
  color: #ffffff;
}
</style>
