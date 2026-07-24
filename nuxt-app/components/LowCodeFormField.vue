<template>
  <div class="lc-field">
    <label :for="field.field">{{ field.label }}</label>
    <component
      :is="materialComponent"
      :field="field"
      :model-value="modelValue"
      :options="options"
      @update:model-value="(value) => emit('update:modelValue', value)"
    />
    <span v-if="field.help" class="lc-help">{{ field.help }}</span>
    <span v-if="error" class="lc-error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getLowCodeFormMaterial } from '~/lowcode/form-materials';
import type { LowCodeField } from '~/types/lowcode';
import type { LowCodeResolvedOption } from '~/lowcode/form-materials';

const props = withDefaults(
  defineProps<{
    field: LowCodeField;
    modelValue: any;
    options?: LowCodeResolvedOption[];
    error?: string;
  }>(),
  {
    options: () => [],
    error: '',
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: any];
}>();

const materialComponent = computed(() => getLowCodeFormMaterial(props.field.component).component);
</script>
