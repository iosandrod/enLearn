<template>
  <dialog
    v-if="block.open !== false"
    class="reference-dialog"
    transparent
    :animated="false"
    animation-type="none"
    @request-close="closeReference"
  >
    <div class="reference-mask" @click="closeReference">
      <div class="reference-panel" @click.stop>
        <div class="reference-heading">
          <div class="reference-heading-copy">
            <span class="reference-title">{{ block.title || page?.title || '选择业务数据' }}</span>
            <span v-if="block.description" class="reference-description">{{ block.description }}</span>
          </div>
          <button class="reference-close" aria-label="关闭" @click="closeReference">
            <span class="reference-close-text">×</span>
          </button>
        </div>

        <div class="reference-content">
          <div v-if="loading" class="reference-state">
            <span class="reference-state-text">正在加载选择页面...</span>
          </div>
          <div v-else-if="errorMessage" class="reference-state is-error">
            <span class="reference-state-text">{{ errorMessage }}</span>
          </div>
          <MobilePageRenderer
            v-else-if="page"
            :page="page"
            :service-api="serviceApi"
            @runtime-event="handleNestedEvent"
          />
        </div>

        <div class="reference-footer">
          <span class="reference-selection">
            {{ selectedRow ? '已选择 1 条记录' : '请选择一条记录' }}
          </span>
          <button class="reference-action" @click="closeReference">
            <span class="reference-action-text">取消</span>
          </button>
          <button
            class="reference-action is-primary"
            :disabled="requireSelection && !selectedRow"
            @click="confirmReference"
          >
            <span class="reference-action-text is-primary">确定</span>
          </button>
        </div>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from '@vue/runtime-core';

import MobilePageRenderer from '../mobile-page-renderer.vue';
import type { MobileServiceApi } from '../service-api';
import type { MobilePageRecord, MobileRuntimeEvent } from '../types';

const props = defineProps<{
  block: Record<string, any>;
  serviceApi: MobileServiceApi;
}>();
const emit = defineEmits<{
  close: [];
  result: [payload: Record<string, unknown>];
}>();

const page = ref<MobilePageRecord | null>(null);
const selectedRow = ref<Record<string, unknown> | null>(null);
const selectedEvent = ref<MobileRuntimeEvent | null>(null);
const loading = ref(false);
const errorMessage = ref('');
const requireSelection = computed(() => props.block.requireSelection !== false);
const selectionEvents = computed(() => new Set(
  (Array.isArray(props.block.selectOn) ? props.block.selectOn : [props.block.selectOn ?? 'rowCurrentChange'])
    .map(String),
));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function eventKey(event: MobileRuntimeEvent) {
  const key = event.payload?.key;
  return typeof key === 'string' && key ? key : event.name.replace(/^grid\./, '');
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';
  try {
    if (props.block.page && isRecord(props.block.page)) {
      page.value = props.block.page as MobilePageRecord;
      return;
    }
    const code = String(props.block.pageCode ?? props.block.code ?? '').trim();
    const route = String(props.block.pageRoute ?? '').trim();
    page.value = code
      ? await props.serviceApi.getPage(code)
      : route
        ? await props.serviceApi.getPageByRoute(route)
        : null;
    if (!page.value) throw new Error('页面引用未配置 pageCode 或 pageRoute。');
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '选择页面加载失败';
  } finally {
    loading.value = false;
  }
}

function handleNestedEvent(event: MobileRuntimeEvent) {
  const row = isRecord(event.payload?.row) ? event.payload?.row : null;
  if (!row) return;
  selectedRow.value = { ...row };
  selectedEvent.value = event;
  if (selectionEvents.value.has(eventKey(event)) && props.block.immediate === true) {
    confirmReference();
  }
}

function confirmReference() {
  if (requireSelection.value && !selectedRow.value) return;
  const valueField = String(props.block.valueField ?? '').trim();
  const labelField = String(props.block.labelField ?? '').trim();
  emit('result', {
    action: selectedRow.value ? String(props.block.resultAction ?? 'select') : 'confirm',
    row: selectedRow.value,
    ...(valueField && selectedRow.value ? { value: selectedRow.value[valueField] } : {}),
    ...(labelField && selectedRow.value ? { label: selectedRow.value[labelField] } : {}),
    page: page.value,
    event: selectedEvent.value,
  });
}

function closeReference() {
  emit('close');
}

onMounted(loadPage);
</script>

<style scoped>
.reference-dialog {
  width: 100%;
  height: 100%;
}

.reference-mask {
  flex: 1;
  padding: 10px;
  align-items: center;
  justify-content: center;
  background-color: rgba(13, 25, 34, 0.54);
}

.reference-panel {
  width: 100%;
  max-width: 960px;
  height: 94%;
  display: flex;
  flex-direction: column;
  background-color: #eef2f4;
  border-radius: 6px;
}

.reference-heading,
.reference-footer {
  min-height: 62px;
  padding-right: 12px;
  padding-left: 14px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #ffffff;
}

.reference-heading {
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #d9e0e4;
}

.reference-heading-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.reference-title {
  color: #172b38;
  font-size: 16px;
  line-height: 23px;
  font-weight: bold;
}

.reference-description,
.reference-selection {
  color: #71818b;
  font-size: 11px;
  line-height: 17px;
}

.reference-close {
  width: 38px;
  height: 38px;
  margin-left: 8px;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 4px;
}

.reference-close-text {
  color: #405761;
  font-size: 26px;
  line-height: 30px;
}

.reference-content {
  flex: 1;
  min-height: 0;
  display: flex;
}

.reference-state {
  flex: 1;
  padding: 24px;
  align-items: center;
  justify-content: center;
}

.reference-state.is-error .reference-state-text {
  color: #a3382d;
}

.reference-state-text {
  color: #68737d;
  font-size: 13px;
  line-height: 20px;
  text-align: center;
}

.reference-footer {
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #d9e0e4;
}

.reference-selection {
  flex: 1;
}

.reference-action {
  min-width: 72px;
  height: 40px;
  margin-left: 8px;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 4px;
}

.reference-action.is-primary {
  background-color: #176ea8;
}

.reference-action-text {
  color: #405761;
  font-size: 13px;
}

.reference-action-text.is-primary {
  color: #ffffff;
}
</style>
