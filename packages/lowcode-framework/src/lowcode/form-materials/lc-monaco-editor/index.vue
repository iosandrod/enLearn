<template>
  <div
    class="lc-monaco-editor"
    :class="{ 'lc-monaco-editor--dialog-input': dialogMode }"
  >
    <vxe-input
      v-if="dialogMode"
      v-bind="inputProps"
      :id="field.field"
      :model-value="stringValue"
      :aria-label="field.label || field.field"
      :placeholder="String(field.props?.placeholder || '')"
      :clearable="!isReadonly && !isDisabled"
      :readonly="isReadonly"
      :disabled="isDisabled"
      @update:model-value="handleInputUpdate"
    >
      <template #suffix>
        <button
          type="button"
          class="lc-monaco-editor__trigger"
          :title="editorActionLabel"
          :aria-label="editorActionLabel"
          :disabled="isDisabled"
          @click.stop="openEditorDialog"
        >
          <i class="ri-code-s-slash-line" aria-hidden="true" />
        </button>
      </template>
    </vxe-input>

    <div v-else class="lc-monaco-editor__editor-shell">
      <div
        v-if="contextDrawerAvailable"
        class="lc-monaco-editor__toolbar"
      >
        <button
          type="button"
          class="lc-monaco-editor__context-trigger"
          :class="{ 'is-active': contextDrawerOpen }"
          :title="contextDrawerActionLabel"
          :aria-label="contextDrawerActionLabel"
          :aria-pressed="contextDrawerOpen"
          @click="toggleContextDrawer"
        >
          <i
            :class="contextDrawerOpen
              ? 'ri-layout-right-fill'
              : 'ri-layout-right-line'"
            aria-hidden="true"
          />
        </button>
      </div>
      <div
        ref="editorContainerRef"
        class="lc-monaco-editor__surface"
        :style="editorStyle"
        :aria-label="field.label || field.field"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import { openGlobalDialog } from '../../../runtime/global-dialog-core';
import type { GlobalDrawerHandle } from '../../../runtime/global-drawer-core';
import { openLowCodeContextDrawer } from '../../../runtime/lowcode-context-drawer';
import type { LowCodeContextSource } from '../../../runtime/lowcode-context';
import { lowCodeScriptContextProviderKey } from '../../../runtime/script-context-provider';
import {
  BUTTON_SCRIPT_LANGUAGE_ID,
  createButtonScriptMonacoModel,
  getButtonScriptModelValue,
  registerButtonScriptMonacoTypes,
  setButtonScriptModelValue,
} from '../../../visual-editor/components/button-group-designer/button-script-monaco';
import { Monaco } from '../../../visual-editor/components/common/monaco-editor/monaco';
import type { LowCodeField, LowCodeFormSchema } from '../../../types/lowcode';
import type { LowCodeFormMaterialProps } from '../types';

const props = defineProps<LowCodeFormMaterialProps>();
const scriptContextProvider = inject(lowCodeScriptContextProviderKey, null);
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const editorContainerRef = ref<HTMLElement>();
const editorOpen = ref(false);
const contextDrawerOpen = ref(false);
let editorInstance: Monaco.editor.IStandaloneCodeEditor | null = null;
let changeSubscription: Monaco.IDisposable | null = null;
let editorModel: Monaco.editor.ITextModel | null = null;
let syncingExternalValue = false;
let contextDrawerHandle: GlobalDrawerHandle | null = null;

const SCRIPT_DIALOG_VIEWPORT_MARGIN = 16;
const SCRIPT_DIALOG_DRAWER_GAP = 12;
const DEFAULT_SCRIPT_DIALOG_WIDTH = 980;
const DEFAULT_CONTEXT_DRAWER_WIDTH = 460;

const fieldProps = computed(() => props.field.props ?? {});
const dialogMode = computed(() => fieldProps.value.dialog === true);
const isDisabled = computed(() => Boolean(fieldProps.value.disabled));
const isReadonly = computed(() => Boolean(fieldProps.value.readonly));
const stringValue = computed(() => toCodeString(props.modelValue));
const language = computed(() => readString(fieldProps.value.language, 'javascript'));
const buttonScriptMode = computed(
  () => fieldProps.value.scriptThisType === 'LowCodeButtonScriptThis',
);
const contextDrawerAvailable = computed(
  () => buttonScriptMode.value && fieldProps.value.contextDrawer === true,
);
const editorActionLabel = computed(() =>
  isReadonly.value ? '查看代码' : '编辑代码',
);
const contextDrawerActionLabel = computed(() =>
  contextDrawerOpen.value ? '关闭页面上下文' : '打开页面上下文',
);
const editorStyle = computed(() => ({
  height: readDimension(fieldProps.value.height, '320px'),
  minHeight: readDimension(fieldProps.value.minHeight, '180px'),
  maxHeight: readDimension(fieldProps.value.maxHeight),
}));
const inputProps = computed(() => {
  const result = { ...fieldProps.value };
  [
    'dialog',
    'dialogTitle',
    'dialogWidth',
    'dialogHeight',
    'editorHeight',
    'height',
    'minHeight',
    'maxHeight',
    'language',
    'scriptThisType',
    'contextDrawer',
    'contextDrawerTitle',
    'contextDrawerWidth',
    'contextSource',
    'theme',
    'editorOptions',
    'disabled',
    'readonly',
  ].forEach((key) => delete result[key]);
  return result;
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function readDimension(value: unknown, fallback?: string) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

function readViewportDimension(
  value: unknown,
  viewportWidth: number,
  fallback: number,
) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return fallback;

  const source = value.trim();
  const pixelMatch = source.match(/(?:^|\()\s*(\d+(?:\.\d+)?)px/);
  if (pixelMatch) return Number(pixelMatch[1]);

  const viewportMatch = source.match(/^(\d+(?:\.\d+)?)vw$/);
  if (viewportMatch) return viewportWidth * Number(viewportMatch[1]) / 100;

  const viewportOffsetMatch = source.match(
    /calc\(\s*100vw\s*-\s*(\d+(?:\.\d+)?)px\s*\)/,
  );
  if (viewportOffsetMatch) {
    return viewportWidth - Number(viewportOffsetMatch[1]);
  }

  return fallback;
}

function resolveEditorDialogLayout() {
  const fallbackWidth =
    readDimension(fieldProps.value.dialogWidth) ||
    'min(980px, calc(100vw - 32px))';
  const baseProps: Record<string, unknown> = {
    top: '4vh',
    destroyOnClose: true,
  };

  if (!contextDrawerAvailable.value || typeof window === 'undefined') {
    return { width: fallbackWidth, props: baseProps };
  }

  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const requestedDialogWidth = Math.min(
    readViewportDimension(
      fieldProps.value.dialogWidth,
      viewportWidth,
      DEFAULT_SCRIPT_DIALOG_WIDTH,
    ),
    viewportWidth - SCRIPT_DIALOG_VIEWPORT_MARGIN * 2,
  );
  const drawerWidth = Math.min(
    readViewportDimension(
      fieldProps.value.contextDrawerWidth,
      viewportWidth,
      DEFAULT_CONTEXT_DRAWER_WIDTH,
    ),
    viewportWidth - 24,
  );
  const availableRight = viewportWidth - drawerWidth - SCRIPT_DIALOG_DRAWER_GAP;
  const availableWidth = Math.max(
    0,
    availableRight - SCRIPT_DIALOG_VIEWPORT_MARGIN,
  );

  // On narrow screens the drawer necessarily overlays the dialog. Keep the
  // dialog usable there; desktop layouts reserve the drawer's full width.
  if (availableWidth < 420) {
    return {
      width: fallbackWidth,
      props: {
        ...baseProps,
        position: {
          top: '4vh',
          left: SCRIPT_DIALOG_VIEWPORT_MARGIN,
        },
      },
    };
  }

  const dialogWidth = Math.min(requestedDialogWidth, availableWidth);
  const left = SCRIPT_DIALOG_VIEWPORT_MARGIN +
    Math.max(0, (availableWidth - dialogWidth) / 2);

  return {
    width: dialogWidth,
    props: {
      ...baseProps,
      position: {
        top: '4vh',
        left: Math.round(left),
      },
    },
  };
}

function toCodeString(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'undefined') return '';
  return String(value);
}

function handleInputUpdate(value: string | number | null) {
  emit('update:modelValue', value == null ? '' : String(value));
}

function resolveEditorOptions(): Monaco.editor.IStandaloneEditorConstructionOptions {
  const configured = isRecord(fieldProps.value.editorOptions)
    ? fieldProps.value.editorOptions
    : {};

  return {
    automaticLayout: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    fontFamily: 'Consolas, "SFMono-Regular", "Liberation Mono", monospace',
    fontSize: 13,
    lineHeight: 20,
    tabSize: 2,
    insertSpaces: true,
    formatOnPaste: true,
    overviewRulerBorder: false,
    ...configured,
    value: stringValue.value,
    language: language.value,
    theme: readString(fieldProps.value.theme, 'vs'),
    readOnly: isReadonly.value || isDisabled.value,
    ariaLabel: props.field.label || props.field.field,
  };
}

function createEditor() {
  if (dialogMode.value || !editorContainerRef.value || editorInstance) return;

  if (buttonScriptMode.value) {
    registerButtonScriptMonacoTypes();
    editorModel = createButtonScriptMonacoModel(
      stringValue.value,
    );
  } else {
    editorModel = Monaco.editor.createModel(
      stringValue.value,
      language.value,
    );
  }
  const {
    value: _value,
    language: _language,
    model: _model,
    ...editorOptions
  } = resolveEditorOptions();
  editorInstance = Monaco.editor.create(
    editorContainerRef.value,
    {
      ...editorOptions,
      model: editorModel,
    },
  );
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const scope = window as typeof window & {
      __lcMonacoEditors?: Monaco.editor.IStandaloneCodeEditor[];
    };
    scope.__lcMonacoEditors ??= [];
    scope.__lcMonacoEditors.push(editorInstance);
  }
  openContextDrawer();
  changeSubscription = editorInstance.onDidChangeModelContent(() => {
    if (!editorInstance || syncingExternalValue) return;
    const model = editorInstance.getModel();
    emit(
      'update:modelValue',
      buttonScriptMode.value && model
        ? getButtonScriptModelValue(model)
        : editorInstance.getValue(),
    );
  });
}

function disposeEditor() {
  void closeContextDrawer('editor-dispose');
  changeSubscription?.dispose();
  changeSubscription = null;
  if (editorInstance && import.meta.env.DEV && typeof window !== 'undefined') {
    const scope = window as typeof window & {
      __lcMonacoEditors?: Monaco.editor.IStandaloneCodeEditor[];
    };
    const index = scope.__lcMonacoEditors?.indexOf(editorInstance) ?? -1;
    if (index >= 0) scope.__lcMonacoEditors?.splice(index, 1);
  }
  editorInstance?.dispose();
  editorInstance = null;
  editorModel?.dispose();
  editorModel = null;
}

function createDialogEditorField(): LowCodeField {
  const source = { ...fieldProps.value };
  [
    'dialogTitle',
    'dialogWidth',
    'dialogHeight',
    'editorHeight',
    'placeholder',
    'clearable',
  ].forEach((key) => delete source[key]);

  return {
    field: 'code',
    label: props.field.label || '代码',
    component: 'lc-monaco-editor',
    showTitle: false,
    span: 24,
    props: {
      ...source,
      dialog: false,
      height:
        fieldProps.value.editorHeight ||
        'min(500px, calc(100vh - 250px))',
    },
  };
}

function readContextSource() {
  if (isRecord(fieldProps.value.contextSource)) {
    return fieldProps.value.contextSource as LowCodeContextSource;
  }
  return scriptContextProvider?.getSource();
}

function insertTextAtCursor(text: string) {
  if (!editorInstance || isReadonly.value || isDisabled.value) return;
  const selection = editorInstance.getSelection();
  const model = editorInstance.getModel();
  if (!selection || !model) return;
  const startOffset = model.getOffsetAt(selection.getStartPosition());
  editorInstance.pushUndoStop();
  editorInstance.executeEdits('lowcode-context-drawer', [
    {
      range: selection,
      text,
      forceMoveMarkers: true,
    },
  ]);
  const endPosition = model.getPositionAt(startOffset + text.length);
  editorInstance.setSelection(new Monaco.Selection(
    endPosition.lineNumber,
    endPosition.column,
    endPosition.lineNumber,
    endPosition.column,
  ));
  editorInstance.pushUndoStop();
  editorInstance.focus();
}

function closeContextDrawer(action = 'close') {
  const handle = contextDrawerHandle;
  if (!handle) return Promise.resolve();
  contextDrawerHandle = null;
  contextDrawerOpen.value = false;
  return handle.close(action);
}

function openContextDrawer() {
  if (!contextDrawerAvailable.value || contextDrawerHandle) return;
  const handle = openLowCodeContextDrawer({
    title: readString(fieldProps.value.contextDrawerTitle, '当前页面上下文'),
    width: fieldProps.value.contextDrawerWidth as string | number | undefined,
    source: readContextSource(),
    onInsert: isReadonly.value || isDisabled.value
      ? undefined
      : (insertText) => insertTextAtCursor(insertText),
  });
  contextDrawerHandle = handle;
  contextDrawerOpen.value = true;
  void handle.closed.finally(() => {
    if (contextDrawerHandle?.id !== handle.id) return;
    contextDrawerHandle = null;
    contextDrawerOpen.value = false;
  });
}

function toggleContextDrawer() {
  if (contextDrawerHandle) {
    void closeContextDrawer('toggle');
    return;
  }
  openContextDrawer();
}

async function openEditorDialog() {
  if (isDisabled.value || editorOpen.value) return;
  editorOpen.value = true;
  const dialogLayout = resolveEditorDialogLayout();

  const schema: LowCodeFormSchema = {
    columns: 1,
    fields: [createDialogEditorField()],
    actions: [],
  };

  try {
    const result = await openGlobalDialog<{ code: string }>({
      title:
        readString(fieldProps.value.dialogTitle) ||
        `${editorActionLabel.value} - ${props.field.label || props.field.field}`,
      width: dialogLayout.width,
      height:
        readDimension(fieldProps.value.dialogHeight) ||
        'min(680px, calc(100vh - 64px))',
      className: 'lc-monaco-editor-dialog',
      props: dialogLayout.props,
      model: { code: stringValue.value },
      form: {
        schema,
        props: {
          vertical: true,
          span: 24,
          padding: false,
        },
      },
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
    });

    if (result.action === 'confirm') {
      emit('update:modelValue', toCodeString(result.values.code));
    }
  } finally {
    void closeContextDrawer('editor-dialog-close');
    editorOpen.value = false;
  }
}

watch(
  () => props.modelValue,
  (value) => {
    if (!editorInstance) return;
    const nextValue = toCodeString(value);
    const model = editorInstance.getModel();
    if (!model) return;
    const currentValue = buttonScriptMode.value
      ? getButtonScriptModelValue(model)
      : editorInstance.getValue();
    if (currentValue === nextValue) return;

    syncingExternalValue = true;
    if (buttonScriptMode.value) {
      setButtonScriptModelValue(model, nextValue);
    } else {
      editorInstance.setValue(nextValue);
    }
    syncingExternalValue = false;
  },
);

watch(language, (nextLanguage) => {
  const model = editorInstance?.getModel();
  if (model) {
    Monaco.editor.setModelLanguage(
      model,
      buttonScriptMode.value ? BUTTON_SCRIPT_LANGUAGE_ID : nextLanguage,
    );
  }
});


watch([isReadonly, isDisabled], () => {
  editorInstance?.updateOptions({
    readOnly: isReadonly.value || isDisabled.value,
  });
});

watch(dialogMode, async (useDialog) => {
  if (useDialog) {
    disposeEditor();
    return;
  }

  await nextTick();
  createEditor();
});

onMounted(createEditor);
onBeforeUnmount(disposeEditor);
</script>

<style>
.lc-monaco-editor {
  width: 100%;
  min-width: 0;
}

.lc-monaco-editor--dialog-input > .vxe-input {
  width: 100%;
  max-width: 100%;
}

.lc-monaco-editor__surface {
  width: 100%;
  min-width: 0;
  overflow: hidden;
  border: 1px solid #d8dee8;
  border-radius: 4px;
  background: #fff;
}

.lc-monaco-editor__editor-shell {
  position: relative;
  width: 100%;
  min-width: 0;
}

.lc-monaco-editor__toolbar {
  position: absolute;
  z-index: 4;
  top: 7px;
  right: 20px;
  display: flex;
  pointer-events: none;
}

.lc-monaco-editor__context-trigger {
  display: inline-grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 1px solid #d7dee8;
  border-radius: 4px;
  color: #536579;
  background: rgb(255 255 255 / 94%);
  box-shadow: 0 1px 3px rgb(15 23 42 / 10%);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  pointer-events: auto;
}

.lc-monaco-editor__context-trigger:hover,
.lc-monaco-editor__context-trigger:focus-visible,
.lc-monaco-editor__context-trigger.is-active {
  border-color: #0f9d71;
  color: #087f5b;
  background: #eefaf5;
  outline: none;
}

.lc-monaco-editor__context-trigger:focus-visible {
  box-shadow: 0 0 0 2px rgb(15 157 113 / 18%);
}

.lc-monaco-editor__surface:focus-within {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgb(59 130 246 / 12%);
}

.lc-monaco-editor__trigger {
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

.lc-monaco-editor__trigger:hover:not(:disabled),
.lc-monaco-editor__trigger:focus-visible {
  color: #1677d2;
  background: #edf5ff;
  outline: none;
}

.lc-monaco-editor__trigger:focus-visible {
  box-shadow: 0 0 0 2px rgb(22 119 210 / 20%);
}

.lc-monaco-editor__trigger:disabled {
  color: #a8b2bf;
  cursor: not-allowed;
}

.lc-monaco-editor .vxe-input--suffix {
  display: inline-flex;
  align-items: center;
}

.lc-monaco-editor-dialog .lc-global-dialog__body,
.lc-monaco-editor-dialog .lc-form,
.lc-monaco-editor-dialog .lc-form > .vxe-form--wrapper,
.lc-monaco-editor-dialog .lc-form-grid,
.lc-monaco-editor-dialog .lc-form-grid-cell,
.lc-monaco-editor-dialog .vxe-form--item,
.lc-monaco-editor-dialog .vxe-form--item-inner,
.lc-monaco-editor-dialog .vxe-form--item-content,
.lc-monaco-editor-dialog .lc-form-item__content,
.lc-monaco-editor-dialog .lc-field {
  min-height: 0;
}
</style>
