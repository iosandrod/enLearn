<template>
  <section class="lc-sub-form">
    <LowCodeForm
      v-if="configuredSchema"
      ref="lowCodeFormRef"
      v-bind="lowCodeFormProps"
      @update:model-value="handleUpdate"
      @submit="handleSubmit"
      @action="handleAction"
      @field-change="handleFieldChange"
    />
    <div v-else class="lc-sub-form__unconfigured" role="alert">
      子表单 Schema 未配置
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import { isLowCodeFormSchema } from '../../form-schema';
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormProps,
  LowCodeFormSchema,
} from '../../../types/lowcode';
import type { LowCodeFormMaterialProps } from '../types';

const unconfiguredSchema: LowCodeFormSchema = {
  fields: [],
  actions: [],
};

const props = defineProps<LowCodeFormMaterialProps>();
const lowCodeFormRef = ref<InstanceType<typeof LowCodeForm> | null>(null);
const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
  submit: [value: Record<string, unknown>];
  action: [action: LowCodeAction, value: Record<string, unknown>];
  fieldChange: [payload: SubFormFieldChangePayload];
}>();

type SubFormFieldChangePayload = {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
  values: Record<string, unknown>;
};

const fieldProps = computed(() =>
  isRecord(props.field.props) ? props.field.props : {}
);

const objectValue = computed(() =>
  isRecord(props.modelValue) ? props.modelValue : {}
);
const configuredSchema = computed(() => {
  const schema = fieldProps.value.schema;
  return isLowCodeFormSchema(schema) ? schema : null;
});

const lowCodeFormProps = computed<LowCodeFormProps>(() => {
  const { onSubmit, onAction, onFieldChange, schema, ...forwardedProps } = fieldProps.value;

  return {
    ...(forwardedProps as Partial<LowCodeFormProps>),
    schema: configuredSchema.value ?? unconfiguredSchema,
    modelValue: objectValue.value,
    optionSources: props.optionSources ?? {},
    readonly: forwardedProps.readonly === true,
    disabled: forwardedProps.disabled === true,
  };
});

function handleUpdate(value: Record<string, unknown>) {
  if (lowCodeFormProps.value.readonly || lowCodeFormProps.value.disabled) return;
  emit('update:modelValue', isRecord(value) ? value : {});
}

function handleSubmit(value: Record<string, unknown>) {
  emit('submit', value);
  const handler = fieldProps.value.onSubmit;

  if (typeof handler === 'function') {
    handler(value);
  }
}

function handleAction(action: LowCodeAction, value: Record<string, unknown>) {
  emit('action', action, value);
  const handler = fieldProps.value.onAction;

  if (typeof handler === 'function') {
    handler(action, value);
  }
}

function handleFieldChange(payload: SubFormFieldChangePayload) {
  emit('fieldChange', payload);
  props.onFieldChange?.(payload);
  const handler = fieldProps.value.onFieldChange;

  if (typeof handler === 'function') {
    handler(payload);
  }
}

function commitPendingValue() {
  lowCodeFormRef.value?.commitPendingValues();
}

defineExpose({ commitPendingValue });

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

</script>

<style scoped>
.lc-sub-form {
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  padding: 12px;
  border: 1px solid #d8e0ea;
  border-radius: 6px;
  box-sizing: border-box;
  background: #f8fafc;
}

.lc-sub-form :deep(.lc-form-grid) {
  grid-template-columns: repeat(var(--lc-form-columns, 1), minmax(0, 1fr));
}

.lc-sub-form__unconfigured {
  display: grid;
  min-height: 48px;
  place-items: center;
  color: #b42318;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.lc-sub-form :deep(.lc-form),
.lc-sub-form :deep(.lc-form-grid),
.lc-sub-form :deep(.lc-form-layout),
.lc-sub-form :deep(.lc-form-row),
.lc-sub-form :deep(.lc-form-col),
.lc-sub-form :deep(.lc-field) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}

.lc-sub-form :deep(.lc-form),
.lc-sub-form :deep(.lc-form-grid),
.lc-sub-form :deep(.lc-form-layout),
.lc-sub-form :deep(.lc-field) {
  display: grid;
}

.lc-sub-form :deep(.lc-form),
.lc-sub-form :deep(.lc-form-grid),
.lc-sub-form :deep(.lc-form-layout) {
  gap: 10px;
}

.lc-sub-form :deep(.lc-field) {
  gap: 6px;
}

.lc-sub-form :deep(.lc-field > :not(label)),
.lc-sub-form :deep(.vxe-input),
.lc-sub-form :deep(.vxe-password-input),
.lc-sub-form :deep(.vxe-number-input),
.lc-sub-form :deep(.vxe-textarea),
.lc-sub-form :deep(.vxe-select),
.lc-sub-form :deep(.vxe-tree-select),
.lc-sub-form :deep(.vxe-cascader),
.lc-sub-form :deep(.vxe-color-picker),
.lc-sub-form :deep(.lc-array-table),
.lc-sub-form :deep(.lc-sub-form),
.lc-sub-form :deep(.lc-json-editor) {
  width: 100%;
  max-width: 100%;
  min-width: 0;
}
</style>
