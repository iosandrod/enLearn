<template>
  <div class="lc-field" :class="{ 'lc-field--without-label': !showLabel }">
    <label v-if="showLabel" :for="field.field">{{ field.label }}</label>
    <component
      :is="materialComponent"
      ref="materialRef"
      :field="renderField"
      :model-value="modelValue"
      :options="options"
      :option-sources="optionSources"
      :form-values="formValues"
      :on-field-change="handleNestedFieldChange"
      @update:model-value="handleUpdate"
      @patch-model="handlePatchModel"
      @select="handleSelect"
    />
    <!-- <span v-if="field.help" class="lc-help">{{ field.help }}</span>
    <span v-if="error" class="lc-error">{{ error }}</span> -->
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
    optionSources?: Record<string, unknown>;
    formValues?: Record<string, unknown>;
  }>(),
  {
    options: () => [],
    error: '',
    showLabel: true,
    disabled: false,
    readonly: false,
    optionSources: () => ({}),
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
  delete fieldProps.visibleWhen;
  delete fieldProps.onChange;

  if (props.field.component === 'lc-monaco-editor') {
    fieldProps.dialog = fieldProps.dialog !== false;
    fieldProps.dialogTitle ||= `编辑${props.field.label || '代码'}`;
    fieldProps.language ||= 'javascript';
    fieldProps.theme ||= 'vs';
    fieldProps.scriptThisType ||= 'LowCodeButtonScriptThis';
  }

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
const materialRef = ref<{ commitPendingValue?: () => void } | null>(null);

function commitPendingValue() {
  materialRef.value?.commitPendingValue?.();
}

defineExpose({ commitPendingValue });

function handleUpdate(value: any) {
  const previousValue = cloneValue(valueBeforeChange);
  emit('update:modelValue', value);
  emit('change', {
    field: props.field,
    value,
    previousValue,
  });
}

let valueBeforeChange = cloneValue(props.modelValue);

watch(
  () => props.modelValue,
  (value) => {
    valueBeforeChange = cloneValue(value);
  },
  { deep: true },
);

function cloneValue<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function handlePatchModel(payload: LowCodeFormMaterialPatchPayload) {
  emit('patchModel', payload);
}

function handleSelect(payload: LowCodeFormMaterialSelectPayload) {
  emit('relateSelect', payload);
}

function handleNestedFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
  values: Record<string, unknown>;
}) {
  emit('change', {
    field: props.field,
    value: cloneValue(payload.values),
    previousValue: cloneValue(valueBeforeChange),
  });
}
</script>
