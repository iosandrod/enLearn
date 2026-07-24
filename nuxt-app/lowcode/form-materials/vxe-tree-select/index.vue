<template>
  <vxe-tree-select
    :id="field.field"
    v-model="model"
    :options="options"
    :option-props="field.optionProps"
    v-bind="field.props"
  />
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
