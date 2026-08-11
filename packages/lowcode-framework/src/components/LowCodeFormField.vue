<template>
  <div class="lc-field" :class="{ 'lc-field--without-label': !showLabel }">
    <label v-if="showLabel" :for="field.field">{{ field.label }}</label>
    <component
      :is="materialComponent"
      :field="renderField"
      :model-value="modelValue"
      :options="options"
      :form-values="formValues"
      @update:model-value="handleUpdate"
      @patch-model="handlePatchModel"
      @select="handleSelect"
    />
    <!-- <span v-if="field.help" class="lc-help">{{ field.help }}</span>
    <span v-if="error" class="lc-error">{{ error }}</span> -->
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { getLowCodeFormMaterial } from '../lowcode/form-materials';
import type { LowCodeField } from '../types/lowcode';
import type { LowCodeResolvedOption } from '../lowcode/form-materials';
import type {
  LowCodeFormMaterialPatchPayload,
  LowCodeFormMaterialSelectPayload,
} from '../lowcode/form-materials';

const props = withDefaults(
  defineProps<{
    field: LowCodeField;
    modelValue: any;
    options?: LowCodeResolvedOption[];
    error?: string;
    showLabel?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    formValues?: Record<string, unknown>;
  }>(),
  {
    options: () => [],
    error: '',
    showLabel: true,
    disabled: false,
    readonly: false,
    formValues: () => ({}),
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: any];
  change: [payload: { field: LowCodeField; value: any; previousValue: any }];
  patchModel: [payload: LowCodeFormMaterialPatchPayload];
  relateSelect: [payload: LowCodeFormMaterialSelectPayload];
}>();

const renderField = computed<LowCodeField>(() => {
  const fieldProps = {
    ...(props.field.props ?? {}),
  };

  if (props.disabled) {
    fieldProps.disabled = true;
  }

  if (props.readonly) {
    fieldProps.readonly = true;
  }

  return {
    ...props.field,
    props: fieldProps,
  };
});

const materialComponent = computed(() =>
  getLowCodeFormMaterial(renderField.value.component).component
);

function handleUpdate(value: any) {
  const previousValue = props.modelValue;
  emit('update:modelValue', value);
  emit('change', {
    field: props.field,
    value,
    previousValue,
  });
}

function handlePatchModel(payload: LowCodeFormMaterialPatchPayload) {
  emit('patchModel', payload);
}

function handleSelect(payload: LowCodeFormMaterialSelectPayload) {
  emit('relateSelect', payload);
}
</script>
