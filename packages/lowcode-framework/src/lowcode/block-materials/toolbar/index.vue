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
        :disabled="isActionDisabled(action)"
        @click="handleAction(action)"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import type { LowCodeAction, LowCodePageToolbarBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import {
  lowCodeEditPageModeScopeKey,
  useLowCodePageRuntime,
} from '../../../runtime/page-runtime';
import {
  isLowCodeEditPageActionDisabled,
  isLowCodeEditPageSaveAction,
  normalizeLowCodeEditPageActionCode,
} from '../../../runtime/edit-page-mode';

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

function handleAction(action: LowCodeAction) {
  if (isActionDisabled(action)) return;
  emit('runtimeEvent', {
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
  });
  emit('toolbarAction', { block: props.block, action });
}

function isActionDisabled(action: LowCodeAction) {
  return isMesCommandExecuting.value
    || isLowCodeEditPageActionDisabled(action, editPageMode.value);
}
</script>
