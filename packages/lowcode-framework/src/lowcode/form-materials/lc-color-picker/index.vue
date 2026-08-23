<template>
  <vxe-color-picker
    ref="pickerRef"
    :id="field.field"
    v-model="model"
    v-bind="field.props"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { LowCodeFormMaterialProps } from '../types';
import { useLowCodeFormMaterialModel } from '../useLowCodeFormMaterialModel';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const model = useLowCodeFormMaterialModel(props, emit);
const pickerRef = ref<{
  reactData?: {
    selectTyle?: string;
    selectColor?: string;
    hexValue?: string;
  };
} | null>(null);

function commitPendingValue() {
  const pickerData = pickerRef.value?.reactData;
  if (!pickerData) return;

  const value = pickerData.selectTyle === 'hex'
    ? pickerData.hexValue
    : pickerData.selectColor;
  if (typeof value === 'string' && value && value !== props.modelValue) {
    emit('update:modelValue', value);
  }
}

defineExpose({ commitPendingValue });
</script>
