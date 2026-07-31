<template>
  <section
    v-if="block.open !== false"
    class="lc-overlay-node"
    role="presentation"
    @click.self="requestClose"
  >
    <article
      class="content-panel lc-modal-node"
      role="dialog"
      aria-modal="true"
      :style="widthStyle(block.width)"
    >
      <header class="lc-modal-node__header">
        <button
          type="button"
          class="lc-modal-node__close"
          title="关闭"
          aria-label="关闭"
          @click="requestClose"
        >
          <i class="ri-close-line" aria-hidden="true" />
        </button>
      </header>
      <div class="lc-node-stack">
        <LowCodeBlockChildren
          :blocks="block.blocks"
          :resolved-data="resolvedData"
          :form-models="formModels"
          :search-filters="searchFilters"
          :loading-block-id="loadingBlockId"
          :loading-grid-id="loadingGridId"
          @form-submit="(payload) => emit('formSubmit', payload)"
          @form-action="(payload) => emit('formAction', payload)"
          @grid-edit="(payload) => emit('gridEdit', payload)"
          @grid-delete="(payload) => emit('gridDelete', payload)"
          @toolbar-action="(payload) => emit('toolbarAction', payload)"
          @search-submit="(payload) => emit('searchSubmit', payload)"
          @search-action="(payload) => emit('searchAction', payload)"
          @runtime-event="(event) => emit('runtimeEvent', event)"
        />
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import LowCodeBlockChildren from '../../../components/LowCodeBlockChildren.vue';
import { widthStyle } from '../helpers';
import type { LowCodePageModalBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageModalBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();

function requestClose() {
  emit('runtimeEvent', {
    name: 'modal.close',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      directives: [
        {
          type: 'closeBlock',
          blockId: props.block.id,
        },
      ],
    },
  });
}
</script>

<style scoped>
.lc-overlay-node {
  position: fixed;
  z-index: 1200;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 24px;
  background: rgb(15 23 42 / 42%);
}

.lc-modal-node {
  width: min(920px, 100%);
  max-width: calc(100vw - 48px);
  max-height: calc(100vh - 48px);
  overflow: auto;
}

.lc-modal-node__header {
  display: flex;
  min-height: 32px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.lc-modal-node__close {
  display: grid;
  width: 32px;
  height: 32px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: #667085;
  cursor: pointer;
  font-size: 20px;
}

.lc-modal-node__close:hover {
  background: #f2f4f7;
  color: #111827;
}

.lc-modal-node :deep(.content-panel) {
  border: 0;
  box-shadow: none;
  padding: 0;
}

@media (max-width: 640px) {
  .lc-overlay-node {
    padding: 12px;
  }

  .lc-modal-node {
    max-width: calc(100vw - 24px);
    max-height: calc(100vh - 24px);
  }
}
</style>
