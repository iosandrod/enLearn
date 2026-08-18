<template>
  <div :class="['mobile-field', { 'is-disabled': disabled, 'is-readonly': readonly }]">
    <div v-if="showLabel && field.showTitle !== false" class="field-heading">
      <span class="field-label">{{ field.label }}</span>
      <span v-if="required" class="field-required">*</span>
    </div>

    <div v-if="kind === 'switch' || kind === 'boolean'" class="switch-row">
      <button
        :class="[
          kind === 'boolean' ? 'boolean-control' : 'switch-control',
          { 'is-active': Boolean(modelValue) },
        ]"
        :disabled="interactiveDisabled"
        @click="toggleSwitch"
      >
        <div v-if="kind === 'switch'" class="switch-track">
          <div class="switch-thumb" />
        </div>
        <div v-else class="boolean-check">
          <span v-if="modelValue" class="boolean-check-text">✓</span>
        </div>
        <span class="switch-text">
          {{ kind === 'boolean' ? booleanLabel : modelValue ? switchOpenText : switchClosedText }}
        </span>
      </button>
    </div>

    <div v-else-if="kind === 'number'" class="number-control">
      <button
        class="number-step"
        :disabled="interactiveDisabled || !canStepDown"
        @click="stepNumber(-1)"
      >
        <span class="number-step-text">−</span>
      </button>
      <input
        class="field-input number-input"
        type="number"
        :value="inputDisplayValue"
        :placeholder="placeholder"
        :disabled="interactiveDisabled"
        @change="commitNumber(readInputEventValue($event))"
      />
      <button
        class="number-step"
        :disabled="interactiveDisabled || !canStepUp"
        @click="stepNumber(1)"
      >
        <span class="number-step-text">+</span>
      </button>
    </div>

    <textarea
      v-else-if="kind === 'textarea'"
      class="field-input field-textarea"
      :value="textareaValue"
      :placeholder="placeholder"
      :rows="textareaRows"
      :disabled="interactiveDisabled"
      @change="commitTextarea(readInputEventValue($event))"
    />

    <div v-else-if="kind === 'json'" class="json-control">
      <div class="json-preview-row">
        <input
          class="field-input json-preview"
          type="text"
          :value="jsonPreviewValue"
          :placeholder="placeholder"
          disabled
        />
        <button
          type="button"
          class="json-edit-button"
          :disabled="disabled"
          :aria-label="jsonEditorActionLabel"
          @click="openJsonEditor"
        >
          <span class="json-edit-icon">{}</span>
        </button>
      </div>

      <dialog
        v-if="jsonEditorOpen"
        class="json-dialog"
        transparent
        :animated="false"
        animation-type="none"
        @request-close="closeJsonEditor"
      >
        <div class="json-dialog-mask" @click="closeJsonEditor">
          <div class="json-dialog-panel" @click.stop>
            <div class="json-dialog-heading">
              <span class="json-dialog-title">{{ jsonEditorActionLabel }} - {{ field.label }}</span>
              <button type="button" class="json-dialog-close" aria-label="关闭" @click="closeJsonEditor">
                <span class="json-dialog-close-text">×</span>
              </button>
            </div>
            <textarea
              class="field-input field-textarea json-dialog-editor"
              :value="jsonDraft"
              :placeholder="placeholder"
              :rows="textareaRows"
              :disabled="readonly"
              @input="updateJsonDraft(readInputEventValue($event))"
            />
            <span v-if="jsonDraftError" class="field-error json-dialog-error">
              {{ jsonDraftError }}
            </span>
            <div class="json-dialog-actions">
              <button type="button" class="json-dialog-action" @click="closeJsonEditor">
                <span class="json-dialog-action-text">{{ readonly ? '关闭' : '取消' }}</span>
              </button>
              <button
                v-if="!readonly"
                type="button"
                class="json-dialog-action is-primary"
                @click="commitJsonDraft"
              >
                <span class="json-dialog-action-text is-primary">确定</span>
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </div>

    <div
      v-else-if="kind === 'text' || kind === 'password'"
      :class="['text-control', { 'is-focused': inputFocused }]"
    >
      <input
        class="field-input text-input"
        :type="kind === 'password' ? 'password' : inputType"
        :value="inputDisplayValue"
        :placeholder="placeholder"
        :maxlength="maxLength"
        :disabled="interactiveDisabled"
        @focus="inputFocused = true"
        @blur="inputFocused = false"
        @change="commitInput(readInputEventValue($event))"
      />
    </div>

    <div v-else-if="kind === 'select' || kind === 'tree' || kind === 'cascader'" class="select-control">
      <button
        :class="['select-trigger', { 'is-open': panelOpen, 'has-value': selectedLabels.length }]"
        :disabled="interactiveDisabled"
        @click="togglePanel"
      >
        <div class="select-trigger-copy">
          <span :class="['select-trigger-text', { 'is-placeholder': !selectedLabels.length }]">
            {{ selectedText }}
          </span>
        </div>
        <span class="select-chevron">{{ panelOpen ? '▲' : '▼' }}</span>
      </button>

      <div v-if="panelOpen" class="option-panel">
        <input
          v-if="searchable"
          class="option-search"
          type="text"
          :value="searchText"
          placeholder="搜索选项"
          @change="searchText = readInputEventValue($event)"
        />
        <div class="option-scroll">
          <div class="option-list">
            <button
              v-for="option in visibleOptions"
              :key="optionKey(option)"
              :class="['option-item', { 'is-selected': isOptionSelected(option) }]"
              :disabled="option.disabled"
              :style="optionIndentStyle(option)"
              @click="selectOption(option)"
            >
              <div
                v-if="multiple"
                :class="['option-check', { 'is-checked': isOptionSelected(option) }]"
              >
                <span v-if="isOptionSelected(option)" class="option-check-text">✓</span>
              </div>
              <div
                v-else
                :class="['option-radio', { 'is-selected': isOptionSelected(option) }]"
              >
                <div v-if="isOptionSelected(option)" class="option-radio-dot" />
              </div>
              <span class="option-label">{{ optionLabel(option) }}</span>
            </button>
            <span v-if="!visibleOptions.length" class="option-empty">暂无匹配选项</span>
          </div>
        </div>
        <div v-if="multiple" class="option-panel-actions">
          <button class="option-panel-action" @click="clearSelection">
            <span class="option-panel-action-text">清空</span>
          </button>
          <button class="option-panel-action is-primary" @click="panelOpen = false">
            <span class="option-panel-action-text is-primary">完成</span>
          </button>
        </div>
      </div>
    </div>

    <div v-else-if="kind === 'radio' || kind === 'checkbox'" class="choice-list">
      <button
        v-for="option in flatOptions"
        :key="optionKey(option)"
        :class="['choice-item', { 'is-selected': isOptionSelected(option) }]"
        :disabled="interactiveDisabled || option.disabled"
        @click="selectChoice(option)"
      >
        <div
          v-if="kind === 'checkbox'"
          :class="['option-check', { 'is-checked': isOptionSelected(option) }]"
        >
          <span v-if="isOptionSelected(option)" class="option-check-text">✓</span>
        </div>
        <div
          v-else
          :class="['option-radio', { 'is-selected': isOptionSelected(option) }]"
        >
          <div v-if="isOptionSelected(option)" class="option-radio-dot" />
        </div>
        <span class="choice-label">{{ option.label }}</span>
      </button>
      <span v-if="!flatOptions.length" class="option-empty">暂无可用选项</span>
    </div>

    <div v-else-if="kind === 'color'" class="color-control">
      <div class="color-swatches">
        <button
          v-for="color in colorOptions"
          :key="color"
          :class="['color-swatch', { 'is-selected': modelValue === color }]"
          :style="{ backgroundColor: color }"
          :disabled="interactiveDisabled"
          @click="commitValue(color)"
        >
          <span v-if="modelValue === color" class="color-check">✓</span>
        </button>
      </div>
      <input
        class="field-input color-input"
        type="text"
        :value="inputDisplayValue"
        :placeholder="placeholder || '#1677ff'"
        :disabled="interactiveDisabled"
        @change="commitValue(readInputEventValue($event).trim())"
      />
    </div>

    <div v-else-if="kind === 'subform'" class="subform-control">
      <div v-if="nestedSchema" class="subform-fields">
        <MobileFormField
          v-for="nestedField in nestedSchema.fields"
          :key="nestedField.field"
          :field="nestedField"
          :model-value="nestedModel[nestedField.field]"
          :option-sources="optionSources"
          :disabled="disabled"
          :readonly="readonly"
          @update:model-value="(value) => updateNestedField(nestedField, value)"
        />
      </div>
      <span v-else class="empty-control-text">未配置子表单字段</span>
    </div>

    <div v-else-if="kind === 'array'" class="array-control">
      <div v-if="arrayRows.length" class="array-rows">
        <div v-for="(row, rowIndex) in arrayRows" :key="rowKey(row, rowIndex)" class="array-row">
          <div class="array-row-heading">
            <span class="array-row-title">第 {{ rowIndex + 1 }} 行</span>
            <button
              class="array-remove"
              :disabled="interactiveDisabled || !canRemoveArrayRow"
              @click="removeArrayRow(rowIndex)"
            >
              <span class="array-remove-text">删除</span>
            </button>
          </div>
          <div class="array-row-fields">
            <MobileFormField
              v-for="column in arrayColumns"
              :key="column.field"
              :field="column"
              :model-value="row[column.field]"
              :option-sources="optionSources"
              :disabled="disabled"
              :readonly="readonly"
              @update:model-value="(value) => updateArrayCell(rowIndex, column, value)"
            />
          </div>
        </div>
      </div>
      <span v-else class="empty-control-text">暂无数据行</span>
      <button
        v-if="showArrayToolbar"
        class="array-add"
        :disabled="interactiveDisabled || !canAddArrayRow"
        @click="addArrayRow"
      >
        <span class="array-add-text">+ {{ arrayAddText }}</span>
      </button>
    </div>

    <span v-if="localError || error" class="field-error">{{ localError || error }}</span>
    <span v-else-if="field.help" class="field-help">{{ field.help }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from '@vue/runtime-core';
import type { CSSProperties } from 'vue';

import type { SharedLowCodeField } from '../types';
import {
  cloneFormValue,
  createArrayFormRow,
  findSelectedFormOption,
  flattenFormOptions,
  formControlKind,
  formatJsonFormValue,
  isFormRecord,
  normalizeArrayFormColumns,
  normalizeArrayFormRows,
  readFormBoolean,
  readFormNumber,
  readInputEventValue,
  readNestedFormSchema,
  readStoredOptionValue,
  resolveFormOptions,
  sameFormValue,
  serializeArrayFormRows,
  type MobileFlatOption,
} from '../mobile-form';

defineOptions({
  name: 'MobileFormField',
});

const props = withDefaults(defineProps<{
  field: SharedLowCodeField;
  modelValue: unknown;
  optionSources?: Record<string, unknown>;
  error?: string;
  showLabel?: boolean;
  disabled?: boolean;
  readonly?: boolean;
}>(), {
  optionSources: () => ({}),
  error: '',
  showLabel: true,
  disabled: false,
  readonly: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();

const panelOpen = ref(false);
const searchText = ref('');
const localError = ref('');
const jsonEditorOpen = ref(false);
const jsonDraft = ref('');
const jsonDraftError = ref('');
const inputFocused = ref(false);

const kind = computed(() => formControlKind(props.field.component));
const fieldProps = computed(() => props.field.props ?? {});
const required = computed(() => props.field.rules?.some((rule) => rule.required) ?? false);
const disabled = computed(() => props.disabled || readFormBoolean(fieldProps.value.disabled));
const readonly = computed(() => props.readonly || readFormBoolean(fieldProps.value.readonly));
const interactiveDisabled = computed(() => disabled.value || readonly.value);
const placeholder = computed(() => String(fieldProps.value.placeholder ?? ''));
const inputType = computed(() => String(fieldProps.value.type ?? 'text'));
const maxLength = computed(() => readFormNumber(
  fieldProps.value.maxlength ?? fieldProps.value.maxLength,
));
const inputDisplayValue = computed(() => String(props.modelValue ?? ''));
const textareaValue = computed(() => String(props.modelValue ?? ''));
const jsonPreviewValue = computed(() => formatJsonPreviewValue(props.modelValue));
const jsonEditorActionLabel = computed(() => readonly.value ? '查看 JSON' : '编辑 JSON');
const textareaRows = computed(() => Math.min(
  12,
  Math.max(
    3,
    Math.round(readFormNumber(fieldProps.value.rows, kind.value === 'json' ? 6 : 4) ?? 4),
  ),
));
const multiple = computed(() => (
  kind.value === 'checkbox' || readFormBoolean(fieldProps.value.multiple)
));
const searchable = computed(() => (
  readFormBoolean(fieldProps.value.filterable)
  || readFormBoolean(fieldProps.value.searchable)
  || flatOptions.value.length > 8
));
const options = computed(() => resolveFormOptions(props.field, props.optionSources));
const flatOptions = computed(() => flattenFormOptions(
  options.value,
  kind.value === 'cascader',
));
const visibleOptions = computed(() => {
  const keyword = searchText.value.trim().toLocaleLowerCase();
  if (!keyword) return flatOptions.value;
  return flatOptions.value.filter((option) =>
    `${option.label} ${option.pathLabel}`.toLocaleLowerCase().includes(keyword)
  );
});
const selectedLabels = computed(() => {
  const values = multiple.value && Array.isArray(props.modelValue)
    ? props.modelValue
    : [props.modelValue];
  return values
    .map((value) => findSelectedFormOption(props.field, flatOptions.value, value)?.pathLabel)
    .filter((label): label is string => Boolean(label));
});
const selectedText = computed(() => {
  if (!selectedLabels.value.length) return placeholder.value || '请选择';
  if (selectedLabels.value.length <= 2) return selectedLabels.value.join('、');
  return `已选择 ${selectedLabels.value.length} 项`;
});
const switchOpenText = computed(() => String(
  fieldProps.value.openLabel ?? fieldProps.value.openText ?? '已开启',
));
const switchClosedText = computed(() => String(
  fieldProps.value.closeLabel ?? fieldProps.value.closeText ?? '已关闭',
));
const booleanLabel = computed(() => String(
  fieldProps.value.text ?? fieldProps.value.label ?? props.field.label,
));
const numberStep = computed(() => readFormNumber(fieldProps.value.step, 1) ?? 1);
const numberMin = computed(() => readFormNumber(fieldProps.value.min));
const numberMax = computed(() => readFormNumber(fieldProps.value.max));
const currentNumber = computed(() => readFormNumber(props.modelValue, 0) ?? 0);
const canStepDown = computed(() => numberMin.value === undefined
  || currentNumber.value - numberStep.value >= numberMin.value);
const canStepUp = computed(() => numberMax.value === undefined
  || currentNumber.value + numberStep.value <= numberMax.value);
const colorOptions = computed(() => {
  const configured = Array.isArray(fieldProps.value.colors) ? fieldProps.value.colors : [];
  const defaults = ['#1677ff', '#0b7957', '#d8453b', '#7a4f00', '#6f42c1', '#172b3d'];
  return (configured.length ? configured : defaults).map(String).slice(0, 12);
});
const nestedSchema = computed(() => readNestedFormSchema(props.field));
const nestedModel = computed(() => (
  isFormRecord(props.modelValue) ? props.modelValue : {}
));
const arrayColumns = computed(() => normalizeArrayFormColumns(props.field));
const arrayRows = computed(() => normalizeArrayFormRows(props.field, props.modelValue));
const minArrayRows = computed(() => Math.max(0, readFormNumber(fieldProps.value.minRows, 0) ?? 0));
const maxArrayRows = computed(() => readFormNumber(fieldProps.value.maxRows));
const canRemoveArrayRow = computed(() => arrayRows.value.length > minArrayRows.value);
const canAddArrayRow = computed(() => maxArrayRows.value === undefined
  || arrayRows.value.length < maxArrayRows.value);
const showArrayToolbar = computed(() => fieldProps.value.showToolbar !== false);
const arrayAddText = computed(() => String(fieldProps.value.addText ?? '新增行'));

function commitValue(value: unknown) {
  localError.value = '';
  emit('update:modelValue', cloneFormValue(value));
}

function commitInput(value: string) {
  const trim = readFormBoolean(fieldProps.value.trim);
  commitValue(trim ? value.trim() : value);
}

function commitNumber(value: string) {
  if (!value.trim()) {
    commitValue(undefined);
    return;
  }
  const numeric = Number(value);
  if (Number.isFinite(numeric)) commitValue(clampNumber(numeric));
}

function clampNumber(value: number) {
  let next = value;
  if (numberMin.value !== undefined) next = Math.max(numberMin.value, next);
  if (numberMax.value !== undefined) next = Math.min(numberMax.value, next);
  const precision = readFormNumber(fieldProps.value.digits ?? fieldProps.value.precision);
  return precision === undefined ? next : Number(next.toFixed(Math.max(0, precision)));
}

function stepNumber(direction: -1 | 1) {
  if (interactiveDisabled.value) return;
  commitValue(clampNumber(currentNumber.value + direction * numberStep.value));
}

function commitTextarea(value: string) {
  commitInput(value);
}

function formatJsonPreviewValue(value: unknown) {
  const text = formatJsonFormValue(value).trim();
  if (!text) return '';

  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return text.replace(/\s+/g, ' ');
  }
}

function openJsonEditor() {
  if (disabled.value) return;
  jsonDraft.value = formatJsonFormValue(props.modelValue);
  jsonDraftError.value = '';
  jsonEditorOpen.value = true;
}

function closeJsonEditor() {
  jsonEditorOpen.value = false;
  jsonDraftError.value = '';
}

function updateJsonDraft(value: string) {
  jsonDraft.value = value;
  jsonDraftError.value = '';
}

function commitJsonDraft() {
  const text = jsonDraft.value.trim();
  if (!text) {
    commitValue(undefined);
    closeJsonEditor();
    return;
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    const rootType = String(fieldProps.value.jsonRootType ?? 'any');
    if (rootType === 'object' && (!isFormRecord(parsed))) {
      jsonDraftError.value = 'JSON 顶层必须是对象';
      return;
    }
    if (rootType === 'array' && !Array.isArray(parsed)) {
      jsonDraftError.value = 'JSON 顶层必须是数组';
      return;
    }

    const valueMode = String(fieldProps.value.jsonValueMode ?? 'preserve');
    const keepString = valueMode === 'string'
      || (valueMode === 'preserve' && typeof props.modelValue === 'string');
    commitValue(keepString ? text : parsed);
    closeJsonEditor();
  } catch {
    jsonDraftError.value = 'JSON 格式不正确，请检查后重试';
  }
}

function toggleSwitch() {
  if (interactiveDisabled.value) return;
  commitValue(!Boolean(props.modelValue));
}

function togglePanel() {
  if (interactiveDisabled.value) return;
  panelOpen.value = !panelOpen.value;
  if (!panelOpen.value) searchText.value = '';
}

function optionKey(option: MobileFlatOption) {
  return `${option.depth}-${option.pathLabel}-${String(option.value)}`;
}

function optionLabel(option: MobileFlatOption) {
  return kind.value === 'tree' || kind.value === 'cascader'
    ? option.pathLabel
    : option.label;
}

function optionIndentStyle(option: MobileFlatOption): CSSProperties | undefined {
  if (kind.value !== 'tree') return undefined;
  return { paddingLeft: `${12 + option.depth * 18}px` };
}

function isOptionSelected(option: MobileFlatOption) {
  const storedValue = readStoredOptionValue(props.field, option);
  if (multiple.value) {
    return Array.isArray(props.modelValue)
      && props.modelValue.some((value) => sameFormValue(value, storedValue));
  }
  return sameFormValue(props.modelValue, storedValue);
}

function selectOption(option: MobileFlatOption) {
  if (option.disabled || interactiveDisabled.value) return;
  const storedValue = readStoredOptionValue(props.field, option);

  if (multiple.value) {
    const current = Array.isArray(props.modelValue) ? [...props.modelValue] : [];
    const index = current.findIndex((value) => sameFormValue(value, storedValue));
    if (index >= 0) current.splice(index, 1);
    else current.push(storedValue);
    commitValue(current);
    return;
  }

  commitValue(storedValue);
  panelOpen.value = false;
  searchText.value = '';
}

function clearSelection() {
  commitValue([]);
}

function selectChoice(option: MobileFlatOption) {
  if (kind.value === 'checkbox') {
    selectOption(option);
    return;
  }
  commitValue(readStoredOptionValue(props.field, option));
}

function updateNestedField(field: SharedLowCodeField, value: unknown) {
  const next = {
    ...nestedModel.value,
    [field.field]: cloneFormValue(value),
  };
  commitValue(next);
}

function rowKey(row: Record<string, unknown>, index: number) {
  const rowConfig = isFormRecord(fieldProps.value.rowConfig) ? fieldProps.value.rowConfig : {};
  const keyField = String(rowConfig.keyField ?? fieldProps.value.rowKey ?? '__rowKey');
  return String(row[keyField] ?? `row-${index}`);
}

function updateArrayCell(rowIndex: number, column: SharedLowCodeField, value: unknown) {
  const rows = arrayRows.value.map((row) => ({ ...row }));
  rows[rowIndex][column.field] = cloneFormValue(value);
  commitValue(serializeArrayFormRows(props.field, rows));
}

function addArrayRow() {
  if (!canAddArrayRow.value || interactiveDisabled.value) return;
  const rows = [...arrayRows.value, createArrayFormRow(props.field)];
  commitValue(serializeArrayFormRows(props.field, rows));
}

function removeArrayRow(rowIndex: number) {
  if (!canRemoveArrayRow.value || interactiveDisabled.value) return;
  const rows = arrayRows.value.filter((_, index) => index !== rowIndex);
  commitValue(serializeArrayFormRows(props.field, rows));
}

watch(() => props.modelValue, () => {
  if (localError.value && kind.value === 'json') localError.value = '';
});

watch(() => props.field.field, () => {
  panelOpen.value = false;
  searchText.value = '';
  localError.value = '';
  inputFocused.value = false;
  closeJsonEditor();
});
</script>

<style scoped>
.mobile-field {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.field-heading {
  min-height: 20px;
  margin-bottom: 6px;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.field-label {
  color: #35414c;
  font-size: 12px;
  line-height: 18px;
  font-weight: bold;
}

.field-required {
  margin-left: 3px;
  color: #bd3d36;
  font-size: 13px;
  line-height: 18px;
}

.field-input,
.select-trigger,
.option-search {
  width: 100%;
  min-width: 0;
  height: 44px;
  padding-right: 11px;
  padding-left: 11px;
  color: #17212b;
  font-size: 14px;
  background-color: #f8f9fa;
  border-width: 1px;
  border-style: solid;
  border-color: #ccd3d8;
  border-radius: 5px;
}

.text-control {
  width: 100%;
  min-width: 0;
  height: 46px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #b9c5ce;
  border-radius: 6px;
}

.text-control.is-focused {
  border-width: 2px;
  border-color: #176ea8;
  background-color: #ffffff;
}

.text-input {
  flex: 1;
  width: 100%;
  min-width: 0;
  height: 44px;
  padding-right: 12px;
  padding-left: 12px;
  background-color: transparent;
  border-width: 0;
  border-radius: 0;
}

.field-textarea {
  height: 112px;
  padding-top: 10px;
  padding-bottom: 10px;
  text-align-vertical: top;
}

.mobile-field.is-disabled .field-input,
.mobile-field.is-disabled .select-trigger,
.mobile-field.is-readonly .field-input,
.mobile-field.is-readonly .select-trigger {
  color: #7c8790;
  background-color: #eef1f3;
}

.mobile-field.is-disabled .text-control,
.mobile-field.is-readonly .text-control {
  border-color: #d4dce1;
  background-color: #eef1f3;
}

.mobile-field.is-disabled .text-input,
.mobile-field.is-readonly .text-input {
  background-color: transparent;
}

.switch-row,
.switch-control,
.boolean-control,
.number-control,
.json-preview-row,
.select-trigger,
.choice-item,
.option-item,
.color-swatches,
.array-row-heading,
.option-panel-actions {
  display: flex;
  flex-direction: row;
  align-items: center;
}

.json-control,
.json-dialog-mask,
.json-dialog-panel {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.json-preview-row {
  width: 100%;
  min-width: 0;
}

.json-preview {
  flex: 1;
  min-width: 0;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.json-edit-button {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #edf3f7;
  border-width: 1px;
  border-left-width: 0;
  border-style: solid;
  border-color: #ccd3d8;
  border-radius: 5px;
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.json-edit-icon {
  color: #245f87;
  font-size: 13px;
  line-height: 18px;
  font-weight: bold;
}

.json-dialog {
  width: 100%;
  height: 100%;
}

.json-dialog-mask {
  flex: 1;
  padding: 16px;
  justify-content: center;
  background-color: rgba(15, 23, 42, 0.54);
}

.json-dialog-panel {
  max-height: 86%;
  padding: 14px;
  background-color: #ffffff;
  border-radius: 6px;
}

.json-dialog-heading,
.json-dialog-actions {
  width: 100%;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.json-dialog-heading {
  min-height: 36px;
  margin-bottom: 10px;
  justify-content: space-between;
}

.json-dialog-title {
  flex: 1;
  min-width: 0;
  color: #17212b;
  font-size: 15px;
  line-height: 22px;
  font-weight: bold;
}

.json-dialog-close {
  width: 34px;
  height: 34px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #edf1f3;
  border-radius: 4px;
}

.json-dialog-close-text {
  color: #52606b;
  font-size: 22px;
  line-height: 26px;
}

.json-dialog-editor {
  height: 280px;
  font-size: 12px;
}

.json-dialog-error {
  margin-top: 6px;
}

.json-dialog-actions {
  margin-top: 12px;
  justify-content: flex-end;
}

.json-dialog-action {
  min-width: 72px;
  height: 38px;
  margin-left: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #edf1f3;
  border-radius: 4px;
}

.json-dialog-action.is-primary {
  background-color: #176ea8;
}

.json-dialog-action-text {
  color: #35414c;
  font-size: 13px;
  line-height: 18px;
}

.json-dialog-action-text.is-primary {
  color: #ffffff;
}

.switch-control {
  min-width: 118px;
  height: 42px;
  align-self: flex-start;
  background-color: transparent;
}

.boolean-control {
  min-width: 180px;
  min-height: 42px;
  align-self: flex-start;
  background-color: transparent;
}

.boolean-check {
  width: 18px;
  height: 18px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #aab6c0;
  border-radius: 3px;
}

.boolean-control.is-active .boolean-check {
  border-color: #1778b9;
  background-color: #1778b9;
}

.boolean-check-text {
  color: #ffffff;
  font-size: 12px;
  line-height: 16px;
  font-weight: bold;
}

.switch-track {
  position: relative;
  width: 46px;
  height: 26px;
  padding: 3px;
  justify-content: center;
  background-color: #aeb8bf;
  border-radius: 13px;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  background-color: #ffffff;
  border-radius: 10px;
}

.switch-control.is-active .switch-track {
  background-color: #087b5a;
}

.switch-control.is-active .switch-thumb {
  left: 23px;
}

.switch-text {
  margin-left: 9px;
  color: #52606b;
  font-size: 12px;
  line-height: 18px;
}

.number-control {
  width: 100%;
  min-width: 0;
}

.number-step {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: #e7ecef;
  border-width: 1px;
  border-style: solid;
  border-color: #c7d0d6;
  border-radius: 5px;
}

.number-step-text {
  color: #27465d;
  font-size: 22px;
  line-height: 26px;
}

.number-input {
  flex: 1;
  margin-right: 7px;
  margin-left: 7px;
  text-align: center;
}

.select-control,
.color-control,
.subform-control,
.array-control,
.array-rows,
.array-row,
.array-row-fields,
.subform-fields,
.option-panel,
.option-list,
.choice-list {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.select-trigger {
  justify-content: space-between;
}

.select-trigger.is-open {
  border-color: #2874aa;
  background-color: #f3f8fb;
}

.select-trigger-copy {
  flex: 1;
  min-width: 0;
}

.select-trigger-text {
  color: #17212b;
  font-size: 13px;
  line-height: 19px;
}

.select-trigger-text.is-placeholder {
  color: #8a959d;
}

.select-chevron {
  margin-left: 8px;
  color: #65727c;
  font-size: 9px;
}

.option-panel {
  margin-top: 6px;
  padding: 7px;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #bdc8cf;
  border-radius: 5px;
}

.option-search {
  height: 38px;
  margin-bottom: 6px;
  font-size: 12px;
}

.option-scroll {
  width: 100%;
  max-height: 236px;
  overflow-y: scroll;
}

.option-item,
.choice-item {
  width: 100%;
  min-height: 42px;
  padding-right: 10px;
  padding-left: 10px;
  background-color: #ffffff;
}

.option-item + .option-item,
.choice-item + .choice-item {
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #edf0f2;
}

.option-item.is-selected,
.choice-item.is-selected {
  background-color: #eef6fb;
}

.option-label,
.choice-label {
  flex: 1;
  min-width: 0;
  color: #35414c;
  font-size: 12px;
  line-height: 18px;
}

.option-check,
.option-radio {
  width: 18px;
  height: 18px;
  margin-right: 9px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #9aa9b5;
}

.option-check {
  border-radius: 3px;
}

.option-radio {
  border-radius: 9px;
}

.option-check.is-checked,
.option-radio.is-selected {
  border-color: #1778b9;
}

.option-check.is-checked {
  background-color: #1778b9;
}

.option-check-text {
  color: #ffffff;
  font-size: 12px;
  line-height: 16px;
  font-weight: bold;
}

.option-radio-dot {
  width: 8px;
  height: 8px;
  background-color: #1778b9;
  border-radius: 4px;
}

.option-empty,
.empty-control-text {
  padding-top: 12px;
  padding-bottom: 12px;
  color: #7f8a93;
  font-size: 12px;
  line-height: 18px;
}

.option-panel-actions {
  margin-top: 6px;
  padding-top: 7px;
  justify-content: flex-end;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #e3e7ea;
}

.option-panel-action {
  min-width: 64px;
  height: 34px;
  margin-left: 7px;
  align-items: center;
  justify-content: center;
  background-color: #edf1f3;
  border-radius: 4px;
}

.option-panel-action.is-primary {
  background-color: #176ea8;
}

.option-panel-action-text {
  color: #35414c;
  font-size: 12px;
}

.option-panel-action-text.is-primary {
  color: #ffffff;
}

.choice-list {
  border-width: 1px;
  border-style: solid;
  border-color: #d5dce1;
  border-radius: 5px;
  overflow: hidden;
}

.color-swatches {
  flex-wrap: wrap;
}

.color-swatch {
  width: 38px;
  height: 38px;
  margin-right: 8px;
  margin-bottom: 8px;
  align-items: center;
  justify-content: center;
  border-width: 2px;
  border-style: solid;
  border-color: #ffffff;
  border-radius: 4px;
}

.color-swatch.is-selected {
  border-color: #172b3d;
}

.color-check {
  color: #ffffff;
  font-size: 15px;
  font-weight: bold;
}

.color-input {
  margin-top: 2px;
}

.subform-control,
.array-control {
  padding: 10px;
  background-color: #f6f8f9;
  border-width: 1px;
  border-style: solid;
  border-color: #d4dce1;
  border-radius: 5px;
}

.subform-fields > .mobile-field + .mobile-field,
.array-row-fields > .mobile-field + .mobile-field {
  margin-top: 10px;
}

.array-row {
  padding: 10px;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #d8e0e5;
  border-radius: 5px;
}

.array-row + .array-row {
  margin-top: 9px;
}

.array-row-heading {
  min-height: 30px;
  margin-bottom: 8px;
  justify-content: space-between;
}

.array-row-title {
  color: #42515d;
  font-size: 12px;
  line-height: 18px;
  font-weight: bold;
}

.array-remove {
  min-width: 52px;
  height: 30px;
  align-items: center;
  justify-content: center;
  background-color: #fde7e4;
  border-radius: 4px;
}

.array-remove-text {
  color: #a3322c;
  font-size: 11px;
}

.array-add {
  min-height: 40px;
  margin-top: 9px;
  align-items: center;
  justify-content: center;
  background-color: #e1edf5;
  border-radius: 4px;
}

.array-add-text {
  color: #185d8d;
  font-size: 12px;
  font-weight: bold;
}

.field-help,
.field-error {
  margin-top: 5px;
  font-size: 11px;
  line-height: 16px;
}

.field-help {
  color: #7a858f;
}

.field-error {
  color: #b63b36;
}
</style>
