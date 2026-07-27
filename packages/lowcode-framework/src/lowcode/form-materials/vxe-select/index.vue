<template>
  <vxe-select
    :id="field.field"
    v-model="model"
    v-bind="field.props"
  >
    <vxe-option
      v-for="option in options"
      :key="String(option.value)"
      :label="option.label"
      :value="option.value"
    />
  </vxe-select>
</template>

<script setup lang="ts">
import type { LowCodeFormMaterialProps } from '../types';
import { useLowCodeFormMaterialModel } from '../useLowCodeFormMaterialModel';

const props = withDefaults(defineProps<LowCodeFormMaterialProps>(), {
  options: () => [],
});
const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const model = useLowCodeFormMaterialModel(props, emit);
</script>
