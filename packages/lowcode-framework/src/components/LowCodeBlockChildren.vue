<template>
  <LowCodeBlockRenderer
    v-for="child in blocks"
    :key="child.id"
    :block="child"
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

<script setup lang="ts">
import type {
  LowCodeBlockMaterialEmits,
  LowCodeBlockMaterialProps,
  LowCodeRuntimeBlock,
} from '../lowcode/block-materials';

defineProps<
  Omit<LowCodeBlockMaterialProps, 'block'> & {
    blocks: LowCodeRuntimeBlock[];
  }
>();

const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
