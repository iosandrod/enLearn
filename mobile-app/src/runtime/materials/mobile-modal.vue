<template>
  <dialog
    v-if="block.open !== false"
    class="mobile-overlay-dialog"
    transparent
    :animated="false"
    animation-type="none"
    @request-close="requestClose"
  >
    <div class="modal-mask" @click="requestClose">
      <div class="modal-panel" :style="panelStyle" @click.stop>
        <div class="overlay-heading">
          <div class="overlay-heading-copy">
            <span class="overlay-title">{{ block.title || '业务操作' }}</span>
            <span v-if="block.description" class="overlay-description">{{ block.description }}</span>
          </div>
          <button class="overlay-close" aria-label="关闭" @click="requestClose">
            <span class="overlay-close-text">×</span>
          </button>
        </div>
        <div class="overlay-content">
          <MobileBlockChildren
            :blocks="block.blocks ?? []"
            :resolved-data="resolvedData"
            :form-models="formModels"
            :active-action-codes="activeActionCodes"
            :executing-action-keys="executingActionKeys"
            :grid-states="gridStates"
            :service-api="serviceApi!"
            @runtime-event="(event) => emit('runtimeEvent', event)"
          />
        </div>
        <div v-if="block.showFooter === true" class="overlay-footer">
          <button class="overlay-footer-action" :disabled="isExecuting" @click="publishAction('cancel')">
            <span class="overlay-footer-action-text">{{ block.cancelLabel || '取消' }}</span>
          </button>
          <button class="overlay-footer-action is-primary" :disabled="isExecuting" @click="publishAction('confirm')">
            <span class="overlay-footer-action-text is-primary">{{ block.confirmLabel || '确定' }}</span>
          </button>
        </div>
      </div>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed } from '@vue/runtime-core';
import type { CSSProperties } from 'vue';

import MobileBlockChildren from '../mobile-block-children.vue';
import { readFormNumber } from '../mobile-form';
import type { MobileMaterialEmits, MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
const panelStyle = computed<CSSProperties>(() => {
  const configuredWidth = readFormNumber(props.block.width);
  if (!configuredWidth) return {};
  return { maxWidth: `${Math.min(920, Math.max(280, configuredWidth))}px` };
});
const isExecuting = computed(() => props.executingActionKeys.has(`${props.block.id}:confirm`));

function requestClose() {
  publishAction('close');
}

function publishAction(action: 'confirm' | 'cancel' | 'close') {
  const directives = action === 'confirm'
    ? props.block.confirmDirectives ?? []
    : action === 'cancel'
      ? props.block.cancelDirectives ?? [{ type: 'closeBlock', blockId: props.block.id }]
      : props.block.closeDirectives ?? [{ type: 'closeBlock', blockId: props.block.id }];
  emit('runtimeEvent', {
    name: `modal.${action}`,
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      actionCode: action,
      directives,
    },
  });
}
</script>

<style scoped>
.mobile-overlay-dialog {
  width: 100%;
  height: 100%;
}

.modal-mask {
  flex: 1;
  padding: 14px;
  align-items: center;
  justify-content: center;
  background-color: rgba(13, 25, 34, 0.52);
}

.modal-panel {
  width: 100%;
  max-width: 720px;
  max-height: 92%;
  display: flex;
  flex-direction: column;
  background-color: #f3f6f7;
  border-radius: 7px;
}

.overlay-heading {
  min-height: 62px;
  padding-right: 12px;
  padding-left: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #d9e0e4;
  border-top-left-radius: 7px;
  border-top-right-radius: 7px;
}

.overlay-heading-copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.overlay-title {
  color: #172b38;
  font-size: 16px;
  line-height: 23px;
  font-weight: bold;
}

.overlay-description {
  color: #71818b;
  font-size: 10px;
  line-height: 15px;
}

.overlay-close {
  width: 38px;
  height: 38px;
  margin-left: 8px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 4px;
}

.overlay-close-text {
  color: #405761;
  font-size: 26px;
  line-height: 30px;
}

.overlay-content {
  min-height: 0;
  padding: 12px;
  overflow-y: scroll;
}

.overlay-footer {
  min-height: 62px;
  padding-right: 12px;
  padding-left: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  background-color: #ffffff;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #d9e0e4;
}

.overlay-footer-action {
  min-width: 76px;
  height: 40px;
  margin-left: 8px;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 4px;
}

.overlay-footer-action.is-primary {
  background-color: #176ea8;
}

.overlay-footer-action-text {
  color: #405761;
  font-size: 13px;
}

.overlay-footer-action-text.is-primary {
  color: #ffffff;
}
</style>
