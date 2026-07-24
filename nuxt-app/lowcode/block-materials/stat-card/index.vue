<template>
  <section class="lc-stat-grid">
    <article
      v-for="item in block.items"
      :key="item.label"
      class="content-panel lc-stat-card"
    >
      <span>{{ item.label }}</span>
      <strong>{{ resolveStatValue(block, item, resolvedData) }}</strong>
      <small v-if="item.suffix">{{ item.suffix }}</small>
    </article>
  </section>
</template>

<script setup lang="ts">
import { resolveStatValue } from '../helpers';
import type { LowCodePageStatCardBlock } from '~/types/lowcode';
import type { LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageStatCardBlock>>();
</script>
