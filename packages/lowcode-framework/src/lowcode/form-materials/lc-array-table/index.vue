<template>
  <div
    class="lc-array-table"
    :class="{ 'lc-array-table--fill': fillAvailableHeight }"
  >
    <div
      v-if="showToolbar && toolbarButtonOptions.length"
      :class="['lc-array-table__toolbar', `is-${toolbarAlign}`]"
    >
      <vxe-button-group
        size="mini"
        :options="toolbarButtonOptions"
        @click="handleToolbarButtonClick"
      />
    </div>

    <div class="lc-array-table__viewport">
      <vxe-table
      ref="tableRef"
      auto-resize
      class="lc-array-table__grid"
      v-bind="tableConfig"
      :data="rows"
      :tree-config="treeConfig"
      @cell-click="handleCellClick"
      @row-dblclick="handleRowDblclick"
      @checkbox-change="commitRows"
      @checkbox-all="commitRows"
    >
      <vxe-column v-if="showSeq" type="seq" width="42" />
      <template v-for="column in columns" :key="column.field">
        <vxe-column
          v-if="column.type"
          :type="column.type"
          :field="column.field"
          :title="column.title"
          :width="column.width"
          :min-width="column.minWidth"
          :align="column.align"
          :header-align="column.headerAlign"
        />
        <vxe-column
          v-else
          :field="column.field"
          :title="column.title"
          :width="column.width"
          :min-width="column.minWidth || 100"
          :align="column.align"
          :header-align="column.headerAlign"
          :tree-node="isTreeNodeColumn(column)"
        >
          <template #default="scope">
            <template v-if="isRecord(scope?.row)">
              <vxe-switch
                v-if="column.component === 'vxe-switch'"
                :model-value="Boolean(scope.row[column.field])"
                :disabled="column.readonly || Boolean(column.props?.disabled)"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
              <vxe-select
                v-else-if="column.component === 'vxe-select'"
                :model-value="getSelectModelValue(column, scope.row[column.field])"
                v-bind="column.props"
                transfer
                clearable
                :disabled="column.readonly || Boolean(column.props?.disabled)"
                @update:model-value="(value) => setCell(scope.row, column.field, readSelectValue(column, value))"
              >
                <vxe-option
                  v-for="option in column.options"
                  :key="String(option.value)"
                  :label="option.label"
                  :value="option.value"
                  :disabled="option.disabled"
                />
              </vxe-select>
              <div
                v-else-if="shouldUseObjectEditor(column, scope.row)"
                class="lc-array-table__object-cell"
              >
                <span
                  v-if="isUnconfiguredSubFormColumn(column)"
                  class="lc-array-table__unconfigured-sub-form"
                  role="alert"
                >
                  子表单 Schema 未配置
                </span>
                <template v-else>
                  <vxe-input
                    :model-value="formatObjectPreview(scope.row[column.field])"
                    :placeholder="column.placeholder"
                    readonly
                  />
                  <button
                    type="button"
                    :disabled="column.readonly"
                    @click="openObjectEditor(scope.row, column)"
                  >
                    编辑
                  </button>
                </template>
              </div>
              <span
                v-else-if="column.component === 'lc-text'"
                class="lc-array-table__text-cell"
                :title="formatCellText(scope.row[column.field])"
              >
                {{ formatCellText(scope.row[column.field]) }}
              </span>
              <vxe-textarea
                v-else-if="column.component === 'vxe-textarea'"
                :model-value="readString(scope.row[column.field])"
                :placeholder="column.placeholder"
                v-bind="column.props"
                :readonly="column.readonly || Boolean(column.props?.readonly)"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
              <vxe-password-input
                v-else-if="column.component === 'vxe-password-input'"
                :model-value="readString(scope.row[column.field])"
                :placeholder="column.placeholder"
                v-bind="column.props"
                clearable
                :readonly="column.readonly || Boolean(column.props?.readonly)"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
              <vxe-number-input
                v-else-if="column.component === 'lc-number-input'"
                :model-value="toNumber(scope.row[column.field])"
                :placeholder="column.placeholder"
                v-bind="column.props"
                :readonly="column.readonly || Boolean(column.props?.readonly)"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
              <LcJsonEditor
                v-else-if="column.component === 'lc-json-editor'"
                :field="createCellField(column)"
                :model-value="scope.row[column.field]"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
              <LcMonacoEditor
                v-else-if="column.component === 'lc-monaco-editor'"
                :field="createCellField(column)"
                :model-value="scope.row[column.field]"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
              <vxe-input
                v-else
                :model-value="readString(scope.row[column.field])"
                :placeholder="column.placeholder"
                v-bind="column.props"
                clearable
                :readonly="column.readonly || Boolean(column.props?.readonly)"
                @update:model-value="(value) => setCell(scope.row, column.field, value)"
              />
            </template>
          </template>
        </vxe-column>
      </template>
      <vxe-column v-if="showActions" title="操作" :width="actionWidth" fixed="right">
        <template #default="scope">
          <div v-if="isRecord(scope?.row)" class="lc-array-table__actions">
            <button
              v-for="action in visibleRowActions(scope.row)"
              :key="action.code"
              type="button"
              :class="[
                action.className,
                action.status ? `is-${action.status}` : '',
              ]"
              :title="rowActionTitle(action, scope.row)"
              :disabled="isRowActionDisabled(action, scope.row)"
              @click="handleRowAction(action, scope.row)"
            >
              <i v-if="action.icon" :class="action.icon" />
              <span v-if="rowActionLabel(action, scope.row)">{{ rowActionLabel(action, scope.row) }}</span>
            </button>
            <button
              v-if="childAddable"
              type="button"
              :title="addChildText"
              :aria-label="addChildText"
              @click="addChildRow(scope.row)"
            >
              子
            </button>
            <button
              v-if="movable"
              type="button"
              :disabled="getSiblingIndex(scope.row) <= 0"
              @click="moveRow(scope.row, -1)"
            >
              上
            </button>
            <button
              v-if="movable"
              type="button"
              :disabled="getSiblingIndex(scope.row) >= getSiblingRows(scope.row).length - 1"
              @click="moveRow(scope.row, 1)"
            >
              下
            </button>
            <button v-if="copyable" type="button" @click="copyRow(scope.row)">
              复
            </button>
            <button
              v-if="removable"
              type="button"
              class="is-danger"
              :disabled="!canRemoveRow(scope.row)"
              @click="removeRow(scope.row)"
            >
              删
            </button>
          </div>
        </template>
      </vxe-column>
      </vxe-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { VxeButtonProps } from 'vxe-pc-ui';
import {
  mergeSystemTableOptions,
  resolveSystemTableConfig,
  useSystemSettings,
} from '../../../core/system-settings';
import { createSubFormField, isLowCodeFormSchema } from '../../form-schema';
import type {
  LowCodeField,
  LowCodeFieldComponent,
  LowCodeFormSchema,
  LowCodeOption,
} from '../../../types/lowcode';
import { openGlobalDialog } from '../../../runtime/global-dialog';
import LcJsonEditor from '../lc-json-editor/index.vue';
import LcMonacoEditor from '../lc-monaco-editor/index.vue';
import type { LowCodeFormMaterialProps } from '../types';

type ArrayTableColumn = {
  field: string;
  title: string;
  type?: string;
  component?: LowCodeFieldComponent;
  width?: number | string;
  minWidth?: number | string;
  align?: 'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  placeholder?: string;
  defaultValue?: unknown;
  props?: Record<string, unknown>;
  options?: LowCodeOption[];
  readonly?: boolean;
};

type ArrayTableValueMode = 'object' | 'primitive';

type ArrayTableToolbarExecute = (
  context: ArrayTableToolbarExecutionContext,
) => unknown | Promise<unknown>;

type ArrayTableToolbarButton = VxeButtonProps & {
  code: string | number;
  label: string;
  command?: string;
  row?: Record<string, unknown>;
  visible?: boolean;
  execute?: ArrayTableToolbarExecute;
};

type ArrayTableToolbarClickParams = {
  name?: string | number;
  option?: VxeButtonProps & Record<string, unknown>;
};

type ArrayTableToolbarExecutionContext = {
  action: ArrayTableToolbarButton;
  actionCode: string | number;
  command?: string;
  click: ArrayTableToolbarClickParams;
  rows: Record<string, unknown>[];
  field: LowCodeField;
  addRow: (row?: Record<string, unknown>) => Record<string, unknown>;
};

export type {
  ArrayTableToolbarButton,
  ArrayTableToolbarClickParams,
  ArrayTableToolbarExecute,
  ArrayTableToolbarExecutionContext,
};

type RowActionPredicate = boolean | ((payload: Record<string, unknown>) => boolean);
type RowActionText = string | ((payload: Record<string, unknown>) => string);

type ArrayTableRowAction = {
  code: string;
  label?: RowActionText;
  title?: RowActionText;
  icon?: string;
  status?: 'primary' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
  disabled?: RowActionPredicate;
  visible?: RowActionPredicate;
};

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: unknown[]];
}>();

const rows = ref<Record<string, unknown>[]>([]);
const tableRef = ref<{
  recalculate?: (refull?: boolean) => Promise<unknown> | void;
  refreshColumn?: () => Promise<unknown> | void;
  setCurrentRow?: (row: Record<string, unknown>) => Promise<unknown> | void;
  setTreeExpand?: (row: Record<string, unknown>, expanded: boolean) => Promise<unknown> | void;
}>();
const systemSettings = useSystemSettings();

const fieldProps = computed(() => props.field.props ?? {});
const valueMode = computed<ArrayTableValueMode>(() =>
  fieldProps.value.valueMode === 'primitive' ? 'primitive' : 'object'
);
const valueField = computed(() => readString(fieldProps.value.valueField, 'value'));
const columns = computed(() => {
  const normalizedColumns = normalizeColumns(fieldProps.value.columns);

  if (valueMode.value === 'primitive' && !normalizedColumns.length) {
    return [
      {
        field: valueField.value,
        title: readString(fieldProps.value.valueTitle, '值'),
        minWidth: 120,
        placeholder: readString(fieldProps.value.placeholder),
      },
    ];
  }

  return normalizedColumns;
});
const explicitTableConfig = computed(() => {
  const config = isRecord(fieldProps.value.gridOptions)
    ? cloneRecord(fieldProps.value.gridOptions)
    : {};
  const keys = [
    'size',
    'stripe',
    'border',
    'round',
    'showHeader',
    'showFooter',
    'showOverflow',
    'showHeaderOverflow',
    'showFooterOverflow',
    'height',
    'minHeight',
    'maxHeight',
    'rowHeight',
    'headerHeight',
    'headerRowHeight',
    'footerHeight',
    'footerRowHeight',
    'cellConfig',
    'headerCellConfig',
    'footerCellConfig',
    'rowConfig',
    'columnConfig',
    'sortConfig',
    'filterConfig',
    'tooltipConfig',
    'virtualXConfig',
    'virtualYConfig',
  ];

  keys.forEach((key) => {
    if (typeof fieldProps.value[key] !== 'undefined') {
      config[key] = fieldProps.value[key];
    }
  });

  return config;
});
const rowConfig = computed(() => {
  const gridRowConfig = isRecord(explicitTableConfig.value.rowConfig)
    ? explicitTableConfig.value.rowConfig
    : {};
  const config = isRecord(fieldProps.value.rowConfig) ? fieldProps.value.rowConfig : {};
  const keyField = readString(
    config.keyField ?? gridRowConfig.keyField,
    readString(fieldProps.value.rowKey, '__rowKey'),
  );

  return {
    ...gridRowConfig,
    ...config,
    keyField,
    isCurrent: config.isCurrent !== false && gridRowConfig.isCurrent !== false,
  };
});
const tableConfig = computed(() => {
  const explicitConfig = explicitTableConfig.value;
  const config = mergeSystemTableOptions(
    {
      ...explicitConfig,
      rowConfig: rowConfig.value,
    },
    resolveSystemTableConfig(systemSettings),
  );

  if (isFillHeight(config.height)) {
    if (typeof explicitConfig.minHeight === 'undefined') {
      config.minHeight = 0;
    }
    if (typeof explicitConfig.maxHeight === 'undefined') {
      delete config.maxHeight;
    }
  }

  return config;
});
const fillAvailableHeight = computed(() => isFillHeight(tableConfig.value.height));
const rowKey = computed(() => readString(rowConfig.value.keyField, '__rowKey'));
const treeConfig = computed(() => {
  const source = fieldProps.value.treeConfig;
  if (source !== true && !isRecord(source)) return undefined;

  const config = isRecord(source) ? cloneRecord(source) : {};
  return {
    ...config,
    transform: false,
    childrenField: readString(config.childrenField, 'children'),
    expandAll: config.expandAll !== false,
  };
});
const treeEnabled = computed(() => Boolean(treeConfig.value));
const treeChildrenField = computed(() =>
  readString(treeConfig.value?.childrenField, 'children')
);
const toolbarButtons = computed(() => readToolbarButtons(fieldProps.value.toolbarButtons));
const toolbarButtonOptions = computed<VxeButtonProps[]>(() =>
  toolbarButtons.value.map(
    ({
      code,
      label,
      command: _command,
      row: _row,
      visible: _visible,
      execute: _execute,
      ...buttonProps
    }) => ({
      ...buttonProps,
      name: code,
      content: buttonProps.content ?? label,
    })
  )
);
const addChildText = computed(() => readString(fieldProps.value.addChildText, '新增子项'));
const tableHeight = computed(() => readSize(tableConfig.value.height));
const showSeq = computed(() => fieldProps.value.showSeq !== false);
const showToolbar = computed(() => fieldProps.value.showToolbar !== false);
const showActions = computed(() => fieldProps.value.showActions !== false);
const toolbarAlign = computed(() => readToolbarAlign(fieldProps.value.toolbarAlign));
const copyable = computed(() => fieldProps.value.copyable === true);
const movable = computed(() => fieldProps.value.movable !== false);
const removable = computed(() => fieldProps.value.removable !== false);
const childAddable = computed(() => treeEnabled.value && fieldProps.value.childAddable === true);
const rowActions = computed(() => readRowActions(fieldProps.value.rowActions));
const preserveRowKey = computed(() => fieldProps.value.preserveRowKey === true);
const minRows = computed(() => {
  const numeric = Number(fieldProps.value.minRows);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
});
const actionWidth = computed(() => {
  const width = readSize(fieldProps.value.actionWidth);
  if (width) return width;
  if (rowActions.value.length) return Math.max(82, rowActions.value.length * 42 + 8);
  if (copyable.value && movable.value && removable.value) return 120;
  if (!movable.value || !removable.value) return 72;
  return 96;
});

watch(
  () => props.modelValue,
  (value) => {
    rows.value = normalizeRows(value);
    resizeTable();
  },
  { immediate: true, deep: true }
);

watch(
  () => [
    columns.value,
    tableHeight.value,
    showSeq.value,
    showActions.value,
    actionWidth.value,
    rowActions.value,
    tableConfig.value,
  ],
  () => resizeTable(),
  { deep: true }
);

onMounted(() => resizeTable());

function resizeTable() {
  nextTick(() => {
    tableRef.value?.refreshColumn?.();
    tableRef.value?.recalculate?.(true);
  });
}

function normalizeColumns(value: unknown): ArrayTableColumn[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((column, index) => {
      const field = readString(column.field, `field${index + 1}`);
      return {
        field,
        title: readString(column.title ?? column.label, field),
        type: readString(column.type) || undefined,
        component: readComponent(column.component),
        width: readSize(column.width),
        minWidth: readSize(column.minWidth),
        align: readAlign(column.align),
        headerAlign: readAlign(column.headerAlign),
        placeholder: readString(column.placeholder),
        defaultValue: column.defaultValue,
        readonly: readBoolean(column.readonly),
        props: {
          ...(isRecord(column.props) ? cloneRecord(column.props) : {}),
          ...readJsonObject(column.propsJson),
        },
        options: Array.isArray(column.options)
          ? cloneValue(column.options) as LowCodeOption[]
          : readJsonArray<LowCodeOption>(column.optionsJson) ?? [],
      };
    });
}

function normalizeRows(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  return source.map((item, index) => normalizeRow(item, index));
}

function normalizeRow(value: unknown, index: number): Record<string, unknown> {
  const row =
    valueMode.value === 'primitive'
      ? { [valueField.value]: value }
      : isRecord(value)
        ? cloneRecord(value)
        : {};
  ensureRowKey(row, index);

  if (treeEnabled.value) {
    const childrenField = treeChildrenField.value;
    const children = Array.isArray(row[childrenField]) ? row[childrenField] : [];
    row[childrenField] = children.map((child, childIndex) =>
      normalizeRow(child, childIndex)
    );
  }

  return row;
}

function createDefaultRow(toolbarRow?: Record<string, unknown>) {
  const row = isRecord(toolbarRow)
    ? cloneRecord(toolbarRow)
    : isRecord(fieldProps.value.defaultRow)
      ? cloneRecord(fieldProps.value.defaultRow)
      : {};
  const rowIndex = rows.value.length + 1;

  columns.value.forEach((column) => {
    if (row[column.field] === undefined) {
      row[column.field] = resolveTemplate(
        column.defaultValue ?? getEmptyValue(column),
        rowIndex
      );
    }
  });

  Object.keys(row).forEach((key) => {
    row[key] = resolveTemplate(row[key], rowIndex);
  });

  ensureRowKey(row, rowIndex - 1);
  return row;
}

function addRow(toolbarRow?: Record<string, unknown>) {
  const row = createDefaultRow(toolbarRow);
  rows.value.push(row);
  ensureChildRowKeys(row);
  commitRows();
  emitConfiguredEvent('onRowAdd', rowEventPayload(row));
  return row;
}

async function handleToolbarButtonClick(payload: ArrayTableToolbarClickParams) {
  const clickedCode = payload.option?.name ?? payload.name;
  const button = toolbarButtons.value.find((item) => item.code === clickedCode);
  if (!button || button.disabled) return;

  const actionPayload = {
    action: button,
    actionCode: button.code,
    command: button.command,
    rows: rows.value,
    field: props.field,
    rawEvent: payload,
  };

  if (typeof button.execute === 'function') {
    await button.execute({
      ...actionPayload,
      click: payload,
      addRow,
    });
    return;
  }

  emitConfiguredEvent('onToolbarAction', actionPayload);
}

function ensureChildRowKeys(row: Record<string, unknown>) {
  getChildRows(row).forEach((child, index) => {
    ensureRowKey(child, index);
    ensureChildRowKeys(child);
  });
}

function addChildRow(parent: Record<string, unknown>) {
  const children = getChildRows(parent, true);
  const child = createDefaultRow();
  children.push(child);
  commitRows();
  emitConfiguredEvent('onRowAddChild', rowEventPayload(child, { parent }));

  nextTick(() => {
    tableRef.value?.setTreeExpand?.(parent, true);
  });
}

function setCell(row: Record<string, unknown>, field: string, value: unknown) {
  row[field] = value;
  commitRows();
}

async function openObjectEditor(row: Record<string, unknown>, column: ArrayTableColumn) {
  if (column.readonly) return;

  const value = createObjectEditorValue(row[column.field], column);
  const schema = resolveObjectEditorSchema(column, value);
  if (!schema) return;
  const result = await openGlobalDialog({
    title: `编辑 ${column.title || column.field}`,
    width: 'min(720px, calc(100vw - 48px))',
    showFooter: true,
    model: value,
    form: {
      schema,
    },
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '确定',
        role: 'confirm',
        status: 'primary',
      },
    ],
  });

  if (result.action === 'confirm' && isRecord(result.values)) {
    setCell(row, column.field, cloneRecord(result.values));
  }
}

function removeRow(row: Record<string, unknown>) {
  const location = findRowLocation(row);
  if (!location || !canRemoveRow(row)) return;

  location.siblings.splice(location.index, 1);
  commitRows();
}

function copyRow(row: Record<string, unknown>) {
  const location = findRowLocation(row);
  if (!location) return;

  const copy = cloneRecord(row);
  assignTreeRowKeys(copy);
  location.siblings.splice(location.index + 1, 0, copy);
  commitRows();
  emitConfiguredEvent('onRowCopy', rowEventPayload(copy));
}

function moveRow(row: Record<string, unknown>, offset: number) {
  const location = findRowLocation(row);
  if (!location) return;

  const nextIndex = location.index + offset;
  if (nextIndex < 0 || nextIndex >= location.siblings.length) return;

  const [current] = location.siblings.splice(location.index, 1);
  location.siblings.splice(nextIndex, 0, current);
  commitRows();
}

function getRowIndex(row: Record<string, unknown>) {
  return flattenRows(rows.value).indexOf(row);
}

function getSiblingIndex(row: Record<string, unknown>) {
  return findRowLocation(row)?.index ?? -1;
}

function getSiblingRows(row: Record<string, unknown>) {
  return findRowLocation(row)?.siblings ?? [];
}

function canRemoveRow(row: Record<string, unknown>) {
  const location = findRowLocation(row);
  if (!location) return false;
  return Boolean(location.parent) || rows.value.length > minRows.value;
}

function commitRows() {
  const key = rowKey.value;
  const value =
    valueMode.value === 'primitive'
      ? rows.value.map((row) => cloneValue(row[valueField.value]))
      : rows.value.map((row) => serializeRow(row, key));

  emit('update:modelValue', value);
  emitConfiguredEvent('onRowsChange', {
    rows: cloneValue(value),
    field: props.field,
  });
}

function ensureRowKey(row: Record<string, unknown>, index: number) {
  const key = rowKey.value;
  if (row[key] === undefined || row[key] === '') {
    assignRowKey(row, index);
  }
}

function assignRowKey(row: Record<string, unknown>, index: number) {
  const key = rowKey.value;
  const prefix = key.startsWith('__') ? 'row' : key;
  let seed = Math.max(index + 1, flattenRows(rows.value).length + 1);

  do {
    row[key] = `${prefix}_${seed}`;
    seed += 1;
  } while (flattenRows(rows.value).some((item) => item !== row && item[key] === row[key]));
}

function assignTreeRowKeys(row: Record<string, unknown>) {
  assignRowKey(row, flattenRows(rows.value).length);
  getChildRows(row).forEach((child) => assignTreeRowKeys(child));
}

function serializeRow(row: Record<string, unknown>, key: string) {
  const next = cloneRecord(row);

  if (key.startsWith('__') && !preserveRowKey.value) {
    delete next[key];
  }

  if (treeEnabled.value) {
    const childrenField = treeChildrenField.value;
    next[childrenField] = getChildRows(row).map((child) => serializeRow(child, key));
  }

  return next;
}

function getChildRows(row: Record<string, unknown>, create = false) {
  if (!treeEnabled.value) return [];

  const field = treeChildrenField.value;
  if (!Array.isArray(row[field])) {
    if (!create) return [];
    row[field] = [];
  }

  return row[field] as Record<string, unknown>[];
}

function flattenRows(
  source: Record<string, unknown>[],
  result: Record<string, unknown>[] = [],
) {
  source.forEach((row) => {
    result.push(row);
    flattenRows(getChildRows(row), result);
  });
  return result;
}

function findRowLocation(
  target: Record<string, unknown>,
  siblings = rows.value,
  parent?: Record<string, unknown>,
): { siblings: Record<string, unknown>[]; index: number; parent?: Record<string, unknown> } | undefined {
  const index = siblings.indexOf(target);
  if (index >= 0) return { siblings, index, parent };

  for (const row of siblings) {
    const location = findRowLocation(target, getChildRows(row), row);
    if (location) return location;
  }

  return undefined;
}

function isTreeNodeColumn(column: ArrayTableColumn) {
  return treeEnabled.value && columns.value[0]?.field === column.field;
}

function getEmptyValue(column: ArrayTableColumn) {
  if (column.component === 'vxe-switch') return false;
  if (column.component === 'lc-number-input') return 0;
  if (column.component === 'lc-sub-form') {
    return isRecord(column.defaultValue) ? cloneRecord(column.defaultValue) : {};
  }
  return '';
}

function readComponent(value: unknown): ArrayTableColumn['component'] {
  return typeof value === 'string' && value.trim() ? value.trim() : 'vxe-input';
}

function executeAddToolbarAction({ action, addRow }: ArrayTableToolbarExecutionContext) {
  return addRow(action.row);
}

// Persisted schemas may still carry command: 'add'; normalize them to the callback contract.
const legacyToolbarCommandExecutors: Record<string, ArrayTableToolbarExecute> = {
  add: executeAddToolbarAction,
};

function readToolbarButtons(value: unknown): ArrayTableToolbarButton[] {
  const source = Array.isArray(value)
    ? value
    : [
        {
          code: 'add',
          label: '新增',
          command: 'add',
          status: 'primary',
        },
      ];

  return source
    .filter(isRecord)
    .filter((button) => button.visible !== false)
    .map((button, index) => {
      const code = readButtonCode(button.code ?? button.name, `toolbar_${index + 1}`);
      const label = readString(button.label ?? button.content, String(code));
      const command = readString(button.command);
      const execute = typeof button.execute === 'function'
        ? button.execute as ArrayTableToolbarExecute
        : legacyToolbarCommandExecutors[command];
      const { execute: _execute, ...buttonProps } = button;

      return {
        ...(buttonProps as VxeButtonProps),
        code,
        label,
        ...(command ? { command } : {}),
        ...(execute ? { execute } : {}),
      };
    });
}

function readButtonCode(value: unknown, fallback: string): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return readString(value, fallback);
}

function readRowActions(value: unknown): ArrayTableRowAction[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((action) => ({
      code: readString(action.code),
      label: readRowActionText(action.label),
      title: readRowActionText(action.title),
      icon: readString(action.icon),
      status: readStatus(action.status),
      className: readString(action.className),
      disabled: action.disabled as RowActionPredicate | undefined,
      visible: action.visible as RowActionPredicate | undefined,
    }))
    .filter((action) => action.code);
}

function readRowActionText(value: unknown): RowActionText | undefined {
  if (typeof value === 'function') return value as RowActionText;
  const text = readString(value);
  return text || undefined;
}

function readStatus(value: unknown): ArrayTableRowAction['status'] | undefined {
  const status = readString(value);
  return ['primary', 'success', 'warning', 'danger', 'info'].includes(status)
    ? (status as ArrayTableRowAction['status'])
    : undefined;
}

function resolveRowPredicate(predicate: RowActionPredicate | undefined, row: Record<string, unknown>, fallback: boolean) {
  if (typeof predicate === 'function') {
    return predicate(rowEventPayload(row));
  }

  if (typeof predicate === 'boolean') return predicate;
  return fallback;
}

function visibleRowActions(row: Record<string, unknown>) {
  return rowActions.value.filter((action) => resolveRowPredicate(action.visible, row, true));
}

function isRowActionDisabled(action: ArrayTableRowAction, row: Record<string, unknown>) {
  return resolveRowPredicate(action.disabled, row, false);
}

function resolveRowActionText(value: RowActionText | undefined, row: Record<string, unknown>) {
  if (typeof value === 'function') return value(rowEventPayload(row));
  return value ?? '';
}

function rowActionLabel(action: ArrayTableRowAction, row: Record<string, unknown>) {
  return resolveRowActionText(action.label, row);
}

function rowActionTitle(action: ArrayTableRowAction, row: Record<string, unknown>) {
  return resolveRowActionText(action.title, row) || rowActionLabel(action, row);
}

function handleRowAction(action: ArrayTableRowAction, row: Record<string, unknown>) {
  emitConfiguredEvent('onRowAction', {
    ...rowEventPayload(row),
    action,
    actionCode: action.code,
  });
}

function getSelectModelValue(column: ArrayTableColumn, value: unknown): any {
  const option = column.options?.find((item) => isSameValue(readOptionRawValue(item), value));
  return option?.value ?? value;
}

function readSelectValue(column: ArrayTableColumn, value: unknown) {
  const option = column.options?.find((item) => item.value === value);
  return option ? readOptionRawValue(option) : value;
}

function readOptionRawValue(option: LowCodeOption) {
  return Object.prototype.hasOwnProperty.call(option, 'rawValue')
    ? option.rawValue
    : option.value;
}

function createCellField(column: ArrayTableColumn): LowCodeField {
  return {
    field: column.field,
    label: column.title,
    component: column.component || 'vxe-input',
    props: {
      rows: 4,
      placeholder: column.placeholder,
      ...(column.props ?? {}),
    },
  };
}

function shouldUseObjectEditor(column: ArrayTableColumn, row: Record<string, unknown>) {
  return column.component === 'lc-sub-form' || isRecord(row[column.field]);
}

function isUnconfiguredSubFormColumn(column: ArrayTableColumn) {
  return column.component === 'lc-sub-form' && !isLowCodeFormSchema(column.props?.schema);
}

function formatObjectPreview(value: unknown) {
  if (!isRecord(value)) return '{}';
  if (!Object.keys(value).length) return '{}';

  try {
    return JSON.stringify(value);
  } catch {
    return '[object]';
  }
}

function formatCellText(value: unknown) {
  if (value === null || typeof value === 'undefined') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createObjectEditorValue(value: unknown, column: ArrayTableColumn) {
  return {
    ...(isRecord(column.defaultValue) ? cloneRecord(column.defaultValue) : {}),
    ...(isRecord(value) ? cloneRecord(value) : {}),
  };
}

function resolveObjectEditorSchema(
  column: ArrayTableColumn | null,
  value: Record<string, unknown>,
): LowCodeFormSchema | null {
  const schema = readLowCodeFormSchema(column?.props?.schema);

  if (schema) {
    return {
      ...schema,
      fields: schema.fields.length ? schema.fields : inferObjectEditorFields(value),
      actions: Array.isArray(schema.actions) ? schema.actions : [],
    };
  }

  if (column?.component === 'lc-sub-form') return null;

  return {
    fields: inferObjectEditorFields(value),
    actions: [],
  };
}

function readLowCodeFormSchema(value: unknown): LowCodeFormSchema | undefined {
  if (!isLowCodeFormSchema(value)) return undefined;

  return {
    ...(cloneRecord(value) as LowCodeFormSchema),
    fields: (value.fields as unknown[]).filter(isRecord).map((field) => cloneRecord(field) as LowCodeField),
    actions: cloneValue(value.actions) as LowCodeFormSchema['actions'],
  };
}

function inferObjectEditorFields(value: Record<string, unknown>): LowCodeField[] {
  return Object.keys(value).map((field) => {
    const currentValue = value[field];

    if (typeof currentValue === 'boolean') {
      return { field, label: field, component: 'vxe-switch' };
    }

    if (typeof currentValue === 'number') {
      return { field, label: field, component: 'lc-number-input' };
    }

    if (isRecord(currentValue)) {
      return createSubFormField({
        field,
        label: field,
        fields: inferObjectEditorFields(currentValue),
      });
    }

    if (Array.isArray(currentValue)) {
      return {
        field,
        label: field,
        component: 'lc-json-editor',
        props: { rows: 4, placeholder: '[]' },
      };
    }

    return { field, label: field, component: 'vxe-input' };
  });
}

function toNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function readSize(value: unknown) {
  return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}

function isFillHeight(value: unknown) {
  return typeof value === 'string' && ['100%', 'auto'].includes(value.trim());
}

function readToolbarAlign(value: unknown) {
  const align = readString(value, 'left');
  return ['left', 'center', 'right', 'space-between'].includes(align) ? align : 'left';
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }

  return fallback;
}

function readString(value: unknown, fallback = '') {
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function readJsonObject(value: unknown) {
  if (isRecord(value)) return cloneRecord(value);
  if (typeof value !== 'string' || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function readJsonArray<T>(value: unknown) {
  if (Array.isArray(value)) return cloneValue(value) as T[];
  if (typeof value !== 'string' || !value.trim()) return undefined;

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : undefined;
  } catch {
    return undefined;
  }
}

function resolveTemplate(value: unknown, index: number) {
  if (typeof value !== 'string') return cloneValue(value);
  return value.replace(/\{\{\s*index\s*\}\}/g, String(index));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rowEventPayload(row: Record<string, unknown>, rawEvent: Record<string, unknown> = {}) {
  return {
    row,
    index: getRowIndex(row),
    rows: rows.value,
    field: props.field,
    rawEvent,
  };
}

function emitConfiguredEvent(name: string, payload: Record<string, unknown>) {
  const directHandler = fieldProps.value[name];
  const events = isRecord(fieldProps.value.events) ? fieldProps.value.events : {};
  const eventHandler = events[name];
  const handler = typeof directHandler === 'function' ? directHandler : eventHandler;

  if (typeof handler === 'function') {
    handler(payload);
  }
}

function handleCellClick(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.row)) return;
  if (rowConfig.value.isCurrent !== false) {
    tableRef.value?.setCurrentRow?.(payload.row);
  }
  emitConfiguredEvent('onRowClick', rowEventPayload(payload.row, payload));
}

function readAlign(value: unknown): ArrayTableColumn['align'] {
  const align = readString(value);
  return align === 'left' || align === 'center' || align === 'right'
    ? align
    : undefined;
}

function handleRowDblclick(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.row)) return;
  emitConfiguredEvent('onRowDblclick', rowEventPayload(payload.row, payload));
}

function isSameValue(prev: unknown, next: unknown) {
  if (Object.is(prev, next)) return true;

  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
}

function cloneRecord(value: Record<string, unknown>) {
  return cloneValue(value) as Record<string, unknown>;
}

function cloneValue(value: unknown) {
  if (!isRecord(value) && !Array.isArray(value)) return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}
</script>

<style scoped>
.lc-array-table {
  display: grid;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 8px;
  overflow: hidden;
}

.lc-array-table--fill {
  height: 100%;
  min-height: 0;
  grid-template-rows: auto minmax(0, 1fr);
}

.lc-array-table--fill .lc-array-table__viewport,
.lc-array-table--fill .lc-array-table__grid {
  height: 100%;
  min-height: 0;
}
/* 
描述
*/

.lc-array-table__toolbar {
  display: flex;
  min-width: 0;
  justify-content: flex-start;
}

.lc-array-table__toolbar.is-center {
  justify-content: center;
}

.lc-array-table__toolbar.is-right {
  justify-content: flex-end;
}

.lc-array-table__toolbar.is-space-between {
  justify-content: space-between;
}

.lc-array-table__viewport {
  display: grid;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.lc-array-table__grid {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  min-height: 0;
}

.lc-array-table__grid :deep(.vxe-table--render-wrapper),
.lc-array-table__grid :deep(.vxe-table--main-wrapper),
.lc-array-table__grid :deep(.vxe-table--body-wrapper),
.lc-array-table__grid :deep(.vxe-table--header-wrapper) {
  min-width: 0;
}

.lc-array-table__grid :deep(.vxe-input),
.lc-array-table__grid :deep(.vxe-password-input),
.lc-array-table__grid :deep(.vxe-number-input),
.lc-array-table__grid :deep(.vxe-textarea),
.lc-array-table__grid :deep(.vxe-select),
.lc-array-table__grid :deep(.lc-array-table__object-cell),
.lc-array-table__grid :deep(.lc-json-editor),
.lc-array-table__grid :deep(.lc-monaco-editor) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.lc-array-table__grid :deep(.vxe-cell),
.lc-array-table__grid :deep(.vxe-table--body),
.lc-array-table__grid :deep(.vxe-table--header) {
  min-width: 0;
}

.lc-array-table__grid :deep(.vxe-body--column),
.lc-array-table__grid :deep(.vxe-header--column) {
  vertical-align: inherit;
}

.lc-array-table__object-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
}

.lc-array-table__unconfigured-sub-form {
  grid-column: 1 / -1;
  color: #b42318;
  font-size: 12px;
  text-align: center;
}

.lc-array-table__text-cell {
  display: block;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  color: #1f2937;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lc-array-table__actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.lc-array-table__object-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.lc-array-table__object-cell button,
.lc-array-table__actions button {
  min-width: 22px;
  height: 22px;
  padding: 0 4px;
  border: 1px solid #d8e0ea;
  border-radius: 5px;
  background: #fff;
  color: #475569;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}

.lc-array-table__actions button:hover:not(:disabled) {
  border-color: #93c5fd;
  color: #1d73d8;
}

.lc-array-table__object-cell button:hover,
.lc-array-table__actions button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.lc-array-table__object-cell button:hover {
  cursor: pointer;
  opacity: 1;
  border-color: #93c5fd;
  color: #1d73d8;
}

.lc-array-table__actions button.is-danger {
  color: #dc2626;
}

.lc-array-table__actions button.is-primary {
  color: #1d73d8;
}

.lc-array-table__actions button.is-success {
  color: #15803d;
}

.lc-array-table__actions button.is-warning {
  color: #ca8a04;
}

.lc-array-table__actions button.is-info {
  color: #475569;
}
</style>
