<template>
  <vxe-form
    ref="vxeFormRef"
    v-bind="mergedFormProps"
    class="lc-form"
    :class="{ 'lc-form--fill': fillRemainingLayout }"
    :data="formData"
    :loading="loading"
    :rules="formRules"
    :custom-layout="true"
    @submit="handleVxeSubmit"
    @contextmenu="handleLabelContextMenu"
  >
    <LowCodeFormLayout
      v-if="layoutNodes.length"
      :nodes="layoutNodes"
      :fields-by-key="fieldsByKey"
      :style="formLayoutStyle"
    >
      <template #field="{ field }">
        <vxe-form-item
          v-bind="resolveFormItemProps(field)"
          :data-lc-field="field.field"
        >
          <LowCodeFormField
            :field="field"
            :model-value="readFieldValue(field)"
            :options="resolveOptions(field)"
            :form-values="formData"
            :show-label="false"
            :disabled="isFieldDisabled(field)"
            :readonly="isFormReadonly"
            @update:model-value="(value) => setFieldValue(field, value)"
            @change="handleFieldChange"
            @patch-model="(payload) => patchFieldValues(field, payload)"
            @relate-select="(payload) => handleRelateSelect(field, payload)"
          />
        </vxe-form-item>
      </template>
    </LowCodeFormLayout>

    <div v-else ref="formGridRef" class="lc-form-grid" :style="formGridStyle">
      <div
        v-for="field in fields"
        :key="field.field"
        :class="fieldGridCellClass(field)"
        :style="fieldGridCellStyle(field)"
      >
        <vxe-form-item
          v-bind="resolveFormItemProps(field)"
          :data-lc-field="field.field"
        >
          <LowCodeFormField
            :field="field"
            :model-value="readFieldValue(field)"
            :options="resolveOptions(field)"
            :form-values="formData"
            :show-label="false"
            :disabled="isFieldDisabled(field)"
            :readonly="isFormReadonly"
            @update:model-value="(value) => setFieldValue(field, value)"
            @change="handleFieldChange"
            @patch-model="(payload) => patchFieldValues(field, payload)"
            @relate-select="(payload) => handleRelateSelect(field, payload)"
          />
        </vxe-form-item>
      </div>
    </div>
    <!--
      不要使用按钮，注释掉
    -->
    <!-- <div v-if="formActions.length" class="lc-actions">
      <vxe-button
        v-for="action in formActions"
        :key="action.code"
        :status="action.status"
        :disabled="action.disabled"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div> -->
  </vxe-form>
</template>

<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  useAttrs,
  watch,
  type PropType,
} from 'vue';
import type {
  VxeFormDefines,
  VxeFormInstance,
  VxeFormItemProps,
  VxeFormProps,
} from 'vxe-pc-ui';
import type {
  LowCodeAction,
  LowCodeEditPageMode,
  LowCodeField,
  LowCodeFormModel,
  LowCodeFormLayoutNode,
  LowCodeOption,
  LowCodeRule
} from '../types/lowcode';
import LowCodeFormField from './LowCodeFormField.vue';
import LowCodeFormLayout from './LowCodeFormLayout.vue';
import { useLowCodeHost } from '../core/host';
import { lowCodeOptionSourceRegistry } from '../runtime/option-source-registry';
import {
  isLowCodeEditPageFieldDisabled,
  isLowCodeEditPageReadonly,
} from '../runtime/edit-page-mode';
import type {
  LowCodeFormMaterialPatchPayload,
  LowCodeFormMaterialSelectPayload,
} from '../lowcode/form-materials';

defineOptions({
  inheritAttrs: false,
});

type VxeLowCodeFormProps = VxeFormProps<LowCodeFormModel>;
type VxeLowCodeFormRules = NonNullable<VxeLowCodeFormProps['rules']>;
type VxeLowCodeFormRule = VxeFormDefines.FormRule<LowCodeFormModel>;
type FieldVisibilityCondition = {
  field: string;
  equals?: unknown;
  notEquals?: unknown;
  includes?: unknown[];
};

const props = defineProps({
  schema: {
    type: Object as PropType<{
      fields: LowCodeField[];
      layout?: LowCodeFormLayoutNode[];
      actions?: LowCodeAction[];
      columns?: number;
      title?: string;
    }>,
    required: true,
  },
  modelValue: {
    type: Object as PropType<LowCodeFormModel>,
    required: true,
  },
  optionSources: {
    type: Object as PropType<Record<string, unknown>>,
    default: () => ({}),
  },
  loading: Boolean,
  size: String,
  collapseStatus: Boolean,
  span: [Number, String],
  align: String as PropType<'left' | 'center' | 'right'>,
  verticalAlign: String as PropType<'top' | 'middle' | 'bottom'>,
  border: Boolean,
  titleBackground: Boolean,
  titleBold: Boolean,
  titleAlign: String as PropType<'left' | 'center' | 'right'>,
  titleWidth: [Number, String],
  titleColon: Boolean,
  titleAsterisk: {
    type: Boolean,
    default: true,
  },
  titleOverflow: [Boolean, String] as PropType<boolean | 'ellipsis' | 'title' | 'tooltip'>,
  vertical: Boolean,
  padding: {
    type: Boolean,
    default: false,
  },
  className: String,
  readonly: Boolean,
  disabled: Boolean,
  mode: String as PropType<LowCodeEditPageMode>,
  rules: Object as PropType<Record<string, VxeLowCodeFormRule[]>>,
  fieldValidator: Function as PropType<(
    field: LowCodeField,
    value: unknown,
    values: Record<string, unknown>,
  ) => Promise<true | string> | true | string>,
  preventSubmit: Boolean,
  validConfig: Object as PropType<Record<string, unknown>>,
  tooltipConfig: Object as PropType<Record<string, unknown>>,
  collapseConfig: Object as PropType<Record<string, unknown>>,
  params: Object as PropType<Record<string, unknown>>,
  labelContextMenu: Boolean,
});

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
  submit: [value: Record<string, unknown>];
  action: [action: LowCodeAction, value: Record<string, unknown>];
  fieldChange: [
    payload: {
      field: LowCodeField;
      value: unknown;
      previousValue: unknown;
      values: Record<string, unknown>;
    },
  ];
  labelContextMenu: [event: MouseEvent, field: LowCodeField];
  relateSelect: [
    payload: {
      field: LowCodeField;
      row: Record<string, unknown>;
      values: Record<string, unknown>;
      formValues: Record<string, unknown>;
    },
  ];
}>();

const attrs = useAttrs();
const host = useLowCodeHost();
const vxeFormRef = ref<VxeFormInstance<LowCodeFormModel>>();
const formGridRef = ref<HTMLElement>();
const formGridRowCount = ref(0);
const formData = reactive<Record<string, unknown>>({ ...props.modelValue });
const initialModel = ref<Record<string, unknown>>({ ...props.modelValue });
const codeOptionSources = reactive<Record<string, unknown[]>>({});
const fields = computed(() =>
  Array.isArray(props.schema.fields) ? props.schema.fields : []
);
const optionsCodes = computed(() =>
  [...new Set(fields.value.map((field) => field.optionsCode?.trim()).filter(Boolean))] as string[]
);
const optionsCodeKey = computed(() => optionsCodes.value.join('\u0000'));
const layoutNodes = computed<LowCodeFormLayoutNode[]>(() =>
  Array.isArray(props.schema.layout) ? props.schema.layout : []
);
const fillRemainingLayout = computed(() =>
  layoutNodes.value.some((node) => node.kind === 'tabs' && node.fillRemaining === true)
);
const formActions = computed(() =>
  Array.isArray(props.schema.actions) ? props.schema.actions : []
);
const fieldsByKey = computed(() =>
  fields.value.reduce<Record<string, LowCodeField>>((prev, field) => {
    prev[field.field] = field;
    return prev;
  }, {})
);
const formColumnCount = computed(() => readFormColumnCount());
const defaultVxeSpan = computed(() =>
  normalizeVxeSpan(props.span, Math.max(1, Math.floor(24 / formColumnCount.value)))
);
const formRules = computed<VxeLowCodeFormRules>(() => {
  return fields.value.reduce<VxeLowCodeFormRules>((rules, field) => {
    if (isFieldDisabled(field)) return rules;

    const schemaRules = (field.rules ?? []).map((rule) => createVxeRule(rule));
    const scriptRules = field.validationScript && props.fieldValidator
      ? [createFieldValidationRule(field)]
      : [];
    const externalRules = readExternalRules(field.field);
    const itemRules = [...schemaRules, ...scriptRules, ...externalRules];

    if (itemRules.length) {
      rules[field.field] = itemRules;
    }

    return rules;
  }, {});
});
const formItemPropsByField = computed(() =>
  fields.value.reduce<Record<string, VxeFormItemProps<LowCodeFormModel>>>((prev, field) => {
    const span = getFieldVxeSpan(field);

    prev[field.field] = {
      field: field.field,
      title: field.label,
      showTitle: field.showTitle,
      span,
      rules: formRules.value[field.field],
      ...(readFieldVisibilityCondition(field)
        ? { visibleMethod: ({ data }) => isFieldVisible(field, data) }
        : {}),
      className: 'lc-form-item',
      contentClassName: 'lc-form-item__content',
      titleClassName: 'lc-form-item__title',
    };
    return prev;
  }, {})
);
const renderedLayoutRowCount = computed(() =>
  layoutNodes.value.filter(
    (node) => node.kind !== 'field' || Boolean(fieldsByKey.value[node.field])
  ).length
);
const formLayoutStyle = computed(() => ({
  gridTemplateRows: createLastRowFillTemplate(
    renderedLayoutRowCount.value,
    fillRemainingLayout.value
  ),
}));
const formGridStyle = computed(() => ({
  '--lc-form-columns': String(formColumnCount.value),
  gridTemplateRows: createLastRowFillTemplate(formGridRowCount.value),
}));
const formValidConfig = computed(() => ({
  showErrorMessage: false,
  showErrorIcon: true,
  theme: 'beautify' as const,
  ...props.validConfig,
}));
const vxeFormProps = computed(() => ({
  size: props.size,
  collapseStatus: props.collapseStatus,
  span: defaultVxeSpan.value,
  align: props.align,
  verticalAlign: props.verticalAlign === 'middle' ? 'center' : undefined,
  border: props.border,
  titleBackground: props.titleBackground,
  titleBold: props.titleBold,
  titleAlign: props.titleAlign,
  titleWidth: props.titleWidth ?? 'auto',
  titleColon: props.titleColon,
  titleAsterisk: props.titleAsterisk,
  titleOverflow: props.titleOverflow,
  vertical: props.vertical,
  padding: props.padding ?? false,
  className: props.className,
  readonly: props.readonly,
  disabled: props.disabled || isLowCodeEditPageReadonly(props.mode),
  preventSubmit: props.preventSubmit !== false,
  validConfig: formValidConfig.value,
  tooltipConfig: props.tooltipConfig,
  collapseConfig: props.collapseConfig,
  params: props.params,
}) as Partial<VxeLowCodeFormProps>);
const forwardedFormAttrs = computed(() => {
  const blockedAttrs = new Set([
    'data',
    'items',
    'rules',
    'customLayout',
    'custom-layout',
    'loading',
  ]);

  return Object.entries(attrs).reduce<Record<string, unknown>>((prev, [key, value]) => {
    if (!blockedAttrs.has(key)) {
      prev[key] = value;
    }
    return prev;
  }, {});
});
const mergedFormProps = computed(() => ({
  ...forwardedFormAttrs.value,
  ...vxeFormProps.value,
}));
const isFormDisabled = computed(() =>
  props.disabled === true || isLowCodeEditPageReadonly(props.mode)
);
const isFormReadonly = computed(() => props.readonly === true);
const isFormInteractionBlocked = computed(() =>
  isFormDisabled.value || isFormReadonly.value
);

function isFieldDisabled(field: LowCodeField) {
  if (
    isFormDisabled.value ||
    field.props?.disabled === true
  ) return true;
  return isLowCodeEditPageFieldDisabled(field, props.mode);
}

watch(
  [() => props.mode, () => props.disabled],
  () => {
    void clearValidation();
  }
);

watch(
  () => props.modelValue,
  (nextValue: Record<string, unknown>) => {
    const isLocalUpdate = formValuesEqual(nextValue, formData);
    Object.keys(formData).forEach((key) => delete formData[key]);
    Object.assign(formData, nextValue);
    if (!isLocalUpdate) initialModel.value = { ...nextValue };
  },
  { deep: true }
);

watch(
  () => props.schema.fields,
  () => {
    scheduleFormGridMeasurement();
  },
  { deep: true, immediate: true }
);

let formGridResizeObserver: ResizeObserver | undefined;
let formGridMeasureFrame: number | undefined;

watch(
  formGridRef,
  (grid, previousGrid) => {
    if (previousGrid) {
      formGridResizeObserver?.unobserve(previousGrid);
    }

    if (!grid) {
      formGridRowCount.value = 0;
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      formGridResizeObserver ??= new ResizeObserver(() => scheduleFormGridMeasurement());
      formGridResizeObserver.observe(grid);
    }
    scheduleFormGridMeasurement();
  },
  { flush: 'post' }
);

watch(formColumnCount, () => scheduleFormGridMeasurement(), { flush: 'post' });

let unsubscribeOptionSources: (() => void) | undefined;

watch(
  optionsCodeKey,
  () => {
    unsubscribeOptionSources?.();
    const codes = optionsCodes.value;
    const activeCodes = new Set(codes);
    Object.keys(codeOptionSources).forEach((code) => {
      if (!activeCodes.has(code)) delete codeOptionSources[code];
    });
    if (!codes.length) return;

    unsubscribeOptionSources = lowCodeOptionSourceRegistry.subscribe(
      codes,
      (code, options) => {
        codeOptionSources[code] = options;
      },
      () => {
        try {
          return host.getServiceApi();
        } catch {
          return undefined;
        }
      },
    );
  },
  { immediate: true },
);

onMounted(() => window.addEventListener('resize', scheduleFormGridMeasurement));

onBeforeUnmount(() => {
  unsubscribeOptionSources?.();
  window.removeEventListener('resize', scheduleFormGridMeasurement);
  formGridResizeObserver?.disconnect();
  if (typeof formGridMeasureFrame === 'number') {
    cancelAnimationFrame(formGridMeasureFrame);
  }
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFieldVisibilityCondition(field: LowCodeField) {
  const condition = field.props?.visibleWhen;
  if (!isRecord(condition) || typeof condition.field !== 'string') return undefined;
  const sourceField = condition.field.trim();
  if (!sourceField) return undefined;
  return { ...condition, field: sourceField } as FieldVisibilityCondition;
}

function isFieldVisible(field: LowCodeField, values: Record<string, unknown>) {
  const condition = readFieldVisibilityCondition(field);
  if (!condition) return true;
  const value = values[condition.field];
  if (Array.isArray(condition.includes)) return condition.includes.includes(value);
  if (Object.prototype.hasOwnProperty.call(condition, 'notEquals')) {
    return value !== condition.notEquals;
  }
  return value === condition.equals;
}

function createLastRowFillTemplate(rowCount: number, allowLastRowToShrink = false) {
  if (rowCount <= 0) return undefined;

  const lastRow = allowLastRowToShrink
    ? 'minmax(0, 1fr)'
    : 'minmax(max-content, 1fr)';
  return rowCount === 1
    ? lastRow
    : `repeat(${rowCount - 1}, max-content) ${lastRow}`;
}

function measureFormGridRows() {
  formGridMeasureFrame = undefined;
  const grid = formGridRef.value;
  if (!grid) return;

  const rowTops: number[] = [];
  Array.from(grid.children).forEach((child) => {
    const top = child.getBoundingClientRect().top;
    if (!rowTops.some((rowTop) => Math.abs(rowTop - top) < 1)) {
      rowTops.push(top);
    }
  });
  formGridRowCount.value = rowTops.length;
}

function scheduleFormGridMeasurement() {
  if (!formGridRef.value || typeof requestAnimationFrame === 'undefined') return;
  if (typeof formGridMeasureFrame === 'number') {
    cancelAnimationFrame(formGridMeasureFrame);
  }
  formGridMeasureFrame = requestAnimationFrame(measureFormGridRows);
}

function readFormColumnCount() {
  const schemaColumns = Number(props.schema.columns);

  if (Number.isFinite(schemaColumns) && schemaColumns > 0) {
    return Math.min(24, Math.max(1, Math.round(schemaColumns)));
  }

  const span = normalizeVxeSpan(props.span, 24);
  return Math.max(1, Math.floor(24 / span));
}

function normalizeVxeSpan(value: unknown, fallback = 24) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback;
  return Math.min(24, Math.max(1, Math.round(numeric)));
}

function isWideField(field: LowCodeField) {
  return [
    'lc-array-table',
    'lc-sub-form',
    'lc-json-editor',
    'lc-monaco-editor',
  ].includes(field.component);
}

function fieldGridCellClass(field: LowCodeField) {
  return [
    'lc-form-grid-cell',
    {
      'lc-form-grid-cell--wide': isWideField(field),
      'lc-form-grid-cell--array': field.component === 'lc-array-table',
    },
  ];
}

function getFieldColumnSpan(field: LowCodeField) {
  const columns = formColumnCount.value;
  const span = Number(field.span);

  if (Number.isFinite(span) && span > 0) {
    return Math.min(columns, Math.max(1, Math.round(span)));
  }

  return isWideField(field) ? columns : 1;
}

function getFieldVxeSpan(field: LowCodeField) {
  return Math.min(24, Math.max(1, getFieldColumnSpan(field) * defaultVxeSpan.value));
}

function fieldGridCellStyle(field: LowCodeField) {
  return {
    '--lc-form-cell-span': String(getFieldColumnSpan(field)),
  };
}

function resolveFormItemProps(field: LowCodeField) {
  return formItemPropsByField.value[field.field] ?? {
    field: field.field,
    title: field.label,
    showTitle: field.showTitle,
    span: getFieldVxeSpan(field),
    className: 'lc-form-item',
    contentClassName: 'lc-form-item__content',
    titleClassName: 'lc-form-item__title',
  };
}

function normalizeOption(
  option: unknown,
  field: LowCodeField
): LowCodeOption & Record<string, unknown> {
  if (!isRecord(option)) {
    return {
      label: String(option),
      value: String(option)
    };
  }

  const labelKey = String(field.optionProps?.label ?? 'label');
  const valueKey = String(field.optionProps?.value ?? 'value');
  const childrenKey = String(field.optionProps?.children ?? 'children');
  const label =
    option[labelKey] ?? option.name ?? option.title ?? option.code ?? option.id ?? '';
  const value = option[valueKey] ?? option.code ?? option.id ?? label;
  const normalized: LowCodeOption & Record<string, unknown> = {
    ...option,
    label: label as LowCodeOption['label'],
    value: value as LowCodeOption['value']
  };

  if (Array.isArray(option[childrenKey])) {
    normalized.children = (option[childrenKey] as unknown[]).map((child) =>
      normalizeOption(child, field)
    );
  }

  return normalized;
}

function resolveOptions(field: LowCodeField) {
  if (field.optionsCode) {
    const source =
      codeOptionSources[field.optionsCode] ??
      lowCodeOptionSourceRegistry.peek(field.optionsCode);

    if (Array.isArray(source)) {
      return source.map((option) => normalizeOption(option, field));
    }
  }

  if (field.optionsSourceKey) {
    const source = props.optionSources?.[field.optionsSourceKey];

    if (Array.isArray(source)) {
      return source.map((option) => normalizeOption(option, field));
    }
  }

  return field.options ?? [];
}

function readFieldValue(field: LowCodeField) {
  return formData[field.field];
}

function formValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every(
      (value, index) => formValuesEqual(value, right[index])
    );
  }
  if (typeof left === 'object' && left !== null && typeof right === 'object' && right !== null) {
    const leftValues = left as Record<string, unknown>;
    const rightValues = right as Record<string, unknown>;
    const keys = Object.keys(leftValues);
    return keys.length === Object.keys(rightValues).length && keys.every(
      (key) => key in rightValues && formValuesEqual(leftValues[key], rightValues[key])
    );
  }
  return false;
}

function setFieldValue(field: LowCodeField, value: unknown) {
  if (isFormInteractionBlocked.value || isFieldDisabled(field)) return;
  formData[field.field] = value;
  emit('update:modelValue', { ...formData });
  vxeFormRef.value?.updateStatus({ field: field.field }, value);
}

function handleFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
}) {
  if (isFormInteractionBlocked.value || isFieldDisabled(payload.field)) return;
  emit('fieldChange', {
    ...payload,
    values: { ...formData },
  });
}

function isEmptyRuleValue(value: unknown) {
  return value === undefined || value === null || String(value).trim() === '';
}

function createVxeRule(rule: LowCodeRule): VxeLowCodeFormRule {
  const message = rule.message;

  return {
    required: rule.required,
    min: rule.min,
    content: message,
    message,
    trigger: 'change',
    validator({ itemValue }) {
      if (rule.required && isEmptyRuleValue(itemValue)) {
        return new Error(message);
      }

      if (rule.min && String(itemValue ?? '').length < rule.min) {
        return new Error(message);
      }
    },
  };
}

function createFieldValidationRule(field: LowCodeField): VxeLowCodeFormRule {
  const message = field.validationMessage || `${field.label}校验不通过`;

  return {
    content: message,
    message,
    trigger: 'change',
    async validator({ itemValue }) {
      if (!props.fieldValidator) return;
      const result = await props.fieldValidator(field, itemValue, { ...formData });
      if (result !== true) throw new Error(result || message);
    },
  };
}

function readExternalRules(field: string) {
  const rules = props.rules?.[field];
  return Array.isArray(rules) ? rules : [];
}

function isSafeFormFieldName(field: string) {
  return Boolean(field) && !['__proto__', 'prototype', 'constructor'].includes(field);
}

function patchFieldValues(
  sourceField: LowCodeField,
  payload: LowCodeFormMaterialPatchPayload,
) {
  if (
    isFormInteractionBlocked.value ||
    isFieldDisabled(sourceField) ||
    !isRecord(payload?.values)
  ) return;

  const changes = Object.entries(payload.values).filter(([field]) =>
    isSafeFormFieldName(field)
  );
  if (!changes.length) return;

  const previousValues = Object.fromEntries(
    changes.map(([field]) => [field, formData[field]])
  );
  changes.forEach(([field, value]) => {
    formData[field] = value;
  });
  emit('update:modelValue', { ...formData });

  changes.forEach(([fieldName, value]) => {
    vxeFormRef.value?.updateStatus({ field: fieldName }, value);
    const field = fieldsByKey.value[fieldName];
    if (!field || Object.is(previousValues[fieldName], value)) return;
    emit('fieldChange', {
      field,
      value,
      previousValue: previousValues[fieldName],
      values: { ...formData },
    });
  });
}

function handleRelateSelect(
  field: LowCodeField,
  payload: LowCodeFormMaterialSelectPayload,
) {
  if (
    isFormInteractionBlocked.value ||
    isFieldDisabled(field) ||
    !isRecord(payload?.row) ||
    !isRecord(payload?.values)
  ) return;
  emit('relateSelect', {
    field,
    row: payload.row,
    values: payload.values,
    formValues: { ...formData },
  });
}

function isValidResult(value: unknown) {
  if (
    !isRecord(value) ||
    Object.keys(value).length === 0
  ) {
    return true;
  }

  return false;
}

async function validate() {
  if (isFormInteractionBlocked.value) return true;
  try {
    const result = await vxeFormRef.value?.validate();
    return isValidResult(result);
  } catch {
    return false;
  }
}

async function clearValidation() {
  await vxeFormRef.value?.clearValidate();
}

function snapshot() {
  const value = { ...formData };
  emit('update:modelValue', value);
  return value;
}

async function handleSubmit() {
  if (isFormInteractionBlocked.value) return false;
  if (!(await validate())) return false;
  emit('submit', snapshot());
  return true;
}

function handleVxeSubmit() {
  void handleSubmit();
}

function handleLabelContextMenu(event: MouseEvent) {
  if (!props.labelContextMenu) return;

  const target = event.target;
  const currentTarget = event.currentTarget;
  if (!(target instanceof Element) || !(currentTarget instanceof Element)) return;

  const title = target.closest('.vxe-form--item-title');
  if (!title || title.closest('.lc-form') !== currentTarget) return;

  const formItem = title.closest('[data-lc-field]');
  const fieldName = formItem?.getAttribute('data-lc-field') ?? '';
  const field = fieldsByKey.value[fieldName];
  if (!field) return;

  event.preventDefault();
  event.stopPropagation();
  emit('labelContextMenu', event, field);
}

function setValues(values: Record<string, unknown>) {
  Object.keys(formData).forEach((key) => delete formData[key]);
  Object.assign(formData, values);
  emit('update:modelValue', { ...formData });
}

async function handleAction(action: LowCodeAction) {
  if (isFormInteractionBlocked.value || action.disabled) return;
  if (action.type === 'submit') {
    await handleSubmit();
    return;
  }

  if (action.type === 'reset') {
    Object.keys(formData).forEach((key) => {
      delete formData[key];
    });
    Object.assign(formData, initialModel.value);
    void clearValidation();
  }

  emit('action', action, snapshot());
}

defineExpose({
  submit: handleSubmit,
  validate,
  snapshot,
  setValues,
  clearValidation,
});
</script>

<style>
.lc-form,
.lc-form-grid,
.lc-form-layout {
  width: 100%;
  min-width: 0;
}

.lc-form {
  background: transparent;
}

.lc-form--fill {
  height: 100%;
  min-height: 0;
}

.lc-form.vxe-form.lc-form--fill > .vxe-form--wrapper,
.lc-form.vxe-form.lc-form--fill > .vxe-form--wrapper > .lc-form-layout {
  height: 100%;
  min-height: 0;
  grid-template-rows: minmax(0, 1fr);
}

.lc-form.vxe-form > .vxe-form--wrapper {
  display: grid;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  gap: 12px;
}

.lc-form.vxe-form > .vxe-form-slots {
  display: none;
}

.lc-form-grid,
.lc-form-layout {
  display: grid;
  min-height: 0;
  gap: 6px 8px;
  grid-auto-rows: max-content;
}

.lc-form-grid {
  grid-template-columns: repeat(var(--lc-form-columns, 1), minmax(0, 1fr));
  align-items: start;
}

.lc-form-grid-cell {
  min-width: 0;
  grid-column: span var(--lc-form-cell-span, 1) / span var(--lc-form-cell-span, 1);
}

.lc-form-grid-cell--wide {
  grid-column: 1 / -1;
}

.lc-form-grid-cell--array {
  display: grid;
  min-height: 0;
  align-self: stretch;
}

.lc-form-grid-cell--array .vxe-form--item,
.lc-form-grid-cell--array .lc-form-item,
.lc-form-grid-cell--array .vxe-form--item-inner,
.lc-form-grid-cell--array .vxe-form--item-content,
.lc-form-grid-cell--array .lc-form-item__content,
.lc-form-grid-cell--array .lc-field,
.lc-form-grid-cell--array .lc-field > .lc-array-table {
  height: 100%;
  min-height: 0;
}

.lc-form-row {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: flex-start;
}

.lc-form-layout > .lc-form-row.lc-form-row--span-grid {
  display: grid;
  grid-template-columns: var(--lc-form-row-template, minmax(0, 1fr));
}

.lc-form-col {
  flex: 1 1 0;
  width: 100%;
  min-width: 0;
}

.lc-form .vxe-form--item,
.lc-form .lc-form-item {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  margin-bottom: 0;
}

.lc-form .vxe-form--item-title {
  min-height: 18px;
  color: #334155;
  font-size: 12px;
  font-weight: 600;
  line-height: 18px;
}

.lc-form .vxe-form--item.is--vertical {
  align-items: stretch;
  gap: 5px;
}

.lc-form .vxe-form--item.is--vertical > .vxe-form--item-title {
  width: auto;
  height: auto;
  min-height: 18px;
  margin: 0;
  line-height: 18px;
}

.lc-form .vxe-form--item.is--vertical:not(.is--padding) > .vxe-form--item-title {
  padding: 0;
}

.lc-form .vxe-form--item.is--vertical > .vxe-form--item-content {
  min-height: 0;
}

.lc-form .vxe-form--item-content,
.lc-form .lc-form-item__content {
  min-width: 0;
  max-width: 100%;
}

.lc-form .vxe-form-item--valid-error-icon-wrapper:hover
  .vxe-form-item--valid-error-icon-msg-tip,
.lc-form .vxe-form-item--valid-error-icon-wrapper.is--show
  .vxe-form-item--valid-error-icon-msg-tip {
  width: max-content;
  max-width: min(24em, 60vw);
  padding: 0.4em;
  overflow: visible;
}

.lc-field {
  display: grid;
  gap: 6px;
  width: 100%;
  min-width: 0;
}

.lc-field > :not(label) {
  width: 100%;
  min-width: 0;
}

.lc-field > .vxe-input,
.lc-field > .vxe-password-input,
.lc-field > .vxe-number-input,
.lc-field > .vxe-textarea,
.lc-field > .vxe-select,
.lc-field > .vxe-tree-select,
.lc-field > .vxe-cascader,
.lc-field > .vxe-color-picker,
.lc-field > .lc-array-table,
.lc-field > .lc-sub-form,
.lc-field > .lc-json-editor,
.lc-field > .lc-monaco-editor {
  width: 100%;
  max-width: 100%;
}

.lc-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  min-width: 0;
}

@media (max-width: 720px) {
  .lc-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .lc-form-grid-cell {
    grid-column: 1 / -1;
  }

  .lc-form-row {
    flex-direction: column;
  }

  .lc-form-layout > .lc-form-row.lc-form-row--span-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .lc-form-col {
    flex-basis: auto !important;
    max-width: 100% !important;
  }
}
</style>
