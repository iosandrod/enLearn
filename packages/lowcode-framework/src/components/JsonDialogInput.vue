<template>
  <component
    :is="jsonEditorComponent"
    class="json-dialog-input"
    :field="field"
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
  />
  <GlobalDialogHost v-if="standalone" />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import GlobalDialogHost from './GlobalDialogHost';
import {
  getLowCodeFormMaterial,
  lowCodeFormMaterialRevision,
} from '../lowcode/form-materials';
import type { LowCodeField } from '../types/lowcode';

type JsonRootType = 'any' | 'object' | 'array';
type JsonValueMode = 'parsed' | 'string' | 'preserve';

const props = withDefaults(
  defineProps<{
    modelValue?: unknown;
    name?: string;
    label?: string;
    title?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    rows?: number;
    standalone?: boolean;
    rootType?: JsonRootType;
    valueMode?: JsonValueMode;
    inputProps?: Record<string, unknown>;
  }>(),
  {
    name: 'json',
    label: 'JSON',
    title: '',
    placeholder: '',
    disabled: false,
    readonly: false,
    rows: 14,
    standalone: false,
    rootType: 'any',
    valueMode: 'preserve',
    inputProps: () => ({}),
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();

const jsonEditorComponent = computed(() => {
  lowCodeFormMaterialRevision.value;
  return getLowCodeFormMaterial('lc-json-editor').component;
});

const field = computed<LowCodeField>(() => ({
  field: props.name,
  label: props.label,
  component: 'lc-json-editor',
  props: {
    ...props.inputProps,
    placeholder: props.placeholder,
    disabled: props.disabled,
    readonly: props.readonly,
    rows: props.rows,
    jsonRootType: props.rootType,
    jsonValueMode: props.valueMode,
    dialogTitle: props.title,
  },
}));
</script>
