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
        <div v-if="leftColumns.length" class="fixed-pane left-pane" :style="leftHeaderPaneStyle">
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
                <span class="cell-text" :numberOfLines="1" ellipsizeMode="tail">
                  {{ column.title }}
                </span>
                <span v-if="column.sortable" class="sort-indicator">{{ sortIndicator(column) }}</span>
              </template>
            </button>
          </div>
        </div>

        <div
          class="center-viewport"
          :style="centerHeaderPaneStyle"
        >
          <div
            v-if="visibleCenterColumnItems.length"
            class="table-row center-window"
            :style="centerHeaderWindowStyle"
          >
            <button
              v-for="item in visibleCenterColumnItems"
              :key="item.column.key"
              :class="headerCellClass(item.column)"
              :style="centerCellStyle(item, true)"
              @click="toggleSort(item.column)"
            >
              <div
                v-if="item.column.selection === 'checkbox'"
                :class="selectionControlClass(allRowsSelected, someRowsSelected)"
                @click.stop="toggleAllRows"
              >
                <span v-if="allRowsSelected" class="selection-mark">✓</span>
                <span v-else-if="someRowsSelected" class="selection-mark">−</span>
              </div>
              <template v-else>
                <span class="cell-text" :numberOfLines="1" ellipsizeMode="tail">
                  {{ item.column.title }}
                </span>
                <span v-if="item.column.sortable" class="sort-indicator">
                  {{ sortIndicator(item.column) }}
                </span>
              </template>
            </button>
          </div>
        </div>

        <div v-if="rightColumns.length" class="fixed-pane right-pane" :style="rightHeaderPaneStyle">
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
                <span class="cell-text" :numberOfLines="1" ellipsizeMode="tail">
                  {{ column.title }}
                </span>
                <span v-if="column.sortable" class="sort-indicator">{{ sortIndicator(column) }}</span>
              </template>
            </button>
          </div>
        </div>
      </div>

      <div
        class="vertical-scroll"
        :style="verticalScrollStyle"
        @touchstart="handleBodyTouchStart"
        @touchmove="handleBodyTouchMove"
        @touchend="handleBodyTouchEnd"
        @touchcancel="handleBodyTouchCancel"
      >
        <div class="vertical-content" :style="verticalContentStyle">
          <div
            v-if="!sortedRows.length"
            class="empty-state"
            :style="emptyStateStyle"
          >
            <span class="empty-state-text">暂无数据</span>
          </div>

          <div class="center-viewport body-pane" :style="centerBodyPaneStyle">
            <div class="center-body-window" :style="centerBodyWindowStyle">
              <div
                v-for="item in visibleRows"
                :key="item.key"
                :class="['body-row-layer', { 'is-selected': item.key === selectedRowKey }]"
                :style="bodyRowStyle(item.index, item.key)"
                @click="handleCurrentRowClick(item.row, item.index)"
              >
                <div
                  v-for="columnItem in visibleCenterColumnItems"
                  :key="columnItem.column.key"
                  :class="bodyCellClass(columnItem.column)"
                  :style="centerCellStyle(columnItem)"
                  @click.stop="handleCurrentRowClick(item.row, item.index)"
                >
                  <button
                    v-if="columnItem.column.selection"
                    :class="selectionControlClass(
                      isRowSelected(item.key),
                      false,
                      columnItem.column.selection,
                    )"
                    @click.stop="toggleRowSelection(
                      item.row,
                      item.index,
                      columnItem.column.selection,
                    )"
                  >
                    <span v-if="isRowSelected(item.key)" class="selection-mark">
                      {{ columnItem.column.selection === 'radio' ? '●' : '✓' }}
                    </span>
                  </button>
                  <span
                    v-else
                    class="cell-text"
                    :numberOfLines="1"
                    ellipsizeMode="tail"
                  >
                    {{ readCell(item.row, columnItem.column, item.index) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="leftColumns.length"
            class="fixed-pane left-pane body-pane"
            :style="leftBodyPaneStyle"
          >
            <div
              v-for="item in visibleRows"
              :key="item.key"
              :class="['body-row-layer', { 'is-selected': item.key === selectedRowKey }]"
              :style="bodyRowStyle(item.index, item.key)"
              @click="handleCurrentRowClick(item.row, item.index)"
            >
              <div class="table-row" :style="leftRowStyle">
                <div
                  v-for="column in leftColumns"
                  :key="column.key"
                  :class="bodyCellClass(column)"
                  :style="fixedCellStyle(column, item.key)"
                  @click.stop="handleCurrentRowClick(item.row, item.index)"
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
                  <span
                    v-else
                    class="cell-text"
                    :numberOfLines="1"
                    ellipsizeMode="tail"
                  >
                    {{ readCell(item.row, column, item.index) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="rightColumns.length"
            class="fixed-pane right-pane body-pane"
            :style="rightBodyPaneStyle"
          >
            <div
              v-for="item in visibleRows"
              :key="item.key"
              :class="['body-row-layer', { 'is-selected': item.key === selectedRowKey }]"
              :style="bodyRowStyle(item.index, item.key)"
              @click="handleCurrentRowClick(item.row, item.index)"
            >
              <div class="table-row" :style="rightRowStyle">
                <template v-for="column in rightColumns" :key="column.key">
                  <div
                    v-if="column.action"
                    class="table-cell body-cell action-cell"
                    :style="fixedCellStyle(column, item.key)"
                  >
                    <button
                      v-for="action in visibleRowActions(item.row)"
                      :key="action.code"
                      :class="['row-action', { 'is-danger': action.status === 'danger' }]"
                      :disabled="isRowActionDisabled(action, item.row)"
                      @click.stop="publishRowAction(action, item.row)"
                    >
                      <span class="row-action-text">{{ action.label }}</span>
                    </button>
                  </div>
                  <div
                    v-else-if="column.selection"
                    class="table-cell body-cell is-center"
                    :style="fixedCellStyle(column, item.key)"
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
                    :style="fixedCellStyle(column, item.key)"
                    @click.stop="handleCurrentRowClick(item.row, item.index)"
                  >
                    <span class="cell-text" :numberOfLines="1" ellipsizeMode="tail">
                      {{ readCell(item.row, column, item.index) }}
                    </span>
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        ref="horizontalScrollbarTrackRef"
        :class="['scrollbar-track', 'horizontal-scrollbar', {
          'is-disabled': !hasHorizontalOverflow,
        }]"
        :style="horizontalScrollbarStyle"
        @touchstart="handleScrollbarTrackTouchStart('x', $event)"
        @touchmove="handleScrollbarTouchMove('x', $event)"
        @touchend="handleScrollbarTouchEnd('x', $event)"
        @touchcancel="handleScrollbarTouchEnd('x', $event)"
      >
        <div
          class="scrollbar-thumb horizontal-scrollbar-thumb"
          :style="horizontalScrollbarThumbStyle"
          @touchstart.stop="handleScrollbarThumbTouchStart('x', $event)"
          @touchmove.stop="handleScrollbarTouchMove('x', $event)"
          @touchend.stop="handleScrollbarTouchEnd('x', $event)"
          @touchcancel.stop="handleScrollbarTouchEnd('x', $event)"
        />
      </div>

      <div
        ref="verticalScrollbarTrackRef"
        :class="['scrollbar-track', 'vertical-scrollbar', {
          'is-disabled': !hasVerticalOverflow,
        }]"
        :style="verticalScrollbarStyle"
        @touchstart="handleScrollbarTrackTouchStart('y', $event)"
        @touchmove="handleScrollbarTouchMove('y', $event)"
        @touchend="handleScrollbarTouchEnd('y', $event)"
        @touchcancel="handleScrollbarTouchEnd('y', $event)"
      >
        <div
          class="scrollbar-thumb vertical-scrollbar-thumb"
          :style="verticalScrollbarThumbStyle"
          @touchstart.stop="handleScrollbarThumbTouchStart('y', $event)"
          @touchmove.stop="handleScrollbarTouchMove('y', $event)"
          @touchend.stop="handleScrollbarTouchEnd('y', $event)"
          @touchcancel.stop="handleScrollbarTouchEnd('y', $event)"
        />
      </div>

      <div class="scrollbar-corner" :style="scrollbarCornerStyle" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from '@vue/runtime-core';
import type { CSSProperties } from 'vue';
import {
  Native,
  type HippyElement,
  type HippyLayoutEvent,
  type HippyTouchEvent,
} from '@hippy/vue-next';

import type {
  MobileMaterialEmits,
  MobileMaterialProps,
  MobileRuntimeEvent,
  SharedLowCodeAction,
} from '../types';
import {
  isLowCodeRowActionDisabled,
  visibleLowCodeRowActions,
} from '../../../../packages/lowcode-framework/src/runtime/row-action-state';
import {
  createLayoutWidthScheduler,
  getWebLayoutFrameDriver,
} from '../layout-width';
import {
  buildColumnOffsets,
  createVirtualCellValueReader,
  fitPinnedColumns,
  getColumnWindow,
  getRowWindow,
  getVirtualScrollbarMetrics,
  normalizeVirtualColumns,
  normalizeVirtualSelectionConfig,
  partitionVirtualColumns,
  readPositiveNumber,
  retainColumnWindow,
  retainVirtualRange,
  reuseColumnWindow,
  reuseVirtualRange,
  shouldStartVirtualPan,
  scrollVirtualScrollbarByThumbDelta,
  scrollVirtualScrollbarToTrackPosition,
  sortVirtualRows,
  sumColumnWidths,
  updateVirtualSelectionKeys,
  withVirtualSelectionColumn,
  type RawGridColumn,
  type ColumnWindow,
  type SortState,
  type VirtualTableColumn,
  type VirtualTableSelectionType,
  type VirtualRange,
} from '../virtual-table';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

const DEFAULT_TABLE_HEIGHT = 360;
const DEFAULT_ROW_HEIGHT = 48;
const DEFAULT_HEADER_HEIGHT = 44;
const HORIZONTAL_SCROLLBAR_HEIGHT = 18;
const VERTICAL_SCROLLBAR_WIDTH = 18;
const MINIMUM_SCROLLBAR_THUMB_SIZE = 32;
const PAN_START_DISTANCE = 6;
const PAN_MOMENTUM_FRAME_MS = 16;
const PAN_MOMENTUM_FRICTION = 0.96;
const PAN_MOMENTUM_STOP_VELOCITY = 0.035;
const PAN_MOMENTUM_MAX_VELOCITY = 5;
const PAN_CLICK_SUPPRESSION_MS = 300;

type ScrollbarAxis = 'x' | 'y';

type BodyPanState = {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  velocityX: number;
  velocityY: number;
  moved: boolean;
};

type RowItem = {
  row: Record<string, unknown>;
  index: number;
  key: string;
};

type CenterColumnItem = {
  column: VirtualTableColumn;
  index: number;
  offset: number;
};

const tableWidth = ref(0);
const scrollTop = ref(0);
const scrollLeft = ref(0);
const selectedRowKey = ref('');
const selectedRowKeys = ref<string[]>([]);
const sortState = ref<SortState | null>(null);
const horizontalScrollbarTrackRef = ref<HippyElement | null>(null);
const verticalScrollbarTrackRef = ref<HippyElement | null>(null);
const activeScrollbarAxis = ref<ScrollbarAxis | null>(null);
const scrollbarDragStartCoordinate = ref(0);
const scrollbarDragStartOffset = ref(0);
let scrollbarInteractionToken = 0;
let bodyPanState: BodyPanState | null = null;
let bodyMomentumVelocityX = 0;
let bodyMomentumVelocityY = 0;
let bodyMomentumLastTime = 0;
let bodyMomentumFrame: number | null = null;
let bodyMomentumTimer: ReturnType<typeof setTimeout> | null = null;
let suppressRowClickUntil = 0;
let pendingScrollLeft = 0;
let pendingScrollTop = 0;
let scrollCommitFrame: number | null = null;
let scrollCommitTimer: ReturnType<typeof setTimeout> | null = null;
const readCell = createVirtualCellValueReader();
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
const horizontalTouchScrollSpeed = computed(() => readPositiveNumber(
  gridConfig.value.horizontalTouchScrollSpeed ?? gridConfig.value.touchScrollSpeed,
  1,
  0.5,
  3,
));
const verticalTouchScrollSpeed = computed(() => readPositiveNumber(
  gridConfig.value.verticalTouchScrollSpeed ?? gridConfig.value.touchScrollSpeed,
  1.15,
  0.5,
  3,
));
const touchMomentumEnabled = computed(() => gridConfig.value.touchMomentum !== false);

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

function visibleRowActions(row: Record<string, unknown>) {
  return visibleLowCodeRowActions(rowActions.value, row);
}

function isRowActionDisabled(action: SharedLowCodeAction, row: Record<string, unknown>) {
  return isLowCodeRowActionDisabled(action, row);
}

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
const tableContentWidth = computed(() => Math.max(0, tableWidth.value - VERTICAL_SCROLLBAR_WIDTH));
const columns = computed(() => fitPinnedColumns(
  normalizeVirtualColumns(displayColumns.value, {
    actionWidth: Math.max(104, rowActions.value.length * 62 + 16),
  }),
  tableContentWidth.value,
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
  tableContentWidth.value - leftWidth.value - rightWidth.value,
));
const centerOffsets = computed(() => buildColumnOffsets(centerColumns.value));
const centerWindow = computed<ColumnWindow>((previous) => reuseColumnWindow(
  previous,
  retainColumnWindow(
    previous,
    getColumnWindow(
      centerOffsets.value,
      scrollLeft.value,
      centerViewportWidth.value,
      overscanColumnCount.value,
    ),
    centerOffsets.value,
    { leading: 1, trailing: 1 },
  ),
));
const visibleCenterColumnItems = computed<CenterColumnItem[]>((previous) => {
  const next = centerColumns.value
    .slice(centerWindow.value.start, centerWindow.value.end)
    .map((column, localIndex) => {
      const index = centerWindow.value.start + localIndex;
      return {
        column,
        index,
        offset: centerOffsets.value[index] ?? 0,
      };
    });
  return previous
    && previous.length === next.length
    && previous.every((item, index) => (
      item.column === next[index].column && item.offset === next[index].offset
    ))
    ? previous
    : next;
});
const hasHorizontalOverflow = computed(() => centerWidth.value > centerViewportWidth.value + 1);
const bodyViewportHeight = computed(() => Math.max(
  1,
  tableHeight.value - headerHeight.value - HORIZONTAL_SCROLLBAR_HEIGHT,
));
const sortedRows = computed(() => sortVirtualRows(rows.value, sortState.value));
const verticalContentHeight = computed(() => Math.max(
  bodyViewportHeight.value,
  sortedRows.value.length * rowHeight.value,
));
const horizontalScrollbarMetrics = computed(() => getVirtualScrollbarMetrics(
  centerViewportWidth.value,
  centerWidth.value,
  scrollLeft.value,
  MINIMUM_SCROLLBAR_THUMB_SIZE,
));
const verticalScrollbarMetrics = computed(() => getVirtualScrollbarMetrics(
  bodyViewportHeight.value,
  verticalContentHeight.value,
  scrollTop.value,
  MINIMUM_SCROLLBAR_THUMB_SIZE,
));
const hasVerticalOverflow = computed(() => verticalScrollbarMetrics.value.maxScroll > 0);
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
const rowWindow = computed<VirtualRange>((previous) => reuseVirtualRange(
  previous,
  retainVirtualRange(
    previous,
    getRowWindow(
      sortedRows.value.length,
      scrollTop.value,
      bodyViewportHeight.value,
      rowHeight.value,
      overscanRowCount.value,
    ),
    sortedRows.value.length,
    { leading: 2, trailing: 2 },
  ),
));
const visibleRows = computed<RowItem[]>((previous) => {
  const next = sortedRows.value
    .slice(rowWindow.value.start, rowWindow.value.end)
    .map((row, localIndex) => {
      const index = rowWindow.value.start + localIndex;
      return { row, index, key: rowKey(row, index) };
    });
  return previous
    && previous.length === next.length
    && previous.every((item, index) => (
      item.row === next[index].row && item.index === next[index].index
    ))
    ? previous
    : next;
});

const tableFrameStyle = computed<CSSProperties>(() => ({ height: `${tableHeight.value}px` }));
const headerStyle = computed<CSSProperties>(() => ({
  right: `${VERTICAL_SCROLLBAR_WIDTH}px`,
  height: `${headerHeight.value}px`,
}));
const verticalScrollStyle = computed<CSSProperties>(() => ({
  top: `${headerHeight.value}px`,
  right: `${VERTICAL_SCROLLBAR_WIDTH}px`,
  height: `${bodyViewportHeight.value}px`,
}));
const verticalContentStyle = computed<CSSProperties>(() => ({
  height: `${Math.max(
    bodyViewportHeight.value,
    (rowWindow.value.end - rowWindow.value.start) * rowHeight.value,
  )}px`,
  transform: `translateY(${rowWindow.value.start * rowHeight.value - scrollTop.value}px)`,
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
const leftHeaderPaneStyle = computed<CSSProperties>(() => ({
  ...leftPaneStyle.value,
  height: `${headerHeight.value}px`,
  overflow: 'hidden',
  opacity: 1,
  zIndex: 10,
  backgroundColor: '#e9eef2',
}));
const centerHeaderPaneStyle = computed<CSSProperties>(() => ({
  ...centerViewportStyle.value,
  width: `${centerViewportWidth.value}px`,
  height: `${headerHeight.value}px`,
  overflow: 'hidden',
  zIndex: 1,
}));
const rightHeaderPaneStyle = computed<CSSProperties>(() => ({
  ...rightPaneStyle.value,
  height: `${headerHeight.value}px`,
  overflow: 'hidden',
  opacity: 1,
  zIndex: 10,
  backgroundColor: '#e9eef2',
}));
const centerHeaderWindowStyle = computed<CSSProperties>(() => ({
  width: `${centerWidth.value}px`,
  height: `${headerHeight.value}px`,
  transform: `translateX(${-scrollLeft.value}px)`,
}));
const centerBodyWindowStyle = computed<CSSProperties>(() => ({
  width: `${centerWidth.value}px`,
  height: `${Math.max(
    bodyViewportHeight.value,
    (rowWindow.value.end - rowWindow.value.start) * rowHeight.value,
  )}px`,
  transform: `translateX(${-scrollLeft.value}px)`,
}));
const leftBodyPaneStyle = computed<CSSProperties>(() => ({
  ...leftPaneStyle.value,
  height: `${Math.max(
    bodyViewportHeight.value,
    (rowWindow.value.end - rowWindow.value.start) * rowHeight.value,
  )}px`,
  overflow: 'hidden',
  opacity: 1,
  zIndex: 10,
  backgroundColor: '#ffffff',
}));
const rightBodyPaneStyle = computed<CSSProperties>(() => ({
  ...rightPaneStyle.value,
  height: `${Math.max(
    bodyViewportHeight.value,
    (rowWindow.value.end - rowWindow.value.start) * rowHeight.value,
  )}px`,
  overflow: 'hidden',
  opacity: 1,
  zIndex: 10,
  backgroundColor: '#ffffff',
}));
const horizontalScrollbarStyle = computed<CSSProperties>(() => ({
  left: `${leftWidth.value}px`,
  right: `${rightWidth.value + VERTICAL_SCROLLBAR_WIDTH}px`,
  height: `${HORIZONTAL_SCROLLBAR_HEIGHT}px`,
}));
const verticalScrollbarStyle = computed<CSSProperties>(() => ({
  top: `${headerHeight.value}px`,
  width: `${VERTICAL_SCROLLBAR_WIDTH}px`,
  height: `${bodyViewportHeight.value}px`,
}));
const horizontalScrollbarThumbStyle = computed<CSSProperties>(() => ({
  width: `${horizontalScrollbarMetrics.value.thumbSize}px`,
  transform: `translateX(${horizontalScrollbarMetrics.value.thumbOffset}px)`,
}));
const verticalScrollbarThumbStyle = computed<CSSProperties>(() => ({
  height: `${verticalScrollbarMetrics.value.thumbSize}px`,
  transform: `translateY(${verticalScrollbarMetrics.value.thumbOffset}px)`,
}));
const scrollbarCornerStyle = computed<CSSProperties>(() => ({
  width: `${VERTICAL_SCROLLBAR_WIDTH}px`,
  height: `${HORIZONTAL_SCROLLBAR_HEIGHT}px`,
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

function centerCellStyle(item: CenterColumnItem, header = false): CSSProperties {
  return {
    ...cellStyle(item.column, header),
    position: 'absolute',
    top: '0px',
    left: `${item.offset}px`,
  };
}

function fixedCellStyle(column: VirtualTableColumn, key: string): CSSProperties {
  return {
    ...cellStyle(column),
    backgroundColor: currentRowBackground(key),
  };
}

function currentRowBackground(key: string) {
  return key === selectedRowKey.value ? '#e8f2ff' : '#ffffff';
}

function bodyRowStyle(index: number, key: string): CSSProperties {
  return {
    top: `${(index - rowWindow.value.start) * rowHeight.value}px`,
    height: `${rowHeight.value}px`,
    backgroundColor: currentRowBackground(key),
  };
}

const centerBodyPaneStyle = computed<CSSProperties>(() => ({
  ...centerViewportStyle.value,
  width: `${centerViewportWidth.value}px`,
  height: `${Math.max(
    bodyViewportHeight.value,
    (rowWindow.value.end - rowWindow.value.start) * rowHeight.value,
  )}px`,
  overflow: 'hidden',
  zIndex: 1,
}));

function handleTableLayout(event: HippyLayoutEvent) {
  tableWidthScheduler.schedule(event.width);
}

function touchCoordinate(event: Event, axis: ScrollbarAxis) {
  const touchEvent = event as Event & Pick<HippyTouchEvent, 'touches'>;
  const touch = touchEvent.touches?.[0];
  const value = axis === 'x' ? touch?.clientX : touch?.clientY;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function handleBodyTouchStart(event: Event) {
  const x = touchCoordinate(event, 'x');
  const y = touchCoordinate(event, 'y');
  if (x === undefined || y === undefined) return;

  stopBodyMomentum();
  flushPendingScroll();
  bodyPanState = {
    startX: x,
    startY: y,
    lastX: x,
    lastY: y,
    lastTime: Date.now(),
    velocityX: 0,
    velocityY: 0,
    moved: false,
  };
}

function handleBodyTouchMove(event: Event) {
  const state = bodyPanState;
  const nextX = touchCoordinate(event, 'x');
  const nextY = touchCoordinate(event, 'y');
  if (!state || nextX === undefined || nextY === undefined) return;

  if (!state.moved) {
    if (!shouldStartVirtualPan(
      nextX - state.startX,
      nextY - state.startY,
      {
        horizontal: hasHorizontalOverflow.value,
        vertical: hasVerticalOverflow.value,
        startDistance: PAN_START_DISTANCE,
      },
    )) return;
    state.moved = true;
  }

  event.stopPropagation();
  event.preventDefault();

  const now = Date.now();
  const elapsed = Math.max(1, now - state.lastTime);
  const previousLeft = pendingScrollLeft;
  const previousTop = pendingScrollTop;
  queueTableScroll(
    previousLeft + (state.lastX - nextX) * horizontalTouchScrollSpeed.value,
    previousTop + (state.lastY - nextY) * verticalTouchScrollSpeed.value,
  );
  const velocityX = (pendingScrollLeft - previousLeft) / elapsed;
  const velocityY = (pendingScrollTop - previousTop) / elapsed;
  state.velocityX = state.velocityX * 0.35 + velocityX * 0.65;
  state.velocityY = state.velocityY * 0.35 + velocityY * 0.65;
  state.lastX = nextX;
  state.lastY = nextY;
  state.lastTime = now;
}

function handleBodyTouchEnd() {
  const state = bodyPanState;
  bodyPanState = null;
  if (!state?.moved) return;

  flushPendingScroll();
  suppressRowClickUntil = Date.now() + PAN_CLICK_SUPPRESSION_MS;
  if (touchMomentumEnabled.value) startBodyMomentum(state.velocityX, state.velocityY);
}

function handleBodyTouchCancel() {
  bodyPanState = null;
  flushPendingScroll();
}

function stopBodyMomentum() {
  if (bodyMomentumFrame !== null && typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(bodyMomentumFrame);
  }
  if (bodyMomentumTimer !== null) clearTimeout(bodyMomentumTimer);
  bodyMomentumFrame = null;
  bodyMomentumTimer = null;
  bodyMomentumVelocityX = 0;
  bodyMomentumVelocityY = 0;
}

function clampMomentumVelocity(value: number, boost: number) {
  return Math.min(
    PAN_MOMENTUM_MAX_VELOCITY,
    Math.max(-PAN_MOMENTUM_MAX_VELOCITY, value * boost),
  );
}

function startBodyMomentum(rawVelocityX: number, rawVelocityY: number) {
  const velocityX = clampMomentumVelocity(rawVelocityX, 1.08);
  const velocityY = clampMomentumVelocity(rawVelocityY, 1.35);
  if (
    Math.abs(velocityX) < PAN_MOMENTUM_STOP_VELOCITY
    && Math.abs(velocityY) < PAN_MOMENTUM_STOP_VELOCITY
  ) return;

  stopBodyMomentum();
  bodyMomentumVelocityX = velocityX;
  bodyMomentumVelocityY = velocityY;
  bodyMomentumLastTime = Date.now();
  scheduleBodyMomentumFrame();
}

function scheduleBodyMomentumFrame() {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    bodyMomentumFrame = globalThis.requestAnimationFrame(runBodyMomentumFrame);
    return;
  }
  bodyMomentumTimer = setTimeout(runBodyMomentumFrame, PAN_MOMENTUM_FRAME_MS);
}

function runBodyMomentumFrame() {
  bodyMomentumFrame = null;
  bodyMomentumTimer = null;

  const now = Date.now();
  const elapsed = Math.min(34, Math.max(8, now - bodyMomentumLastTime));
  const previousLeft = pendingScrollLeft;
  const previousTop = pendingScrollTop;
  setTableScrollImmediate(
    previousLeft + bodyMomentumVelocityX * elapsed,
    previousTop + bodyMomentumVelocityY * elapsed,
  );
  if (Math.abs(pendingScrollLeft - previousLeft) < 0.1) bodyMomentumVelocityX = 0;
  if (Math.abs(pendingScrollTop - previousTop) < 0.1) bodyMomentumVelocityY = 0;

  const friction = Math.pow(PAN_MOMENTUM_FRICTION, elapsed / PAN_MOMENTUM_FRAME_MS);
  bodyMomentumVelocityX *= friction;
  bodyMomentumVelocityY *= friction;
  bodyMomentumLastTime = now;
  if (
    Math.abs(bodyMomentumVelocityX) < PAN_MOMENTUM_STOP_VELOCITY
    && Math.abs(bodyMomentumVelocityY) < PAN_MOMENTUM_STOP_VELOCITY
  ) {
    stopBodyMomentum();
    return;
  }
  scheduleBodyMomentumFrame();
}

function resetVerticalScroll() {
  setVerticalScroll(0);
}

function clampHorizontalScroll(value: number) {
  return Math.min(horizontalScrollbarMetrics.value.maxScroll, Math.max(0, value));
}

function clampVerticalScroll(value: number) {
  return Math.min(verticalScrollbarMetrics.value.maxScroll, Math.max(0, value));
}

function cancelScrollCommit() {
  if (scrollCommitFrame !== null && typeof globalThis.cancelAnimationFrame === 'function') {
    globalThis.cancelAnimationFrame(scrollCommitFrame);
  }
  if (scrollCommitTimer !== null) clearTimeout(scrollCommitTimer);
  scrollCommitFrame = null;
  scrollCommitTimer = null;
}

function commitPendingScroll() {
  scrollCommitFrame = null;
  scrollCommitTimer = null;
  if (scrollLeft.value !== pendingScrollLeft) scrollLeft.value = pendingScrollLeft;
  if (scrollTop.value !== pendingScrollTop) scrollTop.value = pendingScrollTop;
}

function scheduleScrollCommit() {
  if (scrollCommitFrame !== null || scrollCommitTimer !== null) return;
  if (typeof globalThis.requestAnimationFrame === 'function') {
    scrollCommitFrame = globalThis.requestAnimationFrame(commitPendingScroll);
    return;
  }
  scrollCommitTimer = setTimeout(commitPendingScroll, PAN_MOMENTUM_FRAME_MS);
}

function flushPendingScroll() {
  cancelScrollCommit();
  commitPendingScroll();
}

function queueTableScroll(left: number, top: number) {
  pendingScrollLeft = clampHorizontalScroll(left);
  pendingScrollTop = clampVerticalScroll(top);
  scheduleScrollCommit();
}

function setTableScrollImmediate(left: number, top: number) {
  cancelScrollCommit();
  pendingScrollLeft = clampHorizontalScroll(left);
  pendingScrollTop = clampVerticalScroll(top);
  commitPendingScroll();
}

function syncHorizontalScroll() {
  pendingScrollLeft = clampHorizontalScroll(pendingScrollLeft);
  if (scrollLeft.value === pendingScrollLeft) return;
  scrollLeft.value = pendingScrollLeft;
}

function syncVerticalScroll() {
  pendingScrollTop = clampVerticalScroll(pendingScrollTop);
  if (scrollTop.value === pendingScrollTop) return;
  scrollTop.value = pendingScrollTop;
}

function setHorizontalScroll(value: number) {
  cancelScrollCommit();
  pendingScrollLeft = clampHorizontalScroll(value);
  if (scrollLeft.value !== pendingScrollLeft) scrollLeft.value = pendingScrollLeft;
}

function setVerticalScroll(value: number) {
  cancelScrollCommit();
  pendingScrollTop = clampVerticalScroll(value);
  if (scrollTop.value !== pendingScrollTop) scrollTop.value = pendingScrollTop;
}

function scrollbarMetrics(axis: ScrollbarAxis) {
  return axis === 'x'
    ? horizontalScrollbarMetrics.value
    : verticalScrollbarMetrics.value;
}

function scrollbarOffset(axis: ScrollbarAxis) {
  return axis === 'x' ? pendingScrollLeft : pendingScrollTop;
}

function setScrollbarOffset(axis: ScrollbarAxis, value: number) {
  if (axis === 'x') setHorizontalScroll(value);
  else setVerticalScroll(value);
}

function beginScrollbarDrag(axis: ScrollbarAxis, event: Event) {
  const coordinate = touchCoordinate(event, axis);
  if (coordinate === undefined || scrollbarMetrics(axis).maxScroll <= 0) return undefined;

  stopBodyMomentum();
  flushPendingScroll();
  bodyPanState = null;
  event.stopPropagation();
  activeScrollbarAxis.value = axis;
  scrollbarDragStartCoordinate.value = coordinate;
  scrollbarDragStartOffset.value = scrollbarOffset(axis);
  scrollbarInteractionToken += 1;
  return { coordinate, token: scrollbarInteractionToken };
}

function handleScrollbarThumbTouchStart(axis: ScrollbarAxis, event: Event) {
  beginScrollbarDrag(axis, event);
}

function handleScrollbarTrackTouchStart(axis: ScrollbarAxis, event: Event) {
  const interaction = beginScrollbarDrag(axis, event);
  if (!interaction) return;
  void positionScrollbarAtTrackTouch(axis, interaction.coordinate, interaction.token);
}

async function positionScrollbarAtTrackTouch(
  axis: ScrollbarAxis,
  coordinate: number,
  interactionToken: number,
) {
  const track = axis === 'x'
    ? horizontalScrollbarTrackRef.value
    : verticalScrollbarTrackRef.value;
  if (!track) return;

  try {
    const rect = await Native.getBoundingClientRect(
      track as unknown as Parameters<typeof Native.getBoundingClientRect>[0],
    );
    if (scrollbarInteractionToken !== interactionToken) return;

    const rawOrigin = axis === 'x' ? rect.left ?? rect.x : rect.top ?? rect.y;
    if (typeof rawOrigin !== 'number' || !Number.isFinite(rawOrigin)) return;
    const nextOffset = scrollVirtualScrollbarToTrackPosition(
      scrollbarMetrics(axis),
      coordinate - rawOrigin,
    );
    setScrollbarOffset(axis, nextOffset);
    scrollbarDragStartCoordinate.value = coordinate;
    scrollbarDragStartOffset.value = nextOffset;
  } catch {
    // A disappearing table can invalidate native measurement during navigation.
  }
}

function handleScrollbarTouchMove(axis: ScrollbarAxis, event: Event) {
  if (activeScrollbarAxis.value !== axis) return;
  const coordinate = touchCoordinate(event, axis);
  if (coordinate === undefined) return;

  event.stopPropagation();
  event.preventDefault();
  scrollbarInteractionToken += 1;
  const nextOffset = scrollVirtualScrollbarByThumbDelta(
    scrollbarMetrics(axis),
    scrollbarDragStartOffset.value,
    coordinate - scrollbarDragStartCoordinate.value,
  );
  if (axis === 'x') queueTableScroll(nextOffset, pendingScrollTop);
  else queueTableScroll(pendingScrollLeft, nextOffset);
}

function handleScrollbarTouchEnd(axis: ScrollbarAxis, event: Event) {
  if (activeScrollbarAxis.value !== axis) return;
  event.stopPropagation();
  flushPendingScroll();
  activeScrollbarAxis.value = null;
}

function isRowSelected(key: string) {
  return selectedRowKeySet.value.has(key);
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

function handleCurrentRowClick(row: Record<string, unknown>, rowIndex: number) {
  if (Date.now() < suppressRowClickUntil) return;
  publishCurrentRow(row, rowIndex);
}

function publishRowAction(action: SharedLowCodeAction, row: Record<string, unknown>) {
  if (isRowActionDisabled(action, row)) return;

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
watch([verticalContentHeight, bodyViewportHeight], syncVerticalScroll);

watch(rows, (nextRows) => {
  readCell.clear();
  resetVerticalScroll();
  selectedRowKey.value = '';
  const availableKeys = new Set(nextRows.map((row, index) => rowKey(row, index)));
  selectedRowKeys.value = selectedRowKeys.value.filter((key) => availableKeys.has(key));
});

onBeforeUnmount(() => {
  scrollbarInteractionToken += 1;
  stopBodyMomentum();
  cancelScrollCommit();
  readCell.clear();
  tableWidthScheduler.cancel();
});
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
  overflow: hidden;
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
  z-index: 10;
  opacity: 1;
  background-color: #ffffff;
}

.fixed-pane .body-cell {
  background-color: #ffffff;
}

.body-row-layer.is-selected .fixed-pane .body-cell {
  background-color: #e8f2ff;
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
  overflow: hidden;
}

.table-row,
.center-window,
.center-body-window {
  display: flex;
  flex-direction: row;
}

.center-window,
.center-body-window {
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
  max-width: 100%;
  min-width: 0;
  flex-shrink: 1;
  overflow: hidden;
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

.scrollbar-track {
  position: absolute;
  z-index: 7;
  overflow: hidden;
  background-color: #e1e6e9;
}

.horizontal-scrollbar {
  bottom: 0;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #b9c4ca;
}

.vertical-scrollbar {
  right: 0;
  border-left-width: 1px;
  border-left-style: solid;
  border-left-color: #b9c4ca;
}

.scrollbar-thumb {
  position: absolute;
  background-color: #607784;
  border-radius: 4px;
}

.horizontal-scrollbar-thumb {
  top: 4px;
  left: 0;
  height: 9px;
}

.vertical-scrollbar-thumb {
  top: 0;
  left: 4px;
  width: 9px;
}

.scrollbar-track.is-disabled .scrollbar-thumb {
  background-color: #b9c3c9;
}

.scrollbar-corner {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 8;
  background-color: #cfd7dc;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #b9c4ca;
  border-left-width: 1px;
  border-left-style: solid;
  border-left-color: #b9c4ca;
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
