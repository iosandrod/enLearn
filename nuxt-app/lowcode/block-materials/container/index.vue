<template>
  <section
    :class="['lc-node-container', { 'content-panel': block.panel === true }]"
    :style="containerStyle(block)"
  >
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
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
  </section>
</template>

<script setup lang="ts">
import LowCodeBlockChildren from '~/components/LowCodeBlockChildren.vue';
import { containerStyle } from '../helpers';
import type { LowCodePageContainerBlock } from '~/types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageContainerBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
