<template>
  <div class="mobile-section">
    <div v-if="block.title || block.description" class="section-header">
      <span v-if="block.title" class="section-title">{{ block.title }}</span>
      <span v-if="block.description" class="section-description">{{ block.description }}</span>
    </div>
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
.mobile-section {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.section-header {
  margin-bottom: 12px;
  display: flex;
  flex-direction: column;
}

.section-title {
  color: #17212b;
  font-size: 16px;
  line-height: 24px;
  font-weight: bold;
}

.section-description {
  margin-top: 3px;
  color: #68737d;
  font-size: 12px;
  line-height: 18px;
}
</style>
