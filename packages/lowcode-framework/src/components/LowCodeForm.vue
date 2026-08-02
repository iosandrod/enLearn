<template>
  <vxe-form
    ref="vxeFormRef"
    v-bind="mergedFormProps"
    class="lc-form"
    :data="vxeFormData"
    :loading="loading"
    :rules="formRules"
    :custom-layout="true"
    @submit="handleVxeSubmit"
  >
    <LowCodeFormLayout
      v-if="layoutNodes.length"
      :nodes="layoutNodes"
      :fields-by-key="fieldsByKey"
    >
      <template #field="{ field }">
        <vxe-form-item v-bind="resolveFormItemProps(field)">
          <LowCodeFormField
            :field="field"
            :model-value="readFieldValue(field)"
            :options="resolveOptions(field)"
            :show-label="false"
            :disabled="isFormDisabled"
            :readonly="isFormReadonly"
            @update:model-value="(value) => setFieldValue(field, value)"
            @change="handleFieldChange"
          />
        </vxe-form-item>
      </template>
    </LowCodeFormLayout>

    <div v-else class="lc-form-grid" :style="formGridStyle">
      <div
        v-for="field in fields"
        :key="field.field"
        :class="fieldGridCellClass(field)"
        :style="fieldGridCellStyle(field)"
      >
        <vxe-form-item v-bind="resolveFormItemProps(field)">
          <LowCodeFormField
            :field="field"
            :model-value="readFieldValue(field)"
            :options="resolveOptions(field)"
            :show-label="false"
            :disabled="isFormDisabled"
            :readonly="isFormReadonly"
            @update:model-value="(value) => setFieldValue(field, value)"
            @change="handleFieldChange"
          />
        </vxe-form-item>
      </div>
    </div>

    <div v-if="formActions.length" class="lc-actions">
      <vxe-button
        v-for="action in formActions"
        :key="action.code"
        :status="action.status"
        :loading="loading && action.type === 'submit'"
        :disabled="action.disabled || (loading && action.type !== 'submit')"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </vxe-form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, useAttrs, watch, type PropType } from 'vue';
import type {
  VxeFormDefines,
  VxeFormInstance,
  VxeFormItemProps,
  VxeFormProps,
} from 'vxe-pc-ui';
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormModel,
  LowCodeFormLayoutNode,
  LowCodeOption,
  LowCodeRule
} from '../types/lowcode';
import LowCodeFormField from './LowCodeFormField.vue';
import LowCodeFormLayout from './LowCodeFormLayout.vue';

defineOptions({
  inheritAttrs: false,
});

type VxeLowCodeFormProps = VxeFormProps<LowCodeFormModel>;
type VxeLowCodeFormRules = NonNullable<VxeLowCodeFormProps['rules']>;
type VxeLowCodeFormRule = VxeFormDefines.FormRule<LowCodeFormModel>;

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
  titleAsterisk: Boolean,
  titleOverflow: [Boolean, String] as PropType<boolean | 'ellipsis' | 'title' | 'tooltip'>,
  vertical: Boolean,
  padding: {
    type: Boolean,
    default: false,
  },
  className: String,
  readonly: Boolean,
  disabled: Boolean,
  rules: Object as PropType<Record<string, VxeLowCodeFormRule[]>>,
  preventSubmit: Boolean,
  validConfig: Object as PropType<Record<string, unknown>>,
  tooltipConfig: Object as PropType<Record<string, unknown>>,
  collapseConfig: Object as PropType<Record<string, unknown>>,
  params: Object as PropType<Record<string, unknown>>,
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
}>();

const attrs = useAttrs();
const vxeFormRef = ref<VxeFormInstance<LowCodeFormModel>>();
const formData = reactive<Record<string, unknown>>({ ...props.modelValue });
const vxeFormData = reactive<Record<string, unknown>>({});
const initialModel = ref<Record<string, unknown>>({ ...props.modelValue });
const fields = computed(() =>
  Array.isArray(props.schema.fields) ? props.schema.fields : []
);
const layoutNodes = computed<LowCodeFormLayoutNode[]>(() =>
  Array.isArray(props.schema.layout) ? props.schema.layout : []
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
const fieldKeyByName = computed(() =>
  fields.value.reduce<Record<string, string>>((prev, field, index) => {
    prev[field.field] = createVxeFieldKey(field.field, index);
    return prev;
  }, {})
);
const formRules = computed<VxeLowCodeFormRules>(() => {
  return fields.value.reduce<VxeLowCodeFormRules>((rules, field) => {
    const vxeField = getVxeFieldKey(field);
    const schemaRules = (field.rules ?? []).map((rule) => createVxeRule(rule));
    const externalRules = readExternalRules(field.field, vxeField);
    const itemRules = [...schemaRules, ...externalRules];

    if (itemRules.length) {
      rules[vxeField] = itemRules;
    }

    return rules;
  }, {});
});
const formItemPropsByField = computed(() =>
  fields.value.reduce<Record<string, VxeFormItemProps<LowCodeFormModel>>>((prev, field) => {
    const vxeField = getVxeFieldKey(field);
    const span = getFieldVxeSpan(field);

    prev[field.field] = {
      field: vxeField,
      title: field.label,
      showTitle: field.showTitle,
      span,
      rules: formRules.value[vxeField],
      className: 'lc-form-item',
      contentClassName: 'lc-form-item__content',
      titleClassName: 'lc-form-item__title',
    };
    return prev;
  }, {})
);
const formGridStyle = computed(() => ({
  '--lc-form-columns': String(formColumnCount.value),
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
  disabled: props.disabled,
  preventSubmit: props.preventSubmit !== false,
  validConfig: props.validConfig,
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
const isFormDisabled = computed(() => props.disabled === true);
const isFormReadonly = computed(() => props.readonly === true);

watch(
  () => props.modelValue,
  (nextValue: Record<string, unknown>) => {
    Object.keys(formData).forEach((key) => delete formData[key]);
    Object.assign(formData, nextValue);
    initialModel.value = { ...nextValue };
    syncVxeFormData();
  },
  { deep: true }
);

watch(
  () => props.schema.fields,
  () => syncVxeFormData(),
  { deep: true, immediate: true }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function createVxeFieldKey(field: string, index: number) {
  const suffix = field.replace(/[^A-Za-z0-9_$]+/g, '_').replace(/^_+|_+$/g, '');
  return `__lc_field_${index}_${suffix || 'value'}`;
}

function getVxeFieldKey(field: LowCodeField) {
  return fieldKeyByName.value[field.field] ?? createVxeFieldKey(field.field, 0);
}

function isWideField(field: LowCodeField) {
  return ['lc-array-table', 'lc-sub-form', 'lc-json-editor'].includes(field.component);
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
    field: getVxeFieldKey(field),
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

function syncVxeFieldValue(field: LowCodeField, value: unknown) {
  vxeFormData[getVxeFieldKey(field)] = value;
}

function syncVxeFormData() {
  const nextKeys = new Set(fields.value.map((field) => getVxeFieldKey(field)));

  Object.keys(vxeFormData).forEach((key) => {
    if (!nextKeys.has(key)) {
      delete vxeFormData[key];
    }
  });

  fields.value.forEach((field) => {
    syncVxeFieldValue(field, readFieldValue(field));
  });
}

function setFieldValue(field: LowCodeField, value: unknown) {
  formData[field.field] = value;
  syncVxeFieldValue(field, value);
  emit('update:modelValue', { ...formData });
  vxeFormRef.value?.updateStatus({ field: getVxeFieldKey(field) }, value);
}

function handleFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
}) {
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

function readExternalRules(field: string, vxeField: string) {
  const rules: VxeLowCodeFormRule[] = [];
  const source = props.rules;

  if (!source) return rules;

  const directRules = source[field];
  if (Array.isArray(directRules)) {
    rules.push(...directRules);
  }

  if (vxeField !== field) {
    const internalRules = source[vxeField];
    if (Array.isArray(internalRules)) {
      rules.push(...internalRules);
    }
  }

  return rules;
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
  syncVxeFormData();

  try {
    const result = await vxeFormRef.value?.validate();
    return isValidResult(result);
  } catch {
    return false;
  }
}

function snapshot() {
  syncVxeFormData();
  const value = { ...formData };
  emit('update:modelValue', value);
  return value;
}

async function handleSubmit() {
  if (!(await validate())) return false;
  emit('submit', snapshot());
  return true;
}

function handleVxeSubmit() {
  void handleSubmit();
}

async function handleAction(action: LowCodeAction) {
  if (action.type === 'submit') {
    await handleSubmit();
    return;
  }

  if (action.type === 'reset') {
    Object.keys(formData).forEach((key) => {
      delete formData[key];
    });
    Object.assign(formData, initialModel.value);
    syncVxeFormData();
    void vxeFormRef.value?.clearValidate();
  }

  emit('action', action, snapshot());
}

defineExpose({
  submit: handleSubmit,
  validate,
  snapshot
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
  gap: 12px 16px;
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

.lc-form .vxe-form--item-content,
.lc-form .lc-form-item__content {
  min-width: 0;
  max-width: 100%;
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
.lc-json-editor > .vxe-textarea {
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

  .lc-form-col {
    flex-basis: auto !important;
    max-width: 100% !important;
  }
}
</style>
