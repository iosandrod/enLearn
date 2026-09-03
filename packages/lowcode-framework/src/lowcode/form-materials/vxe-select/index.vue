<template>
  <vxe-select
    :id="field.field"
    v-model="model"
    v-bind="selectProps"
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

const selectProps = computed(() => {
  const fieldProps = { ...(props.field.props ?? {}) };

  // Keep an explicit false value intact, while making every select searchable by default.
  if (fieldProps.filterable === undefined) {
    fieldProps.filterable = true;
  }

  return fieldProps;
});
</script>
