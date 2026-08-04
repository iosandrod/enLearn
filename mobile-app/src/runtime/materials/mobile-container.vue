<template>
  <div :class="['mobile-container', { 'is-panel': block.panel === true }]">
    <span v-if="block.title" class="container-title">{{ block.title }}</span>
    <span v-if="block.description" class="container-description">{{ block.description }}</span>
    <MobileBlockChildren
      :blocks="block.blocks ?? []"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      @runtime-event="(event) => emit('runtimeEvent', event)"
    />
  </div>
</template>

<script setup lang="ts">
import MobileBlockChildren from '../mobile-block-children.vue';
import type { MobileMaterialEmits, MobileMaterialProps } from '../types';

defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
</script>

<style scoped>
.mobile-container {
  display: flex;
  flex-direction: column;
}

.mobile-container.is-panel {
  padding: 14px;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.container-title {
  margin-bottom: 4px;
  color: #17212b;
  font-size: 16px;
  line-height: 24px;
  font-weight: bold;
}

.container-description {
  margin-bottom: 10px;
  color: #68737d;
  font-size: 12px;
  line-height: 18px;
}
</style>
