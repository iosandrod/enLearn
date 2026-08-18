<template>
  <div class="mobile-list-block">
    <div v-if="block.title || block.description" class="list-header">
      <span v-if="block.title" class="list-title">{{ block.title }}</span>
      <span v-if="block.description" class="list-description">{{ block.description }}</span>
    </div>

    <div v-if="!rows.length" class="empty-list">
      <span class="empty-list-text">暂无数据</span>
    </div>

    <button
      v-for="(row, rowIndex) in rows"
      :key="rowKey(row)"
      :class="['list-card', { 'is-selected': rowKey(row) === selectedRowKey }]"
      @click="publishCurrentRow(row)"
    >
      <div
        v-for="(column, columnIndex) in visibleColumns"
        :key="String(column.field ?? column.title)"
        :class="['list-field', { 'is-primary': columnIndex === 0 }]"
      >
        <span v-if="columnIndex > 0" class="list-field-label">{{ column.title }}</span>
        <span class="list-field-value">{{ readCell(row, column, rowIndex) }}</span>
      </div>

      <div v-if="visibleRowActions(row).length" class="row-actions">
        <button
          v-for="action in visibleRowActions(row)"
          :key="action.code"
          :aria-label="action.label"
          :aria-busy="isRowActionExecuting(action)"
          :aria-disabled="isRowActionDisabled(action, row) || isRowActionExecuting(action)"
          :style="{ opacity: isRowActionExecuting(action) ? 0.55 : 1 }"
          :class="['row-action', { 'is-executing': isRowActionExecuting(action) }]"
          :disabled="isRowActionDisabled(action, row) || isRowActionExecuting(action)"
          @click.stop="publishRowAction(action, row)"
        >
          <span class="row-action-text">{{ action.label }}</span>
        </button>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from '@vue/runtime-core';

import type {
  MobileMaterialEmits,
  MobileMaterialProps,
  SharedLowCodeAction,
} from '../types';
import {
  isLowCodeRowActionDisabled,
  visibleLowCodeRowActions,
} from '../../../../packages/lowcode-framework/src/runtime/row-action-state';
import { isLowCodeEditPageReadonly } from '../../../../packages/lowcode-framework/src/runtime/edit-page-mode';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

const rows = computed<Record<string, unknown>[]>(() => {
  const source = props.block.sourceKey ? props.resolvedData[props.block.sourceKey] : props.block.rows;
  if (Array.isArray(source)) return source as Record<string, unknown>[];
  if (source && typeof source === 'object' && 'rows' in source) {
    const nested = (source as { rows?: unknown }).rows;
    return Array.isArray(nested) ? nested as Record<string, unknown>[] : [];
  }
  if (source && typeof source === 'object' && 'data' in source) {
    const nested = (source as { data?: unknown }).data;
    return Array.isArray(nested) ? nested as Record<string, unknown>[] : [];
  }
  return [];
});

type GridColumn = {
  type?: string;
  field?: string;
  title?: string;
  visible?: boolean;
  formatter?: { type?: string; emptyText?: string };
};

const columns = computed<GridColumn[]>(() =>
  (props.block.schema?.grid?.columns ?? []).filter((column: GridColumn) => column.visible !== false)
);
const visibleColumns = computed(() => {
  const fieldColumns = columns.value.filter((column) => column.type !== 'seq');
  return fieldColumns.slice(0, 6);
});
const selectedRowKey = ref('');

const rowActions = computed<SharedLowCodeAction[]>(() => {
  const config = props.block.schema?.rowActions ?? {};
  const actions = [...(config.actions ?? [])];

  if (config.edit) actions.unshift({ code: 'edit', label: config.editLabel ?? '编辑' });
  if (config.delete) actions.push({ code: 'delete', label: config.deleteLabel ?? '删除', status: 'danger' });
  return actions;
});

function visibleRowActions(row: Record<string, unknown>) {
  return visibleLowCodeRowActions(rowActions.value, row);
}

function isRowActionDisabled(action: SharedLowCodeAction, row: Record<string, unknown>) {
  return isLowCodeEditPageReadonly(props.editPageMode)
    || isLowCodeRowActionDisabled(action, row);
}

function isRowActionExecuting(_action: SharedLowCodeAction) {
  return props.executingActionKeys.size > 0;
}

function rowKey(row: Record<string, unknown>) {
  const keyField = props.block.schema?.grid?.rowConfig?.keyField ?? 'id';
  return String(row[keyField] ?? JSON.stringify(row));
}

function readCell(row: Record<string, unknown>, column: GridColumn, rowIndex: number) {
  if (column.type === 'seq') return String(rowIndex + 1);
  const value = column.field ? row[column.field] : undefined;
  if (value === undefined || value === null || value === '') {
    return column.formatter?.emptyText ?? '--';
  }
  if (column.formatter?.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('zh-CN') : String(value);
  }
  return String(value);
}

function publishCurrentRow(row: Record<string, unknown>) {
  selectedRowKey.value = rowKey(row);
  const directives = props.block.schema?.events?.rowCurrentChange
    ?? props.block.schema?.events?.currentRowChange
    ?? [];
  emit('runtimeEvent', {
    name: props.block.schema?.eventNames?.rowCurrentChange ?? 'grid.rowCurrentChange',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      row,
      directives,
    },
  });
}

function publishRowAction(action: SharedLowCodeAction, row: Record<string, unknown>) {
  if (isRowActionDisabled(action, row) || isRowActionExecuting(action)) return;
  emit('runtimeEvent', {
    name: action.eventName ?? 'grid.rowAction',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      action,
      actionCode: action.code,
      directives: action.directives ?? [],
      row,
    },
  });
}
</script>

<style scoped>
.mobile-list-block {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.list-header {
  margin-bottom: 10px;
  display: flex;
  flex-direction: column;
}

.list-title {
  color: #17212b;
  font-size: 16px;
  line-height: 24px;
  font-weight: bold;
}

.list-description {
  margin-top: 3px;
  color: #68737d;
  font-size: 12px;
  line-height: 18px;
}

.list-card {
  width: 100%;
  padding-top: 12px;
  padding-right: 12px;
  padding-bottom: 12px;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  background-color: #f7f9fa;
  border-radius: 5px;
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: #1e67d6;
  text-align: left;
}

.list-card.is-selected {
  background-color: #eef5ff;
  border-left-color: #0b7957;
}

.list-card + .list-card {
  margin-top: 9px;
}

.list-field {
  min-height: 26px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.list-field.is-primary {
  min-height: 31px;
  justify-content: flex-start;
}

.list-field-label {
  color: #7a858f;
  font-size: 11px;
}

.list-field-value {
  margin-left: 12px;
  color: #35414c;
  font-size: 12px;
  text-align: right;
}

.list-field.is-primary .list-field-value {
  margin-left: 0;
  color: #17212b;
  font-size: 14px;
  line-height: 21px;
  font-weight: bold;
  text-align: left;
}

.row-actions {
  margin-top: 8px;
  padding-top: 8px;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #e1e6e9;
}

.row-action {
  height: 32px;
  margin-left: 8px;
  padding-right: 12px;
  padding-left: 12px;
  align-items: center;
  justify-content: center;
  background-color: #e7edf5;
  border-radius: 4px;
}

.row-action.is-executing {
  opacity: 0.55;
}

.row-action-text {
  color: #1e4f91;
  font-size: 12px;
}

.empty-list {
  padding: 22px;
  align-items: center;
}

.empty-list-text {
  color: #7a858f;
  font-size: 12px;
}
</style>
