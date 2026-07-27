<template>
  <vxe-cascader
    :id="field.field"
    v-model="model"
    :options="options"
    :option-props="cascaderProps"
    v-bind="inputProps"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LowCodeFormMaterialProps } from '../types';
import { useLowCodeFormMaterialModel } from '../useLowCodeFormMaterialModel';

const props = withDefaults(defineProps<LowCodeFormMaterialProps>(), {
  options: () => [],
});
const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const model = useLowCodeFormMaterialModel(props, emit);

const cascaderProps = computed(() => ({
  value: 'value',
  label: 'label',
  children: 'children',
  disabled: 'disabled',
  ...(props.field.props?.cascaderProps as Record<string, unknown> | undefined),
}));

const inputProps = computed(() => {
  const { cascaderProps: _cascaderProps, ...rest } = props.field.props ?? {};
  return rest;
});
</script>
