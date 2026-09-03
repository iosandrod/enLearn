<template>
  <section
    class="content-panel lc-node-toolbar"
    :aria-busy="isMesCommandExecuting"
  >
    <div>
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </div>
    <div class="lc-actions">
      <vxe-button
        v-for="action in runtimeActions"
        :key="action.code"
        :status="action.status"
        :disabled="isLowCodeButtonDisabled(action, pageRuntime, buttonDisabledOptions)"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import type { LowCodeAction, LowCodePageToolbarBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import {
  lowCodeEditPageModeScopeKey,
  useLowCodePageRuntime,
} from '../../../runtime/page-runtime';
import {
  isLowCodeButtonDisabled,
  isLowCodeEditPageSaveAction,
  normalizeLowCodeEditPageActionCode,
} from '../../../runtime/button-disabled';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageToolbarBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtimeBlockEditor = inject(lowCodeRuntimeBlockEditorKey, null);
const pageRuntime = useLowCodePageRuntime(false);
const editPageModeScope = inject(lowCodeEditPageModeScopeKey, false);
const editPageMode = computed(() =>
  editPageModeScope && runtimeBlockEditor?.getPageRecord?.().page_type === 'edit'
    ? pageRuntime?.state.status.formMode
    : undefined
);
const isMesCommandExecuting = computed(() =>
  pageRuntime?.state.status.mesCommandExecuting === true
);
const buttonDisabledOptions = computed(() => ({
  enabled: Boolean(editPageMode.value),
}));
const runtimeActions = computed<LowCodeAction[]>(() => {
  const actions = props.block.actions ?? [];
  if (
    !editPageMode.value ||
    !actions.some((action) => isSaveAction(action)) ||
    actions.some((action) => normalizeActionCode(action.code) === 'modify')
  ) return actions;

  const saveIndex = actions.findIndex((action) => isSaveAction(action));
  return [
    ...actions.slice(0, saveIndex),
    {
      code: 'modify',
      label: '修改',
      type: 'button',
    },
    ...actions.slice(saveIndex),
  ];
});

function normalizeActionCode(value: unknown) {
  return normalizeLowCodeEditPageActionCode(value);
}

function isSaveAction(action: LowCodeAction) {
  return isLowCodeEditPageSaveAction(action);
}

function reportButtonError(error: unknown) {
  runtimeBlockEditor?.reportRuntimeError?.(error);
  if (runtimeBlockEditor?.reportRuntimeError) return;
  const content = error instanceof Error ? error.message : String(error);
  const modal = (VxeUI as unknown as {
    modal?: { message?: (options: Record<string, unknown>) => unknown };
  }).modal;
  if (modal?.message) {
    void modal.message({ content, status: 'error' });
    return;
  }
  console.error(content);
}

async function handleAction(action: LowCodeAction) {
  if (isLowCodeButtonDisabled(action, pageRuntime, buttonDisabledOptions.value)) return;

  const script = typeof action.script === 'string' ? action.script.trim() : '';
  if (!script) {
    reportButtonError(new Error(`按钮“${action.label || action.code}”未配置脚本。`));
    return;
  }

  const event = {
    name: action.eventName ?? 'toolbar.click',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      action,
      actionCode: action.code,
      script: action.script ?? '',
      directives: action.directives ?? [],
    },
  } as const;

  if (runtimeBlockEditor?.executeButtonScript) {
    try {
      const result = await runtimeBlockEditor.executeButtonScript(script, event);
      if (result === false) return;
    } catch (error) {
      reportButtonError(error);
      return;
    }

    // The script has already run; the marker lets the event bus process directives without rerunning it.
    emit('runtimeEvent', {
      ...event,
      payload: { ...event.payload, scriptExecuted: true },
    });
    emit('toolbarAction', { block: props.block, action });
    return;
  }

  emit('runtimeEvent', event);
  emit('toolbarAction', { block: props.block, action });
}
</script>
