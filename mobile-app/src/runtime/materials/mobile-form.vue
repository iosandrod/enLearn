<template>
  <div class="mobile-form-block">
    <div v-if="block.title || block.description" class="form-header">
      <span v-if="block.title" class="form-title">{{ block.title }}</span>
      <span v-if="block.description" class="form-description">{{ block.description }}</span>
    </div>

    <div v-for="field in schema.fields" :key="field.field" class="form-field">
      <span class="field-label">{{ field.label }}</span>

      <button
        v-if="isBooleanField(field.component)"
        :class="['boolean-control', { 'is-active': Boolean(model[field.field]) }]"
        @click="toggleBoolean(field)"
      >
        <span class="boolean-control-text">{{ model[field.field] ? '已开启' : '已关闭' }}</span>
      </button>

      <input
        v-else
        class="field-input"
        :type="inputType(field.component)"
        :value="String(model[field.field] ?? '')"
        :placeholder="String(field.props?.placeholder ?? '')"
        :multiline="isMultiline(field.component)"
        @change="updateField(field, readInputValue($event))"
      />

      <span v-if="errors[field.field]" class="field-error">{{ errors[field.field] }}</span>
      <span v-else-if="field.help" class="field-help">{{ field.help }}</span>
    </div>

    <div v-if="schema.actions.length" class="form-actions">
      <button
        v-for="action in schema.actions"
        :key="action.code"
        :class="['form-action', `is-${action.status ?? 'default'}`]"
        @click="handleAction(action)"
      >
        <span class="form-action-text">{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from '@vue/runtime-core';

import type {
  MobileMaterialEmits,
  MobileMaterialProps,
  SharedLowCodeAction,
  SharedLowCodeField,
  SharedLowCodeFormSchema,
} from '../types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
const errors = reactive<Record<string, string>>({});

const schema = computed<SharedLowCodeFormSchema>(() => props.block.schema ?? {
  fields: [],
  actions: [],
});
const model = computed(() => {
  if (!props.formModels[props.block.id]) {
    props.formModels[props.block.id] = { ...(props.block.initialValues ?? {}) };
  }
  return props.formModels[props.block.id];
});

function isMultiline(component: string) {
  return component === 'vxe-textarea';
}

function isBooleanField(component: string) {
  return component === 'vxe-switch';
}

function inputType(component: string) {
  if (component === 'vxe-password-input') return 'password';
  if (component === 'lc-number-input') return 'number';
  return 'text';
}

function readInputValue(event: unknown) {
  if (event && typeof event === 'object' && 'value' in event) {
    return (event as { value?: unknown }).value;
  }

  return '';
}

function publishFieldChange(field: SharedLowCodeField, value: unknown, previousValue: unknown) {
  emit('runtimeEvent', {
    name: 'form.fieldChange',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      values: { ...model.value },
      value,
      previousValue,
      field: field.field,
      directives: field.events?.change ?? field.events?.onChange ?? [],
    },
  });
}

function updateField(field: SharedLowCodeField, value: unknown) {
  const previousValue = model.value[field.field];
  model.value[field.field] = value;
  delete errors[field.field];
  publishFieldChange(field, value, previousValue);
}

function toggleBoolean(field: SharedLowCodeField) {
  updateField(field, !Boolean(model.value[field.field]));
}

function validate() {
  Object.keys(errors).forEach((key) => delete errors[key]);

  schema.value.fields.forEach((field) => {
    const value = model.value[field.field];
    const required = field.rules?.find((rule) => rule.required);
    if (required && (value === undefined || value === null || String(value).trim() === '')) {
      errors[field.field] = required.message;
    }
  });

  return Object.keys(errors).length === 0;
}

function handleAction(action: SharedLowCodeAction) {
  if ((action.type === 'submit' || action.code === 'submit') && !validate()) return;

  if (action.type === 'reset' || action.code === 'reset') {
    Object.keys(model.value).forEach((key) => delete model.value[key]);
    Object.assign(model.value, props.block.initialValues ?? {});
  }

  emit('runtimeEvent', {
    name: action.eventName ?? (action.type === 'submit' ? 'form.submit' : 'form.action'),
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      action,
      actionCode: action.code,
      directives: action.directives ?? (action.route ? [{ type: 'navigate', route: action.route }] : []),
      values: { ...model.value },
    },
  });
}

watch(
  () => props.block.id,
  () => {
    props.formModels[props.block.id] = { ...(props.block.initialValues ?? {}) };
  }
);
</script>

<style scoped>
.mobile-form-block {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.form-header {
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
}

.form-title {
  color: #17212b;
  font-size: 16px;
  line-height: 24px;
  font-weight: bold;
}

.form-description {
  margin-top: 3px;
  color: #68737d;
  font-size: 12px;
  line-height: 18px;
}

.form-field {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
}

.field-label {
  margin-bottom: 6px;
  color: #35414c;
  font-size: 12px;
  line-height: 18px;
}

.field-input {
  min-height: 44px;
  padding-right: 11px;
  padding-left: 11px;
  color: #17212b;
  font-size: 14px;
  background-color: #f8f9fa;
  border-width: 1px;
  border-style: solid;
  border-color: #ccd3d8;
  border-radius: 5px;
}

.boolean-control {
  width: 92px;
  height: 38px;
  align-items: center;
  justify-content: center;
  background-color: #e3e7ea;
  border-radius: 19px;
}

.boolean-control.is-active {
  background-color: #0b7957;
}

.boolean-control-text {
  color: #35414c;
  font-size: 12px;
}

.boolean-control.is-active .boolean-control-text {
  color: #ffffff;
}

.field-help,
.field-error {
  margin-top: 4px;
  font-size: 11px;
  line-height: 16px;
}

.field-help {
  color: #7a858f;
}

.field-error {
  color: #b63b36;
}

.form-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
}

.form-action {
  min-height: 42px;
  margin-left: 8px;
  padding-right: 16px;
  padding-left: 16px;
  align-items: center;
  justify-content: center;
  background-color: #eef1f3;
  border-radius: 5px;
}

.form-action.is-primary {
  background-color: #1e67d6;
}

.form-action.is-success {
  background-color: #0b7957;
}

.form-action.is-danger {
  background-color: #b63b36;
}

.form-action-text {
  color: #17212b;
  font-size: 13px;
}

.form-action.is-primary .form-action-text,
.form-action.is-success .form-action-text,
.form-action.is-danger .form-action-text {
  color: #ffffff;
}
</style>
