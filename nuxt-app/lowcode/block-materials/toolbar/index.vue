<template>
  <section class="content-panel lc-node-toolbar">
    <div>
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </div>
    <div class="lc-actions">
      <vxe-button
        v-for="action in block.actions"
        :key="action.code"
        :status="action.status"
        :disabled="action.disabled"
        @click="emit('toolbarAction', { block, action })"
      >
        {{ action.label }}
      </vxe-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { LowCodePageToolbarBlock } from '~/types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

defineProps<LowCodeBlockMaterialProps<LowCodePageToolbarBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
</script>
