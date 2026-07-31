<template>
  <LowCodeBlockRenderer
    v-for="(child, index) in runtimeBlocks"
    :key="child.id"
    :class="{ 'lc-runtime-block--fill': index === blocks.length - 1 }"
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
import { computed } from 'vue';
import type {
  LowCodeBlockMaterialEmits,
  LowCodeBlockMaterialProps,
  LowCodeRuntimeBlock,
} from '../lowcode/block-materials';

const props = defineProps<
  Omit<LowCodeBlockMaterialProps, 'block'> & {
    blocks: LowCodeRuntimeBlock[];
  }
>();

const emit = defineEmits<LowCodeBlockMaterialEmits>();

const runtimeBlocks = computed(() => {
  const lastIndex = props.blocks.length - 1;
  return props.blocks.map((block, index) =>
    index === lastIndex
      ? {
          ...block,
          layout: {
            ...(block.layout ?? {}),
            fillRemaining: true,
          },
        }
      : block
  );
});
</script>
