<template>
  <article class="content-panel lc-detail">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <dl>
      <template v-for="field in block.fields" :key="field.field">
        <dt>{{ field.label }}</dt>
        <dd>
          {{ formatDetailValue(resolveDetailRecord(block, resolvedData)?.[field.field], field.formatter) }}
        </dd>
      </template>
    </dl>
  </article>
</template>

<script setup lang="ts">
import { formatDetailValue, resolveDetailRecord } from '../helpers';
import type { LowCodePageDetailBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageDetailBlock>>();
</script>
