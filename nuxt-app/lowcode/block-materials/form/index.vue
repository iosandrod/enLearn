<template>
  <article class="content-panel">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeForm
      v-model="formModels[block.id]"
      :schema="block.schema"
      :option-sources="resolvedData"
      :loading="loadingBlockId === block.id"
      @submit="(values) => emit('formSubmit', { block, values })"
      @action="(action, values) => emit('formAction', { block, action, values })"
    />
  </article>
</template>

<script setup lang="ts">
import LowCodeForm from '~/components/LowCodeForm.vue';
import type { LowCodePageFormBlock } from '~/types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageFormBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
