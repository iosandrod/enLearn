<template>
  <template v-for="overlay in overlays" :key="overlay.id">
    <LowCodeBlockRenderer
      v-if="overlay.open !== false"
      :block="overlay"
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

    <LowCodeOverlayHost
      v-if="overlay.open !== false && overlay.overlays?.length"
      :overlays="overlay.overlays"
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
  </template>
</template>

<script setup lang="ts">
import type { LowCodePageOverlayBlock } from '../types/lowcode';
import LowCodeBlockRenderer from './LowCodeBlockRenderer.vue';
import type {
  LowCodeBlockMaterialEmits,
  LowCodeBlockMaterialProps,
} from '../lowcode/block-materials';

defineOptions({
  name: 'LowCodeOverlayHost',
});

defineProps<
  Omit<LowCodeBlockMaterialProps, 'block'> & {
    overlays: LowCodePageOverlayBlock[];
  }
>();

const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
