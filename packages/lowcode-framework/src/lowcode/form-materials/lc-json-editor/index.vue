<template>
  <div class="lc-json-editor">
    <vxe-input
      v-bind="inputProps"
      :id="field.field"
      :model-value="previewValue"
      type="text"
      :editable="false"
      :clearable="false"
      :disabled="isDisabled"
    >
      <template #suffix>
        <button
          type="button"
          class="lc-json-editor__trigger"
          :title="editorActionLabel"
          :aria-label="editorActionLabel"
          :disabled="isDisabled"
          @click.stop="openEditor"
        >
          <i class="ri-braces-line" aria-hidden="true" />
        </button>
      </template>
    </vxe-input>
  </div>
</template>

<script setup lang="ts">
import { computed, h, ref } from 'vue';
import { VxeTextarea } from 'vxe-pc-ui';
import { openGlobalDialog } from '../../../runtime/global-dialog';
import type { LowCodeFormMaterialProps } from '../types';

type JsonParseResult =
  | { ok: true; value: unknown }
  | { ok: false; message: string };

const props = defineProps<LowCodeFormMaterialProps>();
const emit = defineEmits<{
  'update:modelValue': [value: unknown];
}>();

const editorText = ref('');
const editorError = ref('');
const editorOpen = ref(false);

const isDisabled = computed(() => Boolean(props.field.props?.disabled));
const isReadonly = computed(() => Boolean(props.field.props?.readonly));
const editorActionLabel = computed(() => (isReadonly.value ? '查看 JSON' : '编辑 JSON'));
const previewValue = computed(() => formatPreviewValue(props.modelValue));
const inputProps = computed(() => {
  const {
    rows: _rows,
    cols: _cols,
    resize: _resize,
    autoSize: _autoSize,
    autosize: _autosize,
    showWordCount: _showWordCount,
    countMethod: _countMethod,
    suffixIcon: _suffixIcon,
    suffixConfig: _suffixConfig,
    readonly: _readonly,
    disabled: _disabled,
    clearable: _clearable,
    editable: _editable,
    type: _type,
    ...rest
  } = props.field.props ?? {};

  return rest;
});

function formatEditorValue(value: unknown) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';

    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return value;
    }
  }

  if (value === undefined) return '';

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function formatPreviewValue(value: unknown) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return '';

    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return text.replace(/\s+/g, ' ');
    }
  }

  if (value === undefined) return '';

  try {
    return JSON.stringify(value);
  } catch {
    return String(value ?? '');
  }
}

function parseJsonText(text: string): JsonParseResult {
  const value = text.trim();
  if (!value) return { ok: true, value: undefined };

  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, message: 'JSON 格式不正确，请检查后重试' };
  }
}

function resolveEditorRows() {
  const rows = Number(props.field.props?.rows);
  if (!Number.isFinite(rows) || rows <= 0) return 14;
  return Math.min(24, Math.max(8, Math.round(rows)));
}

function renderEditor() {
  const fieldProps = props.field.props ?? {};
  const {
    className: fieldClassName,
    disabled: _disabled,
    readonly: _readonly,
    rows: _rows,
    ...textareaProps
  } = fieldProps;
  const className = [
    'lc-json-editor-dialog__textarea',
    typeof fieldClassName === 'string' ? fieldClassName : '',
  ].filter(Boolean).join(' ');

  return h('div', { class: 'lc-json-editor-dialog' }, [
    h(VxeTextarea as any, {
      ...textareaProps,
      className,
      modelValue: editorText.value,
      rows: resolveEditorRows(),
      readonly: isReadonly.value,
      disabled: isDisabled.value,
      'onUpdate:modelValue': (value: string | number | null) => {
        editorText.value = value == null ? '' : String(value);
        editorError.value = '';
      },
    }),
    editorError.value
      ? h('span', { class: 'lc-json-editor-dialog__error' }, editorError.value)
      : null,
  ]);
}

async function openEditor() {
  if (isDisabled.value || editorOpen.value) return;

  editorOpen.value = true;
  editorText.value = formatEditorValue(props.modelValue);
  editorError.value = '';

  try {
    const result = await openGlobalDialog({
      title: `${editorActionLabel.value} - ${props.field.label || props.field.field}`,
      width: 'min(760px, calc(100vw - 32px))',
      showFooter: true,
      props: {
        top: '8vh',
        destroyOnClose: true,
      },
      body: renderEditor,
      actions: isReadonly.value
        ? [
            {
              code: 'cancel',
              label: '关闭',
              role: 'cancel',
            },
          ]
        : [
            {
              code: 'cancel',
              label: '取消',
              role: 'cancel',
            },
            {
              code: 'confirm',
              label: '确定',
              role: 'confirm',
              status: 'primary',
            },
          ],
      onConfirm: () => {
        const parsed = parseJsonText(editorText.value);
        if ('message' in parsed) {
          editorError.value = parsed.message;
          return false;
        }

        return { payload: parsed.value };
      },
    });

    if (result.action !== 'confirm') return;

    const parsed = parseJsonText(editorText.value);
    if (parsed.ok) {
      emit('update:modelValue', parsed.value);
    }
  } finally {
    editorOpen.value = false;
  }
}
</script>

<style>
.lc-json-editor {
  width: 100%;
  min-width: 0;
}

.lc-json-editor > .vxe-input {
  width: 100%;
  max-width: 100%;
}

.lc-json-editor__trigger {
  display: inline-grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 4px;
  color: #536579;
  background: transparent;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
}

.lc-json-editor__trigger:hover:not(:disabled),
.lc-json-editor__trigger:focus-visible {
  color: #1d73d8;
  background: #edf5ff;
  outline: none;
}

.lc-json-editor__trigger:focus-visible {
  box-shadow: 0 0 0 2px rgb(29 115 216 / 20%);
}

.lc-json-editor__trigger:disabled {
  color: #a8b2bf;
  cursor: not-allowed;
}

.lc-json-editor-dialog {
  display: grid;
  width: 100%;
  min-width: 0;
  gap: 8px;
}

.lc-json-editor-dialog .vxe-textarea {
  width: 100%;
}

.lc-json-editor-dialog .vxe-textarea--inner {
  min-height: min(420px, calc(100vh - 280px));
  font-family: Consolas, "SFMono-Regular", "Liberation Mono", monospace;
  line-height: 1.55;
  tab-size: 2;
}

.lc-json-editor-dialog__error {
  color: #c0362c;
  font-size: 12px;
  line-height: 18px;
}
</style>
