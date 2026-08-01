<template>
  <section class="lc-sub-form">
    <LowCodeForm
      v-bind="lowCodeFormProps"
      @update:model-value="handleUpdate"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import type { LowCodeFormProps } from '../../../types/lowcode';
import type { LowCodeFormMaterialProps } from '../types';

const LowCodeForm = defineAsyncComponent(() => import('../../../components/LowCodeForm.vue'));

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

const lowCodeFormProps = computed<LowCodeFormProps>(() => ({
  ...(fieldProps.value as Partial<LowCodeFormProps>),
  modelValue: objectValue.value,
}));

function handleUpdate(value: Record<string, unknown>) {
  emit('update:modelValue', isRecord(value) ? value : {});
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
