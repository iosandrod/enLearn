<template>
  <article class="content-panel">
    <LowCodeForm
      :key="block.formDesignerUpdatedAt ?? 0"
      ref="formRef"
      :model-value="formModel"
      :schema="block.schema"
      :option-sources="resolvedData"
      :loading="isLoading"
      :label-context-menu="Boolean(runtimeBlockEditor)"
      @update:model-value="updateFormModel"
      @submit="handleSubmit"
      @action="handleAction"
      @field-change="handleFieldChange"
      @label-context-menu="openFormContextMenu"
    />
  </article>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import type { LowCodeAction, LowCodeField, LowCodePageSearchFormBlock } from '../../../types/lowcode';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import {
  openRuntimeFormContextMenu,
  openRuntimeFormDesigner,
} from '../runtime-form-designer';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageSearchFormBlock>>();
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

onMounted(() => {
  if (!pageRuntime || !formRef.value) return;
  unregisterFormController = pageRuntime.registerFormController(props.block.id, {
    validate: () => formRef.value?.validate() ?? Promise.resolve(false),
    clearValidation: () => formRef.value?.clearValidation(),
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

function openFormContextMenu(event: MouseEvent) {
  if (!runtimeBlockEditor) return;
  openRuntimeFormContextMenu(event, () => {
    void openRuntimeFormDesigner(props.block, 'search', runtimeBlockEditor);
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
  emitRuntimeEvent(action?.eventName ?? 'searchForm.submit', {
    action,
    actionCode: action?.code ?? 'submit',
    script: action?.script ?? '',
    values,
    directives: action?.directives ?? [],
  });
  emit('searchSubmit', { block: props.block, values, action });
}

function handleAction(action: LowCodeAction, values: Record<string, unknown>) {
  emitRuntimeEvent(action.eventName ?? 'searchForm.action', {
    action,
    actionCode: action.code,
    script: action.script ?? '',
    values,
    directives: action.directives ?? [],
  });
  emit('searchAction', { block: props.block, action, values });
}

function handleFieldChange(payload: {
  field: LowCodeField;
  value: unknown;
  previousValue: unknown;
  values: Record<string, unknown>;
}) {
  emitRuntimeEvent('searchForm.fieldChange', {
    ...payload,
    field: payload.field.field,
    fieldConfig: payload.field,
    directives: payload.field.events?.change ?? payload.field.events?.onChange ?? [],
  });
}
</script>
