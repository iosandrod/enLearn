<template>
  <article class="content-panel">
    <LowCodeForm
      v-model="formModels[block.id]"
      :schema="block.schema"
      :option-sources="resolvedData"
      :loading="loadingBlockId === block.id"
      @submit="handleSubmit"
      @action="handleAction"
      @field-change="handleFieldChange"
    />
  </article>
</template>

<script setup lang="ts">
import LowCodeForm from '../../../components/LowCodeForm.vue';
import type { LowCodeAction, LowCodeField, LowCodePageSearchFormBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageSearchFormBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();

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
    values,
    directives: action?.directives ?? [],
  });
  emit('searchSubmit', { block: props.block, values });
}

function handleAction(action: LowCodeAction, values: Record<string, unknown>) {
  emitRuntimeEvent(action.eventName ?? 'searchForm.action', {
    action,
    actionCode: action.code,
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
