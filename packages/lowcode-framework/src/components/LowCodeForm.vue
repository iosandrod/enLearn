<template>
  <form class="lc-form" @submit.prevent="handleSubmit">
    <LowCodeFormLayout
      v-if="schema.layout?.length"
      :nodes="schema.layout"
      :fields-by-key="fieldsByKey"
    >
      <template #field="{ field }">
        <LowCodeFormField
          :field="field"
          :model-value="formData[field.field]"
          :options="resolveOptions(field)"
          :error="errors[field.field]"
          @update:model-value="(value) => setFieldValue(field, value)"
          @change="handleFieldChange"
        />
      </template>
    </LowCodeFormLayout>

    <div class="lc-form-grid" v-else>
      <LowCodeFormField
        v-for="field in schema.fields"
        :key="field.field"
        :field="field"
        :model-value="formData[field.field]"
        :options="resolveOptions(field)"
        :error="errors[field.field]"
        @update:model-value="(value) => setFieldValue(field, value)"
        @change="handleFieldChange"
      />
    </div>

    <div v-if="schema.actions.length" class="lc-actions">
      <vxe-button
        v-for="action in schema.actions"
        :key="action.code"
        :status="action.status"
        :loading="loading && action.type === 'submit'"
        :disabled="action.disabled || (loading && action.type !== 'submit')"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormSchema,
  LowCodeOption,
  LowCodeRule
} from '../types/lowcode';
import LowCodeFormField from './LowCodeFormField.vue';
import LowCodeFormLayout from './LowCodeFormLayout.vue';

const props = defineProps<{
  schema: LowCodeFormSchema;
  modelValue: Record<string, unknown>;
  optionSources?: Record<string, unknown>;
  loading?: boolean;
}>();

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

const formData = reactive<Record<string, unknown>>({ ...props.modelValue });
const errors = reactive<Record<string, string>>({});
const initialModel = ref<Record<string, unknown>>({ ...props.modelValue });
const fieldsByKey = computed(() =>
  props.schema.fields.reduce<Record<string, LowCodeField>>((prev, field) => {
    prev[field.field] = field;
    return prev;
  }, {})
);

watch(
  () => props.modelValue,
  (nextValue: Record<string, unknown>) => {
    Object.keys(formData).forEach((key) => delete formData[key]);
    Object.assign(formData, nextValue);
    initialModel.value = { ...nextValue };
  },
  { deep: true }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function setFieldValue(field: LowCodeField, value: unknown) {
  formData[field.field] = value;
  emit('update:modelValue', { ...formData });
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

function checkRule(value: unknown, rule: LowCodeRule) {
  if (
    rule.required &&
    (value === undefined || value === null || String(value).trim() === '')
  ) {
    return rule.message;
  }

  if (rule.min && String(value ?? '').length < rule.min) {
    return rule.message;
  }

  return '';
}

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key]);

  for (const field of props.schema.fields) {
    for (const rule of field.rules ?? []) {
      const message = checkRule(formData[field.field], rule);

      if (message) {
        errors[field.field] = message;
        break;
      }
    }
  }

  return Object.keys(errors).length === 0;
}

function snapshot() {
  const value = { ...formData };
  emit('update:modelValue', value);
  return value;
}

function handleSubmit() {
  if (!validate()) return;
  emit('submit', snapshot());
}

function handleAction(action: LowCodeAction) {
  if (action.type === 'submit') {
    handleSubmit();
    return;
  }

  if (action.type === 'reset') {
    Object.keys(formData).forEach((key) => {
      delete formData[key];
    });
    Object.assign(formData, initialModel.value);
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

.lc-form-row {
  display: flex;
  width: 100%;
  min-width: 0;
}

.lc-form-col {
  flex: 1 1 0;
  width: 100%;
  min-width: 0;
}

.lc-field {
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
</style>
