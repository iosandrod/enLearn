<template>
  <div class="lc-json-editor">
    <vxe-textarea
      :id="field.field"
      v-model="textValue"
      :status="jsonError ? 'error' : undefined"
      v-bind="field.props"
      @blur="commitText"
    />
    <span v-if="jsonError" class="lc-error">{{ jsonError }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { LowCodeFormMaterialProps } from '../types';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();

const textValue = ref(formatValue(props.modelValue));
const jsonError = ref('');

watch(
  () => props.modelValue,
  (value) => {
    if (jsonError.value) return;
    textValue.value = formatValue(value);
  },
  { deep: true }
);

function formatValue(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === undefined) return '';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function commitText() {
  const value = textValue.value.trim();

  if (!value) {
    jsonError.value = '';
    emit('update:modelValue', undefined);
    return;
  }

  try {
    jsonError.value = '';
    emit('update:modelValue', JSON.parse(value));
  } catch {
    jsonError.value = 'JSON 格式不正确';
  }
}
</script>
