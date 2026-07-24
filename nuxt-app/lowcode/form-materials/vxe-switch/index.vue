<template>
  <vxe-switch
    :id="field.field"
    v-model="model"
    v-bind="field.props"
  />
</template>

<script setup lang="ts">
import type { LowCodeFormMaterialProps } from '../types';
import { useLowCodeFormMaterialModel } from '../useLowCodeFormMaterialModel';

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const model = useLowCodeFormMaterialModel(props, emit);
</script>
