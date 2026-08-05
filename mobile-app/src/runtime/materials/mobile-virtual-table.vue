<template>
  <div class="virtual-table-block">
    <div v-if="block.title || block.description" class="table-heading">
      <div class="table-heading-copy">
        <span v-if="block.title" class="table-title">{{ block.title }}</span>
        <span v-if="block.description" class="table-description">{{ block.description }}</span>
      </div>
      <span class="table-count">{{ sortedRows.length }} 条</span>
    </div>

    <div
      class="table-frame"
      :style="tableFrameStyle"
      @layout="handleTableLayout"
    >
      <div class="table-header" :style="headerStyle">
        <div v-if="leftColumns.length" class="fixed-pane left-pane" :style="leftPaneStyle">
          <div class="table-row" :style="leftRowStyle">
            <button
              v-for="column in leftColumns"
              :key="column.key"
              :class="headerCellClass(column)"
              :style="cellStyle(column, true)"
              @click="toggleSort(column)"
            >
              <div
                v-if="column.selection === 'checkbox'"
                :class="selectionControlClass(allRowsSelected, someRowsSelected)"
                @click.stop="toggleAllRows"
              >
                <span v-if="allRowsSelected" class="selection-mark">✓</span>
                <span v-else-if="someRowsSelected" class="selection-mark">−</span>
              </div>
              <template v-else>
                <span class="cell-text">{{ column.title }}</span>
                <span v-if="column.sortable" class="sort-indicator">{{ sortIndicator(column) }}</span>
              </template>
            </button>
          </div>
        </div>

        <div class="center-viewport" :style="centerViewportStyle">
          <div
            v-if="visibleCenterColumns.length"
            class="table-row center-window"
            :style="centerHeaderWindowStyle"
          >
            <button
              v-for="column in visibleCenterColumns"
              :key="column.key"
              :class="headerCellClass(column)"
              :style="cellStyle(column, true)"
              @click="toggleSort(column)"
            >
              <div
                v-if="column.selection === 'checkbox'"
                :class="selectionControlClass(allRowsSelected, someRowsSelected)"
                @click.stop="toggleAllRows"
              >
                <span v-if="allRowsSelected" class="selection-mark">✓</span>
                <span v-else-if="someRowsSelected" class="selection-mark">−</span>
              </div>
              <template v-else>
                <span class="cell-text">{{ column.title }}</span>
                <span v-if="column.sortable" class="sort-indicator">{{ sortIndicator(column) }}</span>
              </template>
            </button>
          </div>
        </div>

        <div v-if="rightColumns.length" class="fixed-pane right-pane" :style="rightPaneStyle">
          <div class="table-row" :style="rightRowStyle">
            <button
              v-for="column in rightColumns"
              :key="column.key"
              :class="headerCellClass(column)"
              :style="cellStyle(column, true)"
              @click="toggleSort(column)"
            >
              <div
                v-if="column.selection === 'checkbox'"
                :class="selectionControlClass(allRowsSelected, someRowsSelected)"
                @click.stop="toggleAllRows"
              >
                <span v-if="allRowsSelected" class="selection-mark">✓</span>
                <span v-else-if="someRowsSelected" class="selection-mark">−</span>
              </div>
              <template v-else>
                <span class="cell-text">{{ column.title }}</span>
                <span v-if="column.sortable" class="sort-indicator">{{ sortIndicator(column) }}</span>
              </template>
            </button>
          </div>
        </div>
      </div>

      <div
        ref="verticalScrollRef"
        class="vertical-scroll"
        :style="verticalScrollStyle"
        :scrollEventThrottle="16"
        @scroll="handleVerticalScroll"
      >
        <div class="vertical-content" :style="verticalContentStyle">
          <div
            v-if="!sortedRows.length"
            class="empty-state"
            :style="emptyStateStyle"
          >
            <span class="empty-state-text">暂无数据</span>
          </div>

          <div
            v-for="item in visibleRows"
            :key="item.key"
            :class="['body-row-layer', { 'is-selected': item.key === selectedRowKey }]"
            :style="bodyRowStyle(item.index, item.key)"
            @click="publishCurrentRow(item.row, item.index)"
          >
            <div
              v-if="leftColumns.length"
              class="fixed-pane left-pane body-pane"
              :style="bodyPaneStyle(leftPaneStyle, item.key)"
            >
              <div class="table-row" :style="leftRowStyle">
                <div
                  v-for="column in leftColumns"
                  :key="column.key"
                  :class="bodyCellClass(column)"
                  :style="cellStyle(column)"
                  @click.stop="publishCurrentRow(item.row, item.index)"
                >
                  <button
                    v-if="column.selection"
                    :class="selectionControlClass(isRowSelected(item.key), false, column.selection)"
                    @click.stop="toggleRowSelection(item.row, item.index, column.selection)"
                  >
                    <span v-if="isRowSelected(item.key)" class="selection-mark">
                      {{ column.selection === 'radio' ? '●' : '✓' }}
                    </span>
                  </button>
                  <span v-else class="cell-text">{{ readCell(item.row, column, item.index) }}</span>
                </div>
              </div>
            </div>

            <div
              class="center-viewport body-pane"
              :style="bodyPaneStyle(centerViewportStyle, item.key)"
              @touchStart="handleCenterTouchStart"
              @touchmove="handleCenterTouchMove"
              @touchend="handleCenterTouchEnd"
              @touchcancel="handleCenterTouchEnd"
            >
              <div
                v-if="visibleCenterColumns.length"
                class="table-row center-window"
                :style="centerBodyWindowStyle"
              >
                <div
                  v-for="column in visibleCenterColumns"
                  :key="column.key"
                  :class="bodyCellClass(column)"
                  :style="cellStyle(column)"
                  @click.stop="handleCenterCellClick(item.row, item.index)"
                >
                  <button
                    v-if="column.selection"
                    :class="selectionControlClass(isRowSelected(item.key), false, column.selection)"
                    @click.stop="toggleRowSelection(item.row, item.index, column.selection)"
                  >
                    <span v-if="isRowSelected(item.key)" class="selection-mark">
                      {{ column.selection === 'radio' ? '●' : '✓' }}
                    </span>
                  </button>
                  <span v-else class="cell-text">{{ readCell(item.row, column, item.index) }}</span>
                </div>
              </div>
            </div>

            <div
              v-if="rightColumns.length"
              class="fixed-pane right-pane body-pane"
              :style="bodyPaneStyle(rightPaneStyle, item.key)"
            >
              <div class="table-row" :style="rightRowStyle">
                <template v-for="column in rightColumns" :key="column.key">
                  <div
                    v-if="column.action"
                    class="table-cell body-cell action-cell"
                    :style="cellStyle(column)"
                  >
                    <button
                      v-for="action in rowActions"
                      :key="action.code"
                      :class="['row-action', { 'is-danger': action.status === 'danger' }]"
                      :disabled="action.disabled"
                      @click.stop="publishRowAction(action, item.row)"
                    >
                      <span class="row-action-text">{{ action.label }}</span>
                    </button>
                  </div>
                  <div
                    v-else-if="column.selection"
                    class="table-cell body-cell is-center"
                    :style="cellStyle(column)"
                  >
                    <button
                      :class="selectionControlClass(isRowSelected(item.key), false, column.selection)"
                      @click.stop="toggleRowSelection(item.row, item.index, column.selection)"
                    >
                      <span v-if="isRowSelected(item.key)" class="selection-mark">
                        {{ column.selection === 'radio' ? '●' : '✓' }}
                      </span>
                    </button>
                  </div>
                  <div
                    v-else
                    :class="bodyCellClass(column)"
                    :style="cellStyle(column)"
                    @click.stop="publishCurrentRow(item.row, item.index)"
                  >
                    <span class="cell-text">{{ readCell(item.row, column, item.index) }}</span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="hasHorizontalOverflow"
        ref="horizontalScrollRef"
        class="horizontal-scroll"
        :style="horizontalScrollStyle"
        :horizontal="true"
        :scrollEnabled="true"
        :showsHorizontalScrollIndicator="true"
        :scrollEventThrottle="16"
        @scroll="handleHorizontalScroll"
      >
        <div class="horizontal-scroll-content" :style="horizontalContentStyle">
          <div class="horizontal-scroll-thumb" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from '@vue/runtime-core';
import type { CSSProperties } from 'vue';
import type { HippyElement, HippyLayoutEvent, HippyTouchEvent } from '@hippy/vue-next';

import type {
  MobileMaterialEmits,
  MobileMaterialProps,
  MobileRuntimeEvent,
  SharedLowCodeAction,
} from '../types';
import {
  createLayoutWidthScheduler,
  getWebLayoutFrameDriver,
} from '../layout-width';
import {
  buildColumnOffsets,
  fitPinnedColumns,
  formatVirtualCellValue,
  getColumnWindow,
  getRowWindow,
  normalizeVirtualColumns,
  normalizeVirtualSelectionConfig,
  partitionVirtualColumns,
  readPositiveNumber,
  sortVirtualRows,
  sumColumnWidths,
  updateVirtualSelectionKeys,
  withVirtualSelectionColumn,
  type RawGridColumn,
  type SortState,
  type VirtualTableColumn,
  type VirtualTableSelectionType,
} from '../virtual-table';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

const DEFAULT_TABLE_HEIGHT = 360;
const DEFAULT_ROW_HEIGHT = 48;
const DEFAULT_HEADER_HEIGHT = 44;
const HORIZONTAL_SCROLLBAR_HEIGHT = 18;

type RowItem = {
  row: Record<string, unknown>;
  index: number;
  key: string;
};

const tableWidth = ref(0);
const scrollTop = ref(0);
const scrollLeft = ref(0);
const selectedRowKey = ref('');
const selectedRowKeys = ref<string[]>([]);
const sortState = ref<SortState | null>(null);
const verticalScrollRef = ref<HippyElement | null>(null);
const horizontalScrollRef = ref<HippyElement | null>(null);
const centerTouchX = ref<number | null>(null);
const centerTouchStartX = ref<number | null>(null);
const centerTouchMoved = ref(false);
const suppressCenterClickUntil = ref(0);
const tableWidthScheduler = createLayoutWidthScheduler(
  () => tableWidth.value,
  (width) => {
    tableWidth.value = width;
  },
  getWebLayoutFrameDriver(),
);

const gridConfig = computed<Record<string, unknown>>(() => props.block.schema?.grid ?? {});
const tableHeight = computed(() => readPositiveNumber(
  gridConfig.value.height,
  DEFAULT_TABLE_HEIGHT,
  180,
  1200,
));
const rowHeight = computed(() => readPositiveNumber(
  gridConfig.value.rowHeight,
  DEFAULT_ROW_HEIGHT,
  34,
  120,
));
const headerHeight = computed(() => readPositiveNumber(
  gridConfig.value.headerHeight,
  DEFAULT_HEADER_HEIGHT,
  34,
  100,
));
const overscanRowCount = computed(() => Math.floor(readPositiveNumber(
  gridConfig.value.overscanRowCount,
  5,
  1,
  50,
)));
const overscanColumnCount = computed(() => Math.floor(readPositiveNumber(
  gridConfig.value.overscanColumnCount,
  2,
  1,
  20,
)));

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

const rowActions = computed<SharedLowCodeAction[]>(() => {
  const config = props.block.schema?.rowActions ?? {};
  const actions = [...(config.actions ?? [])] as SharedLowCodeAction[];
  if (config.edit) actions.unshift({ code: 'edit', label: config.editLabel ?? '编辑' });
  if (config.delete) actions.push({
    code: 'delete',
    label: config.deleteLabel ?? '删除',
    status: 'danger',
  });
  return actions;
});

const rawColumns = computed<RawGridColumn[]>(() => (
  Array.isArray(gridConfig.value.columns)
    ? gridConfig.value.columns as RawGridColumn[]
    : []
));
const explicitSelectionType = computed<VirtualTableSelectionType | undefined>(() => {
  const column = rawColumns.value.find((item) => item.type === 'checkbox' || item.type === 'radio');
  return column?.type === 'checkbox' || column?.type === 'radio' ? column.type : undefined;
});
const selectionConfig = computed(() => (
  explicitSelectionType.value
    ? { type: explicitSelectionType.value }
    : normalizeVirtualSelectionConfig(gridConfig.value.selection ?? gridConfig.value.selectionConfig)
));
const displayColumns = computed<RawGridColumn[]>(() => {
  const configured = [...withVirtualSelectionColumn(
    rawColumns.value,
    gridConfig.value.selection ?? gridConfig.value.selectionConfig,
  )];
  const hasActionColumn = configured.some((column) => column.slots?.default === 'actions');
  if (rowActions.value.length && !hasActionColumn) {
    configured.push({
      title: '操作',
      width: Math.max(104, rowActions.value.length * 62 + 16),
      fixed: 'right',
      slots: { default: 'actions' },
    });
  }
  return configured;
});
const columns = computed(() => fitPinnedColumns(
  normalizeVirtualColumns(displayColumns.value, {
    actionWidth: Math.max(104, rowActions.value.length * 62 + 16),
  }),
  tableWidth.value,
));
const columnPartitions = computed(() => partitionVirtualColumns(columns.value));
const leftColumns = computed(() => columnPartitions.value.left);
const centerColumns = computed(() => columnPartitions.value.center);
const rightColumns = computed(() => columnPartitions.value.right);
const leftWidth = computed(() => sumColumnWidths(leftColumns.value));
const centerWidth = computed(() => sumColumnWidths(centerColumns.value));
const rightWidth = computed(() => sumColumnWidths(rightColumns.value));
const centerViewportWidth = computed(() => Math.max(
  0,
  tableWidth.value - leftWidth.value - rightWidth.value,
));
const centerOffsets = computed(() => buildColumnOffsets(centerColumns.value));
const centerWindow = computed(() => getColumnWindow(
  centerOffsets.value,
  scrollLeft.value,
  centerViewportWidth.value,
  overscanColumnCount.value,
));
const visibleCenterColumns = computed(() => centerColumns.value.slice(
  centerWindow.value.start,
  centerWindow.value.end,
));
const hasHorizontalOverflow = computed(() => centerWidth.value > centerViewportWidth.value + 1);
const horizontalScrollbarHeight = computed(() => (
  hasHorizontalOverflow.value ? HORIZONTAL_SCROLLBAR_HEIGHT : 0
));
const bodyViewportHeight = computed(() => Math.max(
  1,
  tableHeight.value - headerHeight.value - horizontalScrollbarHeight.value,
));
const sortedRows = computed(() => sortVirtualRows(rows.value, sortState.value));
const selectableRowKeys = computed(() => sortedRows.value.map((row, index) => rowKey(row, index)));
const selectedRowKeySet = computed(() => new Set(selectedRowKeys.value));
const allRowsSelected = computed(() => (
  selectableRowKeys.value.length > 0
  && selectableRowKeys.value.every((key) => selectedRowKeySet.value.has(key))
));
const someRowsSelected = computed(() => (
  !allRowsSelected.value
  && selectableRowKeys.value.some((key) => selectedRowKeySet.value.has(key))
));
const rowWindow = computed(() => getRowWindow(
  sortedRows.value.length,
  scrollTop.value,
  bodyViewportHeight.value,
  rowHeight.value,
  overscanRowCount.value,
));
const visibleRows = computed<RowItem[]>(() => sortedRows.value
  .slice(rowWindow.value.start, rowWindow.value.end)
  .map((row, localIndex) => {
    const index = rowWindow.value.start + localIndex;
    return { row, index, key: rowKey(row, index) };
  }));

const tableFrameStyle = computed<CSSProperties>(() => ({ height: `${tableHeight.value}px` }));
const headerStyle = computed<CSSProperties>(() => ({ height: `${headerHeight.value}px` }));
const verticalScrollStyle = computed<CSSProperties>(() => ({
  top: `${headerHeight.value}px`,
  height: `${bodyViewportHeight.value}px`,
}));
const verticalContentStyle = computed<CSSProperties>(() => ({
  height: `${Math.max(bodyViewportHeight.value, sortedRows.value.length * rowHeight.value)}px`,
}));
const emptyStateStyle = computed<CSSProperties>(() => ({ height: `${bodyViewportHeight.value}px` }));
const leftPaneStyle = computed<CSSProperties>(() => ({ width: `${leftWidth.value}px` }));
const rightPaneStyle = computed<CSSProperties>(() => ({ width: `${rightWidth.value}px` }));
const leftRowStyle = computed<CSSProperties>(() => ({ width: `${leftWidth.value}px` }));
const rightRowStyle = computed<CSSProperties>(() => ({ width: `${rightWidth.value}px` }));
const centerViewportStyle = computed<CSSProperties>(() => ({
  left: `${leftWidth.value}px`,
  right: `${rightWidth.value}px`,
}));
const centerHeaderWindowStyle = computed<CSSProperties>(() => ({
  width: `${centerWindow.value.width}px`,
  transform: `translateX(${centerWindow.value.offset - scrollLeft.value}px)`,
}));
const centerBodyWindowStyle = centerHeaderWindowStyle;
const horizontalScrollStyle = computed<CSSProperties>(() => ({
  left: `${leftWidth.value}px`,
  right: `${rightWidth.value}px`,
  height: `${horizontalScrollbarHeight.value}px`,
}));
const horizontalContentStyle = computed<CSSProperties>(() => ({
  width: `${centerWidth.value}px`,
  height: `${horizontalScrollbarHeight.value}px`,
}));

function rowKey(row: Record<string, unknown>, index: number) {
  const rowConfig = gridConfig.value.rowConfig;
  const keyField = rowConfig && typeof rowConfig === 'object' && !Array.isArray(rowConfig)
    ? (rowConfig as Record<string, unknown>).keyField
    : undefined;
  const field = typeof keyField === 'string' && keyField.trim() ? keyField : 'id';
  const value = row[field];
  return value === undefined || value === null || value === ''
    ? `row-${index}`
    : String(value);
}

function alignClass(align: VirtualTableColumn['align']) {
  return align === 'center' ? 'is-center' : align === 'right' ? 'is-right' : 'is-left';
}

function headerCellClass(column: VirtualTableColumn) {
  return ['table-cell', 'header-cell', alignClass(column.headerAlign), {
    'is-sortable': column.sortable,
    'is-sorted': sortState.value?.key === column.key,
  }];
}

function bodyCellClass(column: VirtualTableColumn) {
  return ['table-cell', 'body-cell', alignClass(column.align)];
}

function selectionControlClass(
  checked: boolean,
  indeterminate = false,
  type?: VirtualTableSelectionType,
) {
  return ['selection-control', {
    'is-radio': (type ?? selectionConfig.value?.type) === 'radio',
    'is-checked': checked,
    'is-indeterminate': indeterminate,
  }];
}

function cellStyle(column: VirtualTableColumn, header = false): CSSProperties {
  return {
    width: `${column.width}px`,
    height: `${header ? headerHeight.value : rowHeight.value}px`,
  };
}

function currentRowBackground(key: string) {
  return key === selectedRowKey.value ? '#e8f2ff' : '#ffffff';
}

function bodyRowStyle(index: number, key: string): CSSProperties {
  return {
    top: `${index * rowHeight.value}px`,
    height: `${rowHeight.value}px`,
    backgroundColor: currentRowBackground(key),
  };
}

function bodyPaneStyle(
  paneStyle: CSSProperties,
  key: string,
): CSSProperties {
  return {
    ...paneStyle,
    backgroundColor: currentRowBackground(key),
  };
}

function readCell(row: Record<string, unknown>, column: VirtualTableColumn, rowIndex: number) {
  if (column.type === 'seq') return String(rowIndex + 1);
  const value = column.field ? row[column.field] : undefined;
  const formatted = formatVirtualCellValue(value, column.formatter);
  return formatted === null || formatted === undefined || formatted === '' ? '--' : String(formatted);
}

function handleTableLayout(event: HippyLayoutEvent) {
  tableWidthScheduler.schedule(event.width);
}

function scrollOffset(event: Event, axis: 'x' | 'y') {
  const hippyEvent = event as Event & Pick<HippyTouchEvent, 'offsetX' | 'offsetY'>;
  const value = axis === 'x' ? hippyEvent.offsetX : hippyEvent.offsetY;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function handleVerticalScroll(event: Event) {
  scrollTop.value = Math.max(0, scrollOffset(event, 'y'));
}

function handleHorizontalScroll(event: Event) {
  const maxScroll = Math.max(0, centerWidth.value - centerViewportWidth.value);
  scrollLeft.value = Math.min(maxScroll, Math.max(0, scrollOffset(event, 'x')));
}

function touchClientX(event: Event) {
  const touchEvent = event as Event & Pick<HippyTouchEvent, 'touches'>;
  const value = touchEvent.touches?.[0]?.clientX;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function handleCenterTouchStart(event: Event) {
  const clientX = touchClientX(event) ?? null;
  centerTouchX.value = clientX;
  centerTouchStartX.value = clientX;
  centerTouchMoved.value = false;
}

function handleCenterTouchMove(event: Event) {
  const nextX = touchClientX(event);
  if (nextX === undefined || centerTouchX.value === null || !hasHorizontalOverflow.value) return;

  if (
    centerTouchStartX.value !== null
    && Math.abs(nextX - centerTouchStartX.value) >= 6
  ) {
    centerTouchMoved.value = true;
  }

  const maxScroll = Math.max(0, centerWidth.value - centerViewportWidth.value);
  const nextScrollLeft = Math.min(
    maxScroll,
    Math.max(0, scrollLeft.value + centerTouchX.value - nextX),
  );
  centerTouchX.value = nextX;
  if (nextScrollLeft === scrollLeft.value) return;

  scrollLeft.value = nextScrollLeft;
  void nextTick(() => horizontalScrollRef.value?.scrollTo(nextScrollLeft, 0, false));
}

function handleCenterTouchEnd() {
  if (centerTouchMoved.value) suppressCenterClickUntil.value = Date.now() + 250;
  centerTouchX.value = null;
  centerTouchStartX.value = null;
  centerTouchMoved.value = false;
}

function resetVerticalScroll() {
  scrollTop.value = 0;
  void nextTick(() => verticalScrollRef.value?.scrollTo(0, 0, false));
}

function syncHorizontalScroll() {
  const maxScroll = Math.max(0, centerWidth.value - centerViewportWidth.value);
  const nextScrollLeft = Math.min(maxScroll, scrollLeft.value);
  if (nextScrollLeft === scrollLeft.value) return;
  scrollLeft.value = nextScrollLeft;
  void nextTick(() => horizontalScrollRef.value?.scrollTo(nextScrollLeft, 0, false));
}

function isRowSelected(key: string) {
  return selectedRowKeySet.value.has(key);
}

function handleCenterCellClick(
  row: Record<string, unknown>,
  rowIndex: number,
) {
  if (Date.now() < suppressCenterClickUntil.value) return;
  publishCurrentRow(row, rowIndex);
}

function selectedRows() {
  return sortedRows.value.filter((row, index) => selectedRowKeySet.value.has(rowKey(row, index)));
}

function publishSelectionChange(
  key: 'checkboxChange' | 'checkboxAll' | 'radioChange',
  row?: Record<string, unknown>,
  checked?: boolean,
) {
  const records = selectedRows();
  publishGridEvent(key, {
    ...(row ? { row } : {}),
    ...(checked !== undefined ? { checked } : {}),
    records,
    checkboxRecords: records,
    selectedRows: records,
    ...(key === 'radioChange' ? { newValue: records[0] ?? null } : {}),
    rawEvent: {
      ...(row ? { row } : {}),
      ...(checked !== undefined ? { checked } : {}),
      records,
      checkboxRecords: records,
      selectedRows: records,
      ...(key === 'radioChange' ? { newValue: records[0] ?? null } : {}),
    },
  });
}

function toggleRowSelection(
  row: Record<string, unknown>,
  rowIndex: number,
  type: VirtualTableSelectionType,
) {
  const key = rowKey(row, rowIndex);
  const checked = type === 'radio' || !isRowSelected(key);
  if (type === 'radio' && isRowSelected(key)) return;
  selectedRowKeys.value = updateVirtualSelectionKeys(
    selectedRowKeys.value,
    key,
    checked,
    type === 'checkbox',
  );
  publishSelectionChange(type === 'radio' ? 'radioChange' : 'checkboxChange', row, checked);
}

function toggleAllRows() {
  if (selectionConfig.value?.type === 'radio') return;
  const checked = !allRowsSelected.value;
  selectedRowKeys.value = checked ? [...selectableRowKeys.value] : [];
  publishSelectionChange('checkboxAll', undefined, checked);
}

function toggleSort(column: VirtualTableColumn) {
  if (!column.sortable || !column.field) return;

  if (sortState.value?.key !== column.key) {
    sortState.value = { key: column.key, field: column.field, direction: 'asc' };
  } else if (sortState.value.direction === 'asc') {
    sortState.value = { ...sortState.value, direction: 'desc' };
  } else {
    sortState.value = null;
  }
  resetVerticalScroll();

  publishGridEvent('sortChange', {
    column: rawColumns.value.find((item) => item.field === column.field)
      ?? rawColumns.value[column.sourceIndex],
    field: column.field,
    order: sortState.value?.direction ?? null,
    sort: sortState.value,
  });
}

function sortIndicator(column: VirtualTableColumn) {
  if (sortState.value?.key !== column.key) return '↕';
  return sortState.value.direction === 'asc' ? '↑' : '↓';
}

function gridEventDirectives(key: string) {
  const events = props.block.schema?.events ?? {};
  return events[key] ?? (key === 'rowCurrentChange' ? events.currentRowChange : undefined) ?? [];
}

function hasGridEventConfig(key: string) {
  return Boolean(
    props.block.schema?.events?.[key]
      || props.block.schema?.eventNames?.[key]
      || (key === 'rowCurrentChange' && props.block.schema?.events?.currentRowChange),
  );
}

function shouldPublishGridEvent(key: string) {
  if (
    ['rowCurrentChange', 'radioChange', 'checkboxChange', 'checkboxAll', 'sortChange'].includes(key)
  ) {
    if (key === 'rowCurrentChange') return true;
    if (['radioChange', 'checkboxChange', 'checkboxAll'].includes(key)) return true;
    if (!props.block.schema?.events && !props.block.schema?.eventNames) return true;
    return hasGridEventConfig(key);
  }
  return true;
}

function publishGridEvent(key: string, payload: Record<string, unknown>) {
  if (!shouldPublishGridEvent(key)) return;

  const event: MobileRuntimeEvent = {
    name: props.block.schema?.eventNames?.[key] ?? `grid.${key}`,
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      key,
      ...payload,
      directives: gridEventDirectives(key),
    },
  };
  emit('runtimeEvent', event);
}

function publishCurrentRow(row: Record<string, unknown>, rowIndex: number) {
  selectedRowKey.value = rowKey(row, rowIndex);
  publishGridEvent('rowCurrentChange', { row, rawEvent: {} });
}

function publishRowAction(action: SharedLowCodeAction, row: Record<string, unknown>) {
  if (action.disabled) return;

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

watch([centerWidth, centerViewportWidth], syncHorizontalScroll);

watch(rows, (nextRows) => {
  resetVerticalScroll();
  selectedRowKey.value = '';
  const availableKeys = new Set(nextRows.map((row, index) => rowKey(row, index)));
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => availableKeys.has(key));
});

onBeforeUnmount(tableWidthScheduler.cancel);
</script>

<style scoped>
.virtual-table-block {
  padding: 12px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.table-heading {
  min-height: 36px;
  margin-bottom: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.table-heading-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.table-title {
  color: #17212b;
  font-size: 16px;
  line-height: 22px;
  font-weight: bold;
}

.table-description {
  margin-top: 2px;
  color: #68737d;
  font-size: 11px;
  line-height: 16px;
}

.table-count {
  margin-left: 12px;
  color: #68737d;
  font-size: 11px;
  line-height: 16px;
}

.table-frame {
  position: relative;
  width: 100%;
  overflow: hidden;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #ccd4da;
}

.table-header {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  z-index: 5;
  overflow: hidden;
  background-color: #e9eef2;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #bfc9d0;
}

.vertical-scroll {
  position: absolute;
  right: 0;
  left: 0;
  overflow-y: scroll;
  background-color: #ffffff;
}

.vertical-content {
  position: relative;
  width: 100%;
}

.body-row-layer {
  position: absolute;
  right: 0;
  left: 0;
  overflow: hidden;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #e2e7ea;
}

.body-row-layer.is-selected {
  background-color: #e8f2ff;
}

.body-row-layer.is-selected .body-pane {
  background-color: #e8f2ff;
}

.fixed-pane,
.center-viewport {
  position: absolute;
  top: 0;
  bottom: 0;
  overflow: hidden;
}

.fixed-pane {
  z-index: 3;
  background-color: #ffffff;
}

.table-header .fixed-pane {
  background-color: #e9eef2;
}

.left-pane {
  left: 0;
  border-right-width: 1px;
  border-right-style: solid;
  border-right-color: #bdc8cf;
}

.right-pane {
  right: 0;
  border-left-width: 1px;
  border-left-style: solid;
  border-left-color: #bdc8cf;
}

.center-viewport {
  z-index: 1;
}

.table-row,
.center-window {
  display: flex;
  flex-direction: row;
}

.center-window {
  position: absolute;
  top: 0;
  left: 0;
}

.table-cell {
  flex-shrink: 0;
  min-width: 0;
  padding-right: 10px;
  padding-left: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  border-right-width: 1px;
  border-right-style: solid;
  border-right-color: #d8dfe4;
}

.header-cell {
  background-color: #e9eef2;
}

.header-cell.is-sortable {
  background-color: #e3e9ed;
}

.header-cell.is-sorted {
  background-color: #d4e5f5;
}

.body-cell {
  background-color: transparent;
}

.table-cell.is-left {
  justify-content: flex-start;
}

.table-cell.is-center {
  justify-content: center;
}

.table-cell.is-right {
  justify-content: flex-end;
}

.cell-text {
  min-width: 0;
  color: #34414c;
  font-size: 12px;
  line-height: 18px;
}

.header-cell .cell-text {
  color: #26343f;
  font-size: 12px;
  font-weight: bold;
}

.sort-indicator {
  margin-left: 5px;
  color: #2b6ca3;
  font-size: 12px;
  line-height: 18px;
}

.selection-control {
  width: 22px;
  height: 22px;
  padding: 0;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #8c9aa5;
  border-radius: 3px;
}

.selection-control.is-radio {
  border-radius: 11px;
}

.selection-control.is-checked,
.selection-control.is-indeterminate {
  background-color: #176ea8;
  border-color: #176ea8;
}

.selection-mark {
  color: #ffffff;
  font-size: 13px;
  line-height: 18px;
  text-align: center;
}

.action-cell {
  padding-right: 5px;
  padding-left: 5px;
  justify-content: flex-end;
}

.row-action {
  height: 30px;
  margin-left: 5px;
  padding-right: 8px;
  padding-left: 8px;
  align-items: center;
  justify-content: center;
  background-color: #e1ebf5;
  border-radius: 4px;
}

.row-action.is-danger {
  background-color: #fde6e3;
}

.row-action-text {
  color: #18558b;
  font-size: 11px;
  line-height: 16px;
}

.row-action.is-danger .row-action-text {
  color: #a12a2a;
}

.horizontal-scroll {
  position: absolute;
  bottom: 0;
  z-index: 7;
  overflow-x: scroll;
  background-color: #e9eef2;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #cbd4da;
  touch-action: pan-x;
}

.horizontal-scroll-content {
  flex-shrink: 0;
  position: relative;
}

.horizontal-scroll-thumb {
  position: absolute;
  top: 7px;
  right: 4px;
  left: 4px;
  height: 3px;
  background-color: #7f919f;
  border-radius: 2px;
}

.empty-state {
  align-items: center;
  justify-content: center;
}

.empty-state-text {
  color: #7a858f;
  font-size: 12px;
}
</style>
