<template>
  <vxe-select
    :id="field.field"
    v-model="selectedValue"
    :multiple="isMultiple"
    v-bind="field.props"
  >
    <vxe-option
      v-for="option in options"
      :key="String(option.value)"
      :label="option.label"
      :value="option.value"
      :disabled="option.disabled"
    />
  </vxe-select>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LowCodeFormMaterialProps, LowCodeResolvedOption } from '../types';

const props = withDefaults(defineProps<LowCodeFormMaterialProps>(), {
  options: () => [],
});
const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();

const isMultiple = computed(() => Boolean(props.field.props?.multiple));

const selectedValue = computed({
  get() {
    if (isMultiple.value && Array.isArray(props.modelValue)) {
      return props.modelValue
        .map((value) => findOptionByRawValue(value)?.value)
        .filter((value) => value !== undefined);
    }

    return findOptionByRawValue(props.modelValue)?.value ?? '';
  },
  set(value) {
    if (Array.isArray(value)) {
      emit('update:modelValue', value.map((item) => cloneValue(readRawValueByKey(item))));
      return;
    }

    emit('update:modelValue', cloneValue(readRawValueByKey(value)));
  },
});

function readRawValue(option: LowCodeResolvedOption) {
  return Object.prototype.hasOwnProperty.call(option, 'rawValue')
    ? option.rawValue
    : option.value;
}

function readRawValueByKey(value: unknown) {
  const option = props.options.find((item) => item.value === value);
  return option ? readRawValue(option) : value;
}

function findOptionByRawValue(value: unknown) {
  return props.options.find((option) => isSameValue(readRawValue(option), value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSameValue(prev: unknown, next: unknown) {
  if (isRecord(prev) && isRecord(next) && 'value' in prev && 'value' in next) {
    return prev.value === next.value;
  }

  if (Object.is(prev, next)) return true;

  try {
    return JSON.stringify(prev) === JSON.stringify(next);
  } catch {
    return false;
  }
}

function cloneValue(value: unknown) {
  if (!isRecord(value) && !Array.isArray(value)) return value;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}
</script>
