<template>
  <PackageLowCodeForm
    ref="formRef"
    v-bind="props"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @submit="(value) => emit('submit', value)"
    @action="(action, value) => emit('action', action, value)"
    @field-change="(payload) => emit('fieldChange', payload)"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { LowCodeForm as PackageLowCodeForm } from '@enlearn/lowcode-framework/runtime';
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormSchema
} from '~/types/lowcode';

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

const formRef = ref<InstanceType<typeof PackageLowCodeForm> | null>(null);

defineExpose({
  submit: () => formRef.value?.submit?.(),
  validate: () => formRef.value?.validate?.(),
  snapshot: () => formRef.value?.snapshot?.(),
});
</script>
