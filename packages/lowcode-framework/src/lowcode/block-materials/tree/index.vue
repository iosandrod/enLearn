<template>
  <article class="content-panel lc-tree-node">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <ul>
      <LowCodeTreeItem
        v-for="row in resolveTreeRows(block.rows, block.sourceKey, resolvedData)"
        :key="String(row[block.keyField ?? 'id'] ?? row[block.titleField ?? 'title'])"
        :row="row"
        :title-field="block.titleField ?? 'title'"
        :children-field="block.childrenField ?? 'children'"
      />
    </ul>
  </article>
</template>

<script setup lang="ts">
import LowCodeTreeItem from '../../../components/LowCodeTreeItem.vue';
import { resolveTreeRows } from '../helpers';
import type { LowCodePageTreeBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageTreeBlock>>();
</script>
