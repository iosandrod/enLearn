<template>
  <div
    :class="[
      'mobile-form-block',
      {
        'is-plain': block.appearance === 'plain',
      },
    ]"
    :style="blockStyle"
    @layout="handleLayout"
  >
    <div v-if="block.title || block.description || schema.title" class="form-header">
      <span v-if="block.title || schema.title" class="form-title">
        {{ block.title || schema.title }}
      </span>
      <span v-if="block.description" class="form-description">{{ block.description }}</span>
    </div>

    <div v-if="layoutNodes.length" class="form-layout">
      <MobileFormLayout
        :nodes="layoutNodes"
        :fields-by-key="fieldsByKey"
        :model="model"
        :errors="errors"
        :option-sources="resolvedData"
        :disabled="formDisabled"
        :readonly="formReadonly"
        :edit-page-mode="editPageMode"
        :compact="effectiveColumns === 1"
        @field-update="updateField"
      />
    </div>

    <div v-else class="form-grid">
      <div
        v-for="(row, rowIndex) in formRows"
        :key="`row-${rowIndex}`"
        class="form-row"
      >
        <div
          v-for="cell in row.cells"
          :key="cell.field.field"
          class="form-cell"
          :style="cellStyle(cell.span)"
        >
          <MobileFormField
            :field="cell.field"
            :model-value="model[cell.field.field]"
            :option-sources="resolvedData"
            :error="errors[cell.field.field]"
            :disabled="isFieldDisabled(cell.field)"
            :readonly="formReadonly"
            @update:model-value="(value) => updateField(cell.field, value)"
          />
        </div>
      </div>
    </div>

    <div
      v-if="schema.actions.length"
      :class="[
        'form-actions',
        { 'is-stretch': block.actionLayout === 'stretch' },
      ]"
    >
      <button
        v-for="action in schema.actions"
        :key="action.code"
        :class="['form-action', `is-${action.status ?? 'default'}`]"
        :disabled="isActionDisabled(action)"
        @click="handleAction(action)"
      >
        <span class="form-action-text">{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from '@vue/runtime-core';
import type { CSSProperties } from 'vue';
import type { HippyLayoutEvent } from '@hippy/vue-next';

import MobileFormField from './mobile-form-field.vue';
import MobileFormLayout from './mobile-form-layout.vue';
import { resolveMobileBlockStyle } from '../block-style';
import {
  createLayoutWidthScheduler,
  getWebLayoutFrameDriver,
} from '../layout-width';
import {
  buildMobileFormRows,
  cloneFormValue,
  readFormBoolean,
  resolveResponsiveFormColumns,
  validateMobileFormValues,
} from '../mobile-form';
import type {
  MobileMaterialEmits,
  MobileMaterialProps,
  SharedLowCodeAction,
  SharedLowCodeField,
  SharedLowCodeFormSchema,
} from '../types';
import {
  isLowCodeEditPageActionDisabled,
  isLowCodeEditPageFieldDisabled,
  isLowCodeEditPageReadonly,
} from '../../../../packages/lowcode-framework/src/runtime/edit-page-mode';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

const errors = reactive<Record<string, string>>({});
const formWidth = ref(0);
const actionDispatching = new Set<string>();
const formWidthScheduler = createLayoutWidthScheduler(
  () => formWidth.value,
  (width) => {
    formWidth.value = width;
  },
  getWebLayoutFrameDriver(),
);

const schema = computed<SharedLowCodeFormSchema>(() => {
  const configured = props.block.schema ?? {};
  return {
    ...configured,
    fields: Array.isArray(configured.fields) ? configured.fields : [],
    actions: Array.isArray(configured.actions) ? configured.actions : [],
  };
});
const model = computed(() => {
  if (!props.formModels[props.block.id]) {
    props.formModels[props.block.id] = cloneFormValue(props.block.initialValues ?? {});
  }
  return props.formModels[props.block.id];
});
const fieldsByKey = computed(() => schema.value.fields.reduce<Record<string, SharedLowCodeField>>(
  (fields, field) => {
    fields[field.field] = field;
    return fields;
  },
  {},
));
const layoutNodes = computed(() => (
  Array.isArray(schema.value.layout) ? schema.value.layout : []
));
const effectiveColumns = computed(() => resolveResponsiveFormColumns(
  schema.value.columns,
  formWidth.value,
));
const formRows = computed(() => buildMobileFormRows(
  schema.value.fields,
  effectiveColumns.value,
));
const formDisabled = computed(() => readFormBoolean(
  props.block.disabled ?? props.block.schema?.disabled,
) || (
  props.block.kind === 'form' &&
  isLowCodeEditPageReadonly(props.editPageMode)
));
const formReadonly = computed(() => readFormBoolean(
  props.block.readonly ?? props.block.schema?.readonly,
));
const formInteractionBlocked = computed(() =>
  formDisabled.value ||
  formReadonly.value
);
const eventPrefix = computed(() => props.block.kind === 'searchForm' ? 'searchForm' : 'form');
const blockStyle = computed(() => resolveMobileBlockStyle(props.block.style));

function cellStyle(span: number): CSSProperties {
  const width = `${span / effectiveColumns.value * 100}%`;
  return {
    width,
    flexBasis: width,
  };
}

function isFieldDisabled(field: SharedLowCodeField) {
  return formDisabled.value
    || (
      props.block.kind === 'form' &&
      isLowCodeEditPageFieldDisabled(field, props.editPageMode)
    );
}

function handleLayout(event: HippyLayoutEvent) {
  formWidthScheduler.schedule(event.width);
}

function publishFieldChange(field: SharedLowCodeField, value: unknown, previousValue: unknown) {
  emit('runtimeEvent', {
    name: `${eventPrefix.value}.fieldChange`,
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      field: field.field,
      fieldConfig: field,
      value: cloneFormValue(value),
      previousValue: cloneFormValue(previousValue),
      values: cloneFormValue(model.value),
      directives: field.events?.change ?? field.events?.onChange ?? [],
    },
  });
}

function updateField(field: SharedLowCodeField, value: unknown) {
  if (
    formInteractionBlocked.value ||
    (
      props.block.kind === 'form' &&
      isLowCodeEditPageFieldDisabled(field, props.editPageMode)
    )
  ) return;
  const previousValue = cloneFormValue(model.value[field.field]);
  model.value[field.field] = cloneFormValue(value);
  delete errors[field.field];
  publishFieldChange(field, value, previousValue);
}

function validate() {
  if (formInteractionBlocked.value) return true;
  const nextErrors = validateMobileFormValues(schema.value, model.value);
  Object.keys(errors).forEach((key) => delete errors[key]);
  Object.assign(errors, nextErrors);
  return Object.keys(errors).length === 0;
}

function resetModel() {
  if (formInteractionBlocked.value) return;
  Object.keys(model.value).forEach((key) => delete model.value[key]);
  Object.assign(model.value, cloneFormValue(props.block.initialValues ?? {}));
  Object.keys(errors).forEach((key) => delete errors[key]);
}

function actionDirectives(action: SharedLowCodeAction) {
  return action.directives
    ?? (action.route ? [{ type: 'navigate', route: action.route }] : []);
}

function handleAction(action: SharedLowCodeAction) {
  if (isActionDisabled(action) || actionDispatching.has(action.code)) return;
  actionDispatching.add(action.code);

  try {
    const isSubmit = action.type === 'submit' || action.code === 'submit';
    const isReset = action.type === 'reset' || action.code === 'reset';
    if (isSubmit && !validate()) return;
    if (isReset) resetModel();

    const defaultEventName = isSubmit
      ? `${eventPrefix.value}.submit`
      : `${eventPrefix.value}.action`;

    emit('runtimeEvent', {
      name: action.eventName ?? defaultEventName,
      blockId: props.block.id,
      blockKind: props.block.kind,
      timestamp: Date.now(),
      payload: {
        action,
        actionCode: action.code,
        directives: actionDirectives(action),
        values: cloneFormValue(model.value),
      },
    });
  } finally {
    setTimeout(() => actionDispatching.delete(action.code), 0);
  }
}

function isActionDisabled(action: SharedLowCodeAction) {
  return props.block.kind === 'form'
    ? isLowCodeEditPageActionDisabled(action, props.editPageMode)
    : action.disabled === true;
}

watch(
  () => props.block.id,
  () => {
    props.formModels[props.block.id] = cloneFormValue(props.block.initialValues ?? {});
    Object.keys(errors).forEach((key) => delete errors[key]);
  },
);

onBeforeUnmount(formWidthScheduler.cancel);
</script>

<style scoped>
.mobile-form-block {
  width: 100%;
  min-width: 0;
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.mobile-form-block.is-plain {
  padding: 0;
  background-color: transparent;
  border-width: 0;
  border-radius: 0;
}

.form-header {
  margin-bottom: 9px;
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

.form-grid,
.form-layout {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.form-row {
  width: 100%;
  min-width: 0;
  margin-top: 14px;
  display: flex;
  flex-direction: row;
  align-items: flex-start;
}

.form-cell {
  min-width: 0;
  padding-right: 7px;
  padding-left: 7px;
}

.form-row > .form-cell:first-child {
  padding-left: 0;
}

.form-row > .form-cell:last-child {
  padding-right: 0;
}

.form-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.form-action {
  min-height: 46px;
  margin-top: 6px;
  margin-left: 8px;
  padding-right: 16px;
  padding-left: 16px;
  align-items: center;
  justify-content: center;
  background-color: #eef1f3;
  border-radius: 5px;
}

.form-actions.is-stretch {
  flex-direction: column;
  flex-wrap: nowrap;
}

.form-actions.is-stretch .form-action {
  width: 100%;
  margin-left: 0;
}

.form-action.is-primary {
  background-color: #176fa9;
}

.form-action.is-success {
  background-color: #0b7957;
}

.form-action.is-warning {
  background-color: #a66a00;
}

.form-action.is-danger {
  background-color: #b63b36;
}

.form-action.is-info {
  background-color: #496b82;
}

.form-action-text {
  color: #17212b;
  font-size: 13px;
  font-weight: bold;
}

.form-action.is-primary .form-action-text,
.form-action.is-success .form-action-text,
.form-action.is-warning .form-action-text,
.form-action.is-danger .form-action-text,
.form-action.is-info .form-action-text {
  color: #ffffff;
}
</style>
