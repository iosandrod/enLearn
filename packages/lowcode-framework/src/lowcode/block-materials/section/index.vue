<template>
  <section :class="['lc-node-section', { 'content-panel': block.panel !== false }]">
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
  </section>
</template>

<script setup lang="ts">
import LowCodeBlockChildren from '../../../components/LowCodeBlockChildren.vue';
import type { LowCodePageSectionBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageSectionBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
