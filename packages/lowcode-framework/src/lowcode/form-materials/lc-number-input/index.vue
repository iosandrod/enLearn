<template>
  <vxe-number-input
    :id="field.field"
    v-model="model"
    v-bind="field.props"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LowCodeFormMaterialProps } from '../types';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: number];
}>();

const model = computed({
  get() {
    const value = Number(props.modelValue);
    return Number.isFinite(value) ? value : 0;
  },
  set(value) {
    emit('update:modelValue', Number(value));
  }
});
</script>
