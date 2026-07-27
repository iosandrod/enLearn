<template>
  <section class="lc-sub-form">
    <LowCodeForm
      :schema="subSchema"
      :model-value="objectValue"
      @update:model-value="handleUpdate"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { LowCodeField, LowCodeFormLayoutNode } from '~/types/lowcode';
import type { LowCodeFormMaterialProps } from '../types';

const LowCodeForm = defineAsyncComponent(() => import('~/components/LowCodeForm.vue'));

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
}>();

const fieldProps = computed(() =>
  isRecord(props.field.props) ? props.field.props : {}
);

const subFields = computed(() =>
  Array.isArray(fieldProps.value.fields)
    ? (fieldProps.value.fields as LowCodeField[]).filter(isRecord)
    : []
);

const subLayout = computed(() =>
  Array.isArray(fieldProps.value.layout)
    ? (fieldProps.value.layout as LowCodeFormLayoutNode[])
    : undefined
);

const subSchema = computed(() => ({
  fields: subFields.value,
  ...(subLayout.value?.length ? { layout: subLayout.value } : {}),
  actions: [],
}));

const objectValue = computed(() =>
  createFlatObject(
    isRecord(props.modelValue) ? props.modelValue : {},
    createDefaultObject(),
  )
);

function handleUpdate(value: Record<string, unknown>) {
  const nextValue = isRecord(props.modelValue) ? cloneRecord(props.modelValue) : {};

  subFields.value.forEach((field) => {
    setPathValue(nextValue, field.field, value[field.field]);
  });

  emit('update:modelValue', nextValue);
}

function createDefaultObject() {
  return subFields.value.reduce<Record<string, unknown>>((model, field) => {
    if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
      setPathValue(model, field.field, cloneValue((field as { defaultValue?: unknown }).defaultValue));
    }

    return model;
  }, {});
}

function createFlatObject(
  value: Record<string, unknown>,
  defaultValue: Record<string, unknown>,
) {
  return subFields.value.reduce<Record<string, unknown>>((model, field) => {
    const currentValue = readPathValue(value, field.field);
    model[field.field] =
      typeof currentValue === 'undefined'
        ? readPathValue(defaultValue, field.field)
        : currentValue;
    return model;
  }, {});
}

function readPathValue(value: Record<string, unknown>, path: string) {
  if (!path.includes('.')) return value[path];

  return path.split('.').reduce<unknown>((result, key) => {
    return isRecord(result) ? result[key] : undefined;
  }, value);
}

function setPathValue(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split('.').filter(Boolean);
  if (!keys.length) return;

  const lastKey = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>((result, key) => {
    if (!isRecord(result[key])) {
      result[key] = {};
    }

    return result[key] as Record<string, unknown>;
  }, target);

  parent[lastKey] = value;
}

function cloneRecord(value: Record<string, unknown>) {
  return cloneValue(value) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
