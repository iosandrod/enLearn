<template>
  <article class="content-panel">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeGrid
      :schema="block.schema"
      :rows="resolveGridRows(block, resolvedData, searchFilters)"
      :loading="loadingGridId === block.id"
      @edit="(row) => emit('gridEdit', { block, row })"
      @delete="(row) => emit('gridDelete', { block, row })"
    />
  </article>
</template>

<script setup lang="ts">
import LowCodeGrid from '~/components/LowCodeGrid.vue';
import { resolveGridRows } from '../helpers';
import type { LowCodePageGridBlock } from '~/types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageGridBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
