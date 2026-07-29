<template>
  <div class="lc-array-table">
    <div class="lc-array-table__toolbar">
      <vxe-button size="mini" status="primary" @click="addRow">
        {{ addText }}
      </vxe-button>
    </div>

    <div class="lc-array-table__viewport">
      <vxe-table
      border
      show-overflow
      size="mini"
      class="lc-array-table__grid"
      :data="rows"
      :row-config="{ keyField: rowKey }"
    >
      <vxe-column type="seq" width="42" />
      <vxe-column
        v-for="column in columns"
        :key="column.field"
        :field="column.field"
        :title="column.title"
        :width="column.width"
        :min-width="column.minWidth || 100"
      >
        <template #default="scope">
          <template v-if="isRecord(scope?.row)">
          <vxe-switch
            v-if="column.component === 'vxe-switch'"
            :model-value="Boolean(scope.row[column.field])"
            @update:model-value="(value) => setCell(scope.row, column.field, value)"
          />
          <vxe-select
            v-else-if="column.component === 'vxe-select'"
            :model-value="getSelectModelValue(column, scope.row[column.field])"
            v-bind="column.props"
            transfer
            clearable
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
            <vxe-input
              :model-value="formatObjectPreview(scope.row[column.field])"
              :placeholder="column.placeholder"
              readonly
            />
            <button type="button" @click="openObjectEditor(scope.row, column)">编辑</button>
          </div>
          <vxe-textarea
            v-else-if="column.component === 'vxe-textarea'"
            :model-value="readString(scope.row[column.field])"
            :placeholder="column.placeholder"
            v-bind="column.props"
            @update:model-value="(value) => setCell(scope.row, column.field, value)"
          />
          <vxe-password-input
            v-else-if="column.component === 'vxe-password-input'"
            :model-value="readString(scope.row[column.field])"
            :placeholder="column.placeholder"
            v-bind="column.props"
            clearable
            @update:model-value="(value) => setCell(scope.row, column.field, value)"
          />
          <vxe-number-input
            v-else-if="column.component === 'lc-number-input'"
            :model-value="toNumber(scope.row[column.field])"
            :placeholder="column.placeholder"
            v-bind="column.props"
            @update:model-value="(value) => setCell(scope.row, column.field, value)"
          />
          <LcJsonEditor
            v-else-if="column.component === 'lc-json-editor'"
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
            @update:model-value="(value) => setCell(scope.row, column.field, value)"
          />
          </template>
        </template>
      </vxe-column>
      <vxe-column title="操作" width="96" fixed="right">
        <template #default="scope">
          <div v-if="isRecord(scope?.row)" class="lc-array-table__actions">
            <button
              type="button"
              :disabled="getRowIndex(scope.row) <= 0"
              @click="moveRow(scope.row, -1)"
            >
              上
            </button>
            <button
              type="button"
              :disabled="getRowIndex(scope.row) >= rows.length - 1"
              @click="moveRow(scope.row, 1)"
            >
              下
            </button>
            <button type="button" class="is-danger" @click="removeRow(scope.row)">删</button>
          </div>
        </template>
      </vxe-column>
      </vxe-table>
    </div>

    <vxe-modal
      v-model="objectEditor.visible"
      :title="objectEditor.title"
      width="min(720px, calc(100vw - 48px))"
      show-footer
      transfer
      @close="closeObjectEditor"
    >
      <LowCodeForm
        :key="objectEditor.key"
        :schema="objectEditorSchema"
        :model-value="objectEditor.value"
        @update:model-value="updateObjectEditorValue"
      />
      <template #footer>
        <div class="lc-array-table__object-footer">
          <vxe-button @click="closeObjectEditor">取消</vxe-button>
          <vxe-button status="primary" @click="confirmObjectEditor">确定</vxe-button>
        </div>
      </template>
    </vxe-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, reactive, ref, watch } from 'vue';
import type { LowCodeField, LowCodeFieldComponent, LowCodeOption } from '../../../types/lowcode';
import LcJsonEditor from '../lc-json-editor/index.vue';
import type { LowCodeFormMaterialProps } from '../types';

const LowCodeForm = defineAsyncComponent(() => import('../../../components/LowCodeForm.vue'));

type ArrayTableColumn = {
  field: string;
  title: string;
  component?: LowCodeFieldComponent;
  width?: number | string;
  minWidth?: number | string;
  placeholder?: string;
  defaultValue?: unknown;
  props?: Record<string, unknown>;
  options?: LowCodeOption[];
};

type ArrayTableValueMode = 'object' | 'primitive';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: unknown[]];
}>();

const rows = ref<Record<string, unknown>[]>([]);
const objectEditor = reactive({
  visible: false,
  title: '编辑对象',
  row: null as Record<string, unknown> | null,
  column: null as ArrayTableColumn | null,
  value: {} as Record<string, unknown>,
  key: 0,
});

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
const rowKey = computed(() => readString(fieldProps.value.rowKey, '__rowKey'));
const addText = computed(() => readString(fieldProps.value.addText, '新增'));
const objectEditorSchema = computed(() => ({
  fields: resolveObjectEditorFields(objectEditor.column, objectEditor.value),
  actions: [],
}));

watch(
  () => props.modelValue,
  (value) => {
    rows.value = normalizeRows(value);
  },
  { immediate: true, deep: true }
);

function normalizeColumns(value: unknown): ArrayTableColumn[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((column, index) => {
      const field = readString(column.field, `field${index + 1}`);
      return {
        field,
        title: readString(column.title ?? column.label, field),
        component: readComponent(column.component),
        width: readSize(column.width),
        minWidth: readSize(column.minWidth),
        placeholder: readString(column.placeholder),
        defaultValue: column.defaultValue,
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
  return source.map((item, index) => {
    const row =
      valueMode.value === 'primitive'
        ? { [valueField.value]: item }
        : isRecord(item)
          ? cloneRecord(item)
          : {};
    ensureRowKey(row, index);
    return row;
  });
}

function createDefaultRow() {
  const row = isRecord(fieldProps.value.defaultRow)
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

function addRow() {
  rows.value.push(createDefaultRow());
  commitRows();
}

function setCell(row: Record<string, unknown>, field: string, value: unknown) {
  row[field] = value;
  commitRows();
}

function openObjectEditor(row: Record<string, unknown>, column: ArrayTableColumn) {
  objectEditor.row = row;
  objectEditor.column = column;
  objectEditor.title = `编辑 ${column.title || column.field}`;
  objectEditor.value = createObjectEditorValue(row[column.field], column);
  objectEditor.key += 1;
  objectEditor.visible = true;
}

function updateObjectEditorValue(value: Record<string, unknown>) {
  objectEditor.value = isRecord(value) ? cloneRecord(value) : {};
}

function confirmObjectEditor() {
  if (objectEditor.row && objectEditor.column) {
    setCell(objectEditor.row, objectEditor.column.field, cloneRecord(objectEditor.value));
  }

  closeObjectEditor();
}

function closeObjectEditor() {
  objectEditor.visible = false;
}

function removeRow(row: Record<string, unknown>) {
  const index = getRowIndex(row);
  if (index < 0) return;
  rows.value.splice(index, 1);
  commitRows();
}

function moveRow(row: Record<string, unknown>, offset: number) {
  const index = getRowIndex(row);
  const nextIndex = index + offset;
  if (index < 0 || nextIndex < 0 || nextIndex >= rows.value.length) return;

  const [current] = rows.value.splice(index, 1);
  rows.value.splice(nextIndex, 0, current);
  commitRows();
}

function getRowIndex(row: Record<string, unknown>) {
  return rows.value.indexOf(row);
}

function commitRows() {
  const key = rowKey.value;
  const value =
    valueMode.value === 'primitive'
      ? rows.value.map((row) => cloneValue(row[valueField.value]))
      : rows.value.map((row) => {
          const next = cloneRecord(row);
          if (key.startsWith('__')) {
            delete next[key];
          }
          return next;
        });

  emit('update:modelValue', value);
}

function ensureRowKey(row: Record<string, unknown>, index: number) {
  const key = rowKey.value;
  if (row[key] === undefined || row[key] === '') {
    row[key] = `${key.startsWith('__') ? 'row' : key}_${index + 1}`;
  }
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

function formatObjectPreview(value: unknown) {
  if (!isRecord(value)) return '{}';
  if (!Object.keys(value).length) return '{}';

  try {
    return JSON.stringify(value);
  } catch {
    return '[object]';
  }
}

function createObjectEditorValue(value: unknown, column: ArrayTableColumn) {
  return {
    ...(isRecord(column.defaultValue) ? cloneRecord(column.defaultValue) : {}),
    ...(isRecord(value) ? cloneRecord(value) : {}),
  };
}

function resolveObjectEditorFields(
  column: ArrayTableColumn | null,
  value: Record<string, unknown>,
): LowCodeField[] {
  const configuredFields = Array.isArray(column?.props?.fields)
    ? (column.props.fields as unknown[]).filter(isRecord).map((field) => cloneRecord(field) as LowCodeField)
    : [];

  return configuredFields.length ? configuredFields : inferObjectEditorFields(value);
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
      return {
        field,
        label: field,
        component: 'lc-sub-form',
        props: {
          fields: inferObjectEditorFields(currentValue),
        },
      };
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

.lc-array-table__toolbar {
  display: flex;
  min-width: 0;
  justify-content: flex-end;
}

.lc-array-table__viewport {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.lc-array-table__grid {
  width: 100%;
  max-width: 100%;
  min-width: 0;
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
.lc-array-table__grid :deep(.lc-json-editor) {
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
  vertical-align: top;
}

.lc-array-table__grid :deep(.lc-json-editor .vxe-textarea) {
  width: 100%;
}

.lc-array-table__object-cell {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
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
</style>
