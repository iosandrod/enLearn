<template>
  <article class="content-panel">
    <p v-if="block.title" class="section-kicker">{{ block.title }}</p>
    <p :class="textToneClass(block.tone)">{{ block.content }}</p>
  </article>
</template>

<script setup lang="ts">
import { textToneClass } from '../helpers';
import type { LowCodePageTextBlock } from '~/types/lowcode';
import type { LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageTextBlock>>();
</script>
