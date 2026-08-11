<template>
  <article class="content-panel">
    <LowCodeForm
      :key="block.formDesignerUpdatedAt ?? 0"
      ref="formRef"
      :model-value="formModel"
      :schema="block.schema"
      :option-sources="resolvedData"
      :loading="isLoading"
      :mode="formMode"
      :field-validator="validateFieldScript"
      :label-context-menu="Boolean(runtimeBlockEditor)"
      @update:model-value="updateFormModel"
      @submit="handleSubmit"
      @action="handleAction"
      @field-change="handleFieldChange"
      @relate-select="handleRelateSelect"
      @label-context-menu="openFormContextMenu"
    />
  </article>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import type { LowCodeAction, LowCodeField, LowCodePageFormBlock } from '../../../types/lowcode';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import {
  openRuntimeFormContextMenu,
  openRuntimeFormDesigner,
} from '../runtime-form-designer';
import { openRuntimeFormFieldEditor } from '../runtime-form-field-editor';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageFormBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtimeBlockEditor = inject(lowCodeRuntimeBlockEditorKey, null);
const pageRuntime = useLowCodePageRuntime(false);
const formRef = ref<InstanceType<typeof LowCodeForm>>();
let unregisterFormController: (() => void) | undefined;
const hasOwnedFormModel = computed(() =>
  Object.prototype.hasOwnProperty.call(props.formModels, props.block.id)
);
const resolvedData = computed(
  () => pageRuntime?.state.sources ?? props.resolvedData
);
const formModel = computed(
  () => hasOwnedFormModel.value
    ? props.formModels[props.block.id]
    : pageRuntime?.state.forms[props.block.id] ?? {}
);
const isLoading = computed(
  () => (pageRuntime?.state.status.loadingBlockId ?? props.loadingBlockId) === props.block.id
);
const formMode = computed(() =>
  runtimeBlockEditor?.getPageRecord?.().page_type === 'edit'
    ? pageRuntime?.state.status.formMode
    : undefined
);

onMounted(() => {
  if (!pageRuntime || !formRef.value) return;
  unregisterFormController = pageRuntime.registerFormController(props.block.id, {
    validate: () => formRef.value?.validate() ?? Promise.resolve(false),
    clearValidation: () => formRef.value?.clearValidation(),
    setValues: (values) => formRef.value?.setValues(values),
  });
});

onBeforeUnmount(() => unregisterFormController?.());

function updateFormModel(values: Record<string, unknown>) {
  if (hasOwnedFormModel.value || !pageRuntime) {
    props.formModels[props.block.id] = values;
    return;
  }

  if (pageRuntime) {
    pageRuntime.replaceForm(props.block.id, values);
  }
}

function openFormContextMenu(event: MouseEvent, field: LowCodeField) {
  if (!runtimeBlockEditor) return;
  openRuntimeFormContextMenu(event, {
    onDesignForm: () => {
      void openRuntimeFormDesigner(props.block, 'edit', runtimeBlockEditor);
    },
    onDesignField: () => {
      void openRuntimeFormFieldEditor(props.block, field, runtimeBlockEditor);
    },
  });
}

function emitRuntimeEvent(name: string, payload: Record<string, unknown>) {
  emit('runtimeEvent', {
    name,
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload,
  });
}

function handleSubmit(values: Record<string, unknown>) {
  const action = props.block.schema.actions.find(
    (item) => item.type === 'submit' || item.code === 'submit'
  );
  emitRuntimeEvent(action?.eventName ?? 'form.submit', {
    action,
    actionCode: action?.code ?? 'submit',
    script: action?.script ?? '',
    values,
    directives: action?.directives ?? [],
  });
  emit('formSubmit', { block: props.block, values, action });
}

function handleAction(action: LowCodeAction, values: Record<string, unknown>) {
  emitRuntimeEvent(action.eventName ?? 'form.action', {
    action,
    actionCode: action.code,
    script: action.script ?? '',
    values,
    directives: action.directives ?? [],
  });
  emit('formAction', { block: props.block, action, values });
}

function handleFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
  values: Record<string, unknown>;
}) {
  emitRuntimeEvent('form.fieldChange', {
    ...payload,
    field: payload.field.field,
    fieldConfig: payload.field,
    directives: payload.field.events?.change ?? payload.field.events?.onChange ?? [],
    script: payload.field.updateScript ?? '',
  });
}

function handleRelateSelect(payload: {
  field: LowCodeField;
  row: Record<string, unknown>;
  values: Record<string, unknown>;
  formValues: Record<string, unknown>;
}) {
  emitRuntimeEvent('form.relateSelect', {
    ...payload,
    field: payload.field.field,
    fieldConfig: payload.field,
  });
}

async function validateFieldScript(
  field: LowCodeField,
  value: unknown,
  values: Record<string, unknown>,
) {
  if (!field.validationScript || !runtimeBlockEditor?.executeFieldScript) return true;
  try {
    const result = await runtimeBlockEditor.executeFieldScript(field.validationScript, {
      name: 'form.fieldValidate',
      blockId: props.block.id,
      blockKind: props.block.kind,
      timestamp: Date.now(),
      payload: { field: field.field, value, values },
    });
    if (result === true || result === null || typeof result === 'undefined') return true;
    if (typeof result === 'string' && result.trim()) return result.trim();
    if (result === false) return field.validationMessage || `${field.label}校验不通过`;
    if (result && typeof result === 'object' && 'message' in result) {
      const message = String((result as Record<string, unknown>).message ?? '').trim();
      return message || field.validationMessage || `${field.label}校验不通过`;
    }
    return field.validationMessage || `${field.label}校验不通过`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
</script>
