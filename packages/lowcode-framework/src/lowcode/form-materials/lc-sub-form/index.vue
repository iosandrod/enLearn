<template>
  <section class="lc-sub-form">
    <LowCodeForm
      v-bind="lowCodeFormProps"
      @update:model-value="handleUpdate"
      @submit="handleSubmit"
      @action="handleAction"
      @field-change="handleFieldChange"
    />
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import type { LowCodeFormProps, LowCodeFormSchema } from '../../../types/lowcode';
import type { LowCodeFormMaterialProps } from '../types';

const fallbackSchema: LowCodeFormSchema = {
  fields: [],
  actions: [],
};

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const fieldProps = computed(() =>
  isRecord(props.field.props) ? props.field.props : {}
);

const objectValue = computed(() =>
  isRecord(props.modelValue) ? props.modelValue : {}
);

const lowCodeFormProps = computed<LowCodeFormProps>(() => {
  const { onSubmit, onAction, onFieldChange, ...forwardedProps } = fieldProps.value;

  return {
    ...(forwardedProps as Partial<LowCodeFormProps>),
    schema: isLowCodeFormSchema(forwardedProps.schema) ? forwardedProps.schema : fallbackSchema,
    modelValue: objectValue.value,
  };
});

function handleUpdate(value: Record<string, unknown>) {
  emit('update:modelValue', isRecord(value) ? value : {});
}

function handleSubmit(value: Record<string, unknown>) {
  const handler = fieldProps.value.onSubmit;

  if (typeof handler === 'function') {
    handler(value);
  }
}

function handleAction(action: unknown, value: Record<string, unknown>) {
  const handler = fieldProps.value.onAction;

  if (typeof handler === 'function') {
    handler(action, value);
  }
}

function handleFieldChange(payload: Record<string, unknown>) {
  const handler = fieldProps.value.onFieldChange;

  if (typeof handler === 'function') {
    handler(payload);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLowCodeFormSchema(value: unknown): value is LowCodeFormSchema {
  return isRecord(value) && Array.isArray(value.fields);
}
</script>

<style scoped>
.lc-sub-form {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid #d8e0ea;
  border-radius: 6px;
  box-sizing: border-box;
  background: #f8fafc;
}

.lc-sub-form :deep(.lc-form),
.lc-sub-form :deep(.lc-form-grid),
.lc-sub-form :deep(.lc-form-layout),
.lc-sub-form :deep(.lc-form-row),
.lc-sub-form :deep(.lc-form-col),
.lc-sub-form :deep(.lc-field) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.lc-sub-form :deep(.lc-form),
.lc-sub-form :deep(.lc-form-grid),
.lc-sub-form :deep(.lc-form-layout),
.lc-sub-form :deep(.lc-field) {
  display: grid;
}

.lc-sub-form :deep(.lc-form),
.lc-sub-form :deep(.lc-form-grid),
.lc-sub-form :deep(.lc-form-layout) {
  gap: 10px;
}

.lc-sub-form :deep(.lc-field) {
  gap: 6px;
}

.lc-sub-form :deep(.lc-field > :not(label)),
.lc-sub-form :deep(.vxe-input),
.lc-sub-form :deep(.vxe-password-input),
.lc-sub-form :deep(.vxe-number-input),
.lc-sub-form :deep(.vxe-textarea),
.lc-sub-form :deep(.vxe-select),
.lc-sub-form :deep(.vxe-tree-select),
.lc-sub-form :deep(.vxe-cascader),
.lc-sub-form :deep(.vxe-color-picker),
.lc-sub-form :deep(.lc-array-table),
.lc-sub-form :deep(.lc-sub-form),
.lc-sub-form :deep(.lc-json-editor),
.lc-sub-form :deep(.lc-json-editor .vxe-textarea) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
</style>
