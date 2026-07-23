<template>
  <form class="lc-form" @submit.prevent="handleSubmit">
    <div
      class="lc-form-grid"
      :style="{ '--lc-columns': String(schema.columns ?? 1) }"
    >
      <div
        v-for="field in schema.fields"
        :key="field.field"
        class="lc-field"
        :style="{ gridColumn: field.span ? `span ${field.span}` : undefined }"
      >
        <label :for="field.field">{{ field.label }}</label>

        <vxe-select
          v-if="field.component === 'vxe-select'"
          :id="field.field"
          v-model="formData[field.field]"
          v-bind="field.props"
        >
          <vxe-option
            v-for="option in resolveOptions(field)"
            :key="String(option.value)"
            :label="option.label"
            :value="option.value"
          />
        </vxe-select>

        <vxe-switch
          v-else-if="field.component === 'vxe-switch'"
          :id="field.field"
          v-model="formData[field.field]"
          v-bind="field.props"
        />

        <vxe-textarea
          v-else-if="field.component === 'vxe-textarea'"
          :id="field.field"
          v-model="formData[field.field]"
          v-bind="field.props"
        />

        <vxe-password-input
          v-else-if="field.component === 'vxe-password-input'"
          :id="field.field"
          v-model="formData[field.field]"
          v-bind="field.props"
        />

        <vxe-checkbox-group
          v-else-if="field.component === 'vxe-checkbox-group'"
          :id="field.field"
          v-model="formData[field.field]"
          :options="resolveOptions(field)"
          :option-props="field.optionProps"
          v-bind="field.props"
        />

        <vxe-radio-group
          v-else-if="field.component === 'vxe-radio-group'"
          :id="field.field"
          v-model="formData[field.field]"
          :options="resolveOptions(field)"
          :option-props="field.optionProps"
          v-bind="field.props"
        />

        <vxe-tree-select
          v-else-if="field.component === 'vxe-tree-select'"
          :id="field.field"
          v-model="formData[field.field]"
          :options="resolveOptions(field)"
          :option-props="field.optionProps"
          v-bind="field.props"
        />

        <vxe-input
          v-else
          :id="field.field"
          v-model="formData[field.field]"
          v-bind="field.props"
        />

        <span v-if="field.help" class="lc-help">{{ field.help }}</span>
        <span v-if="errors[field.field]" class="lc-error">
          {{ errors[field.field] }}
        </span>
      </div>
    </div>

    <div class="lc-actions">
      <vxe-button
        v-for="action in schema.actions"
        :key="action.code"
        :status="action.status"
        :loading="loading && action.type === 'submit'"
        :disabled="action.disabled"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </form>
</template>

<script setup lang="ts">
import type {
  LowCodeAction,
  LowCodeField,
  LowCodeFormSchema,
  LowCodeOption,
  LowCodeRule
} from '~/types/lowcode';

const props = defineProps<{
  schema: LowCodeFormSchema;
  modelValue: Record<string, unknown>;
  optionSources?: Record<string, unknown>;
  loading?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>];
  submit: [value: Record<string, unknown>];
  action: [action: LowCodeAction, value: Record<string, unknown>];
}>();

const formData = reactive<Record<string, unknown>>({ ...props.modelValue });
const errors = reactive<Record<string, string>>({});
const initialModel = ref<Record<string, unknown>>({ ...props.modelValue });

watch(
  () => props.modelValue,
  (nextValue: Record<string, unknown>) => {
    Object.keys(formData).forEach((key) => delete formData[key]);
    Object.assign(formData, nextValue);
    initialModel.value = { ...nextValue };
  },
  { deep: true }
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeOption(
  option: unknown,
  field: LowCodeField
): LowCodeOption & Record<string, unknown> {
  if (!isRecord(option)) {
    return {
      label: String(option),
      value: String(option)
    };
  }

  const labelKey = String(field.optionProps?.label ?? 'label');
  const valueKey = String(field.optionProps?.value ?? 'value');
  const childrenKey = String(field.optionProps?.children ?? 'children');
  const label =
    option[labelKey] ?? option.name ?? option.title ?? option.code ?? option.id ?? '';
  const value = option[valueKey] ?? option.code ?? option.id ?? label;
  const normalized: LowCodeOption & Record<string, unknown> = {
    ...option,
    label: label as LowCodeOption['label'],
    value: value as LowCodeOption['value']
  };

  if (Array.isArray(option[childrenKey])) {
    normalized.children = (option[childrenKey] as unknown[]).map((child) =>
      normalizeOption(child, field)
    );
  }

  return normalized;
}

function resolveOptions(field: LowCodeField) {
  if (field.optionsSourceKey) {
    const source = props.optionSources?.[field.optionsSourceKey];

    if (Array.isArray(source)) {
      return source.map((option) => normalizeOption(option, field));
    }
  }

  return field.options ?? [];
}

function checkRule(value: unknown, rule: LowCodeRule) {
  if (
    rule.required &&
    (value === undefined || value === null || String(value).trim() === '')
  ) {
    return rule.message;
  }

  if (rule.min && String(value ?? '').length < rule.min) {
    return rule.message;
  }

  return '';
}

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key]);

  for (const field of props.schema.fields) {
    for (const rule of field.rules ?? []) {
      const message = checkRule(formData[field.field], rule);

      if (message) {
        errors[field.field] = message;
        break;
      }
    }
  }

  return Object.keys(errors).length === 0;
}

function snapshot() {
  const value = { ...formData };
  emit('update:modelValue', value);
  return value;
}

function handleSubmit() {
  if (!validate()) return;
  emit('submit', snapshot());
}

function handleAction(action: LowCodeAction) {
  if (action.type === 'submit') {
    handleSubmit();
    return;
  }

  if (action.type === 'reset') {
    Object.keys(formData).forEach((key) => {
      delete formData[key];
    });
    Object.assign(formData, initialModel.value);
  }

  emit('action', action, snapshot());
}
</script>
