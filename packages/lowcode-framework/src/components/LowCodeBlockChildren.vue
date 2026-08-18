<template>
  <LowCodeBlockRenderer
    v-for="(child, index) in runtimeBlocks"
    :key="child.id"
    :class="{ 'lc-runtime-block--fill': index === runtimeBlocks.length - 1 }"
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
    blocks: unknown;
  }
>();

const emit = defineEmits<LowCodeBlockMaterialEmits>();

function isRuntimeBlock(value: unknown): value is LowCodeRuntimeBlock {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).kind === 'string';
}

const runtimeBlocks = computed(() => {
  const blocks = Array.isArray(props.blocks) ? props.blocks.filter(isRuntimeBlock) : [];
  const lastIndex = blocks.length - 1;
  return blocks.map((block, index) =>
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
