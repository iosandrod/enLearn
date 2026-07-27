<template>
  <section v-if="block.open !== false" class="lc-overlay-node">
    <article class="content-panel lc-modal-node" :style="widthStyle(block.width)">
      <header v-if="block.title || block.description" class="lc-node-header">
        <h2 v-if="block.title">{{ block.title }}</h2>
        <p v-if="block.description">{{ block.description }}</p>
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

defineProps<LowCodeBlockMaterialProps<LowCodePageModalBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
