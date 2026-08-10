<template>
  <section class="lc-grid">
    <div v-if="schema.toolbar?.length" class="lc-grid-toolbar">
      <vxe-button
        v-for="action in schema.toolbar ?? []"
        :key="action.code"
        :status="action.status"
        @click="handleToolbar(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>

    <div class="lc-grid__table-scroll" :style="tableScrollStyle">
      <vxe-grid
        ref="vxeGridRef"
        class="lc-grid__table"
        v-bind="gridConfig"
        :data="rows"
        :loading="loading"
        @current-row-change="handleCurrentChange"
        @cell-click="(payload) => handleGenericGridEvent('cellClick', payload)"
        @cell-menu="(payload) => handleGenericGridEvent('cellMenu', payload)"
        @cell-dblclick="handleCellDblclick"
        @row-dblclick="handleRowDblclick"
        @radio-change="(payload) => handleGenericGridEvent('radioChange', payload)"
        @checkbox-change="(payload) => handleGenericGridEvent('checkboxChange', payload)"
        @checkbox-all="(payload) => handleGenericGridEvent('checkboxAll', payload)"
        @sort-change="(payload) => handleGenericGridEvent('sortChange', payload)"
        @filter-change="(payload) => handleGenericGridEvent('filterChange', payload)"
        @page-change="(payload) => handleGenericGridEvent('pageChange', payload)"
        @menu-click="handleMenuClick"
        @toolbar-button-click="(payload) => handleToolbarGridEvent('toolbarButtonClick', payload)"
        @toolbar-tool-click="(payload) => handleToolbarGridEvent('toolbarToolClick', payload)"
        @proxy-query="(payload) => handleGenericGridEvent('proxyQuery', payload)"
        @proxy-delete="(payload) => handleGenericGridEvent('proxyDelete', payload)"
        @proxy-save="(payload) => handleGenericGridEvent('proxySave', payload)"
        @form-submit="(payload) => handleGenericGridEvent('formSubmit', payload)"
        @form-reset="(payload) => handleGenericGridEvent('formReset', payload)"
        @zoom="(payload) => handleGenericGridEvent('zoom', payload)"
      >
        <template #actions="{ row }">
          <template v-if="customRowActions.length">
            <vxe-button
              v-for="action in customRowActions"
              :key="action.code"
              size="mini"
              :status="action.status"
              :disabled="action.disabled"
              @click="emitRowAction(action, row)"
            >
              <i v-if="action.icon" :class="action.icon" aria-hidden="true" />
              {{ action.label }}
            </vxe-button>
          </template>
          <vxe-button
            v-if="!customRowActions.length && schema.rowActions?.edit !== false"
            size="mini"
            status="primary"
            @click="$emit('edit', row)"
          >
            {{ schema.rowActions?.editLabel ?? 'Edit' }}
          </vxe-button>
          <vxe-button
            v-if="!customRowActions.length && schema.rowActions?.delete !== false"
            size="mini"
            status="danger"
            @click="$emit('delete', row)"
          >
            {{ schema.rowActions?.deleteLabel ?? 'Delete' }}
          </vxe-button>
        </template>
      </vxe-grid>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import type { VxeGridInstance } from 'vxe-table';
import {
  mergeSystemTableOptions,
  resolveSystemTableConfig,
  useSystemSettings,
} from '../core/system-settings';
import { normalizeLowCodeGridColumns } from '../utils/lowcode';
import type {
  LowCodeGridAction,
  LowCodeGridRowAction,
  LowCodeGridSchema,
} from '../types/lowcode';

const props = defineProps<{
  schema: LowCodeGridSchema;
  rows: Record<string, unknown>[];
  loading?: boolean;
  fill?: boolean;
}>();

const emit = defineEmits<{
  toolbar: [code: string];
  edit: [row: Record<string, unknown>];
  delete: [row: Record<string, unknown>];
  rowAction: [payload: { action: LowCodeGridRowAction; row: Record<string, unknown> }];
  rowCurrentChange: [payload: { row: Record<string, unknown> | null; rawEvent: Record<string, unknown> }];
  rowDblclick: [payload: { row: Record<string, unknown>; rawEvent: Record<string, unknown> }];
  cellDblclick: [payload: { row: Record<string, unknown>; rawEvent: Record<string, unknown> }];
  gridEvent: [payload: LowCodeGridEventPayload];
}>();
const systemSettings = useSystemSettings();
const vxeGridRef = ref<VxeGridInstance<Record<string, unknown>>>();

type LowCodeGridEventPayload = {
  key: string;
  row?: Record<string, unknown>;
  actionCode?: string;
  rawEvent: Record<string, unknown>;
};

const customRowActions = computed(() => props.schema.rowActions?.actions ?? []);

const tableScrollStyle = computed(() => {
  if (props.fill) return undefined;

  const height = props.schema.grid.height;
  if (typeof height === 'number') {
    return { minHeight: `${height}px` };
  }

  if (typeof height === 'string' && height.trim() && height.trim() !== '100%') {
    return { minHeight: height.trim() };
  }

  return undefined;
});

const gridConfig = computed(() => {
  const baseGrid = props.schema.grid as Record<string, unknown>;
  const columns = props.schema.grid.columns;
  const resolvedGrid = mergeSystemTableOptions(
    baseGrid,
    resolveSystemTableConfig(systemSettings),
  );
  const nextConfig: Record<string, unknown> = columns?.length
    ? {
        ...resolvedGrid,
        columns: normalizeLowCodeGridColumns(columns) as unknown[]
      }
    : { ...resolvedGrid };

  if (
    props.schema.events?.rowCurrentChange ||
    props.schema.events?.currentRowChange ||
    props.schema.eventNames?.rowCurrentChange
  ) {
    const rowConfig = isRecord(nextConfig.rowConfig) ? nextConfig.rowConfig : {};
    nextConfig.rowConfig = {
      ...rowConfig,
      isCurrent: rowConfig.isCurrent ?? true,
    };
  }

  if (isRecord(nextConfig.treeConfig)) {
    delete nextConfig.stripe;
  }

  if (props.fill) {
    nextConfig.height = '100%';
  }

  return nextConfig;
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRow(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  return isRecord(payload.row) ? payload.row : undefined;
}

function readChangedRow(payload: unknown) {
  if (!isRecord(payload)) return null;
  if ('newValue' in payload) {
    return isRecord(payload.newValue) ? payload.newValue : null;
  }
  return readRow(payload) ?? null;
}

function readActionCode(payload: unknown) {
  if (!isRecord(payload)) return '';

  const code = payload.code;
  if (typeof code === 'string' && code.trim()) return code.trim();

  const button = payload.button;
  if (isRecord(button) && typeof button.code === 'string' && button.code.trim()) {
    return button.code.trim();
  }

  const tool = payload.tool;
  if (isRecord(tool) && typeof tool.code === 'string' && tool.code.trim()) {
    return tool.code.trim();
  }

  return '';
}

function handleToolbar(action: LowCodeGridAction) {
  emit('toolbar', action.code);
}

function emitRowAction(action: LowCodeGridRowAction, row: Record<string, unknown>) {
  emit('rowAction', { action, row });
}

function handleCurrentChange(payload: unknown) {
  emit('rowCurrentChange', {
    row: readChangedRow(payload),
    rawEvent: isRecord(payload) ? payload : {},
  });
}

function handleGenericGridEvent(key: string, payload: unknown) {
  const rawEvent = isRecord(payload) ? payload : {};
  const row = readRow(payload);

  emit('gridEvent', {
    key,
    ...(row ? { row } : {}),
    rawEvent,
  });
}

function handleToolbarGridEvent(key: string, payload: unknown) {
  const rawEvent = isRecord(payload) ? payload : {};
  const actionCode = readActionCode(payload);

  emit('gridEvent', {
    key,
    ...(actionCode ? { actionCode } : {}),
    rawEvent,
  });
}

function handleMenuClick(payload: unknown) {
  const rawEvent = isRecord(payload) ? payload : {};
  const menu = isRecord(rawEvent.menu) ? rawEvent.menu : {};
  const row = readRow(payload);
  const actionCode = typeof menu.code === 'string' ? menu.code.trim() : '';
  const menuType = typeof rawEvent.type === 'string' ? rawEvent.type : '';
  const key =
    menuType === 'header'
      ? 'headerMenuClick'
      : menuType === 'body'
        ? 'bodyMenuClick'
        : menuType === 'footer'
          ? 'footerMenuClick'
          : 'menuClick';

  emit('gridEvent', {
    key,
    ...(row ? { row } : {}),
    ...(actionCode ? { actionCode } : {}),
    rawEvent,
  });
}

function handleRowDblclick(payload: unknown) {
  const row = readRow(payload);
  if (!row) return;

  emit('rowDblclick', {
    row,
    rawEvent: isRecord(payload) ? payload : {},
  });
}

function handleCellDblclick(payload: unknown) {
  const row = readRow(payload);
  if (!row) return;

  const rawEvent = isRecord(payload) ? payload : {};
  emit('cellDblclick', { row, rawEvent });
  emit('rowDblclick', { row, rawEvent });
}

async function validate() {
  const grid = vxeGridRef.value;
  if (!grid) return false;

  try {
    const errors = await grid.fullValidate(true);
    return !errors || Object.keys(errors).length === 0;
  } catch {
    return false;
  }
}

async function clearValidation() {
  await vxeGridRef.value?.clearValidate();
}

async function setCurrentRow(row: Record<string, unknown> | null) {
  const grid = vxeGridRef.value;
  if (!grid) return;
  if (row) await grid.setCurrentRow(row);
  else await grid.clearCurrentRow();
}

defineExpose({
  validate,
  clearValidation,
  setCurrentRow,
});
</script>

<style scoped>
.lc-grid {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
}

.lc-grid__table-scroll {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
}

.lc-grid__table {
  width: 100%;
  max-width: 100%;
}
</style>
