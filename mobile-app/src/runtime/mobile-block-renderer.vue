<template>
  <component
    :is="materialComponent"
    v-if="materialComponent"
    :block="block"
    :resolved-data="resolvedData"
    :form-models="formModels"
    :active-action-codes="activeActionCodes"
    @runtime-event="forwardRuntimeEvent"
  />

  <div v-else class="unsupported-block">
    <span class="unsupported-title">暂不支持的移动物料</span>
    <span class="unsupported-kind">{{ block.kind }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from '@vue/runtime-core';

import { getMobileMaterial } from './material-registry';
import type { MobileMaterialEmits, MobileMaterialProps, MobileRuntimeEvent } from './types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

const materialComponent = computed(() => getMobileMaterial(props.block.kind)?.component);

function forwardRuntimeEvent(event: MobileRuntimeEvent) {
  emit('runtimeEvent', event);
}
</script>

<style scoped>
.unsupported-block {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #fff1cc;
  border-radius: 6px;
}

.unsupported-title {
  color: #7a4f00;
  font-size: 13px;
  font-weight: bold;
}

.unsupported-kind {
  margin-top: 4px;
  color: #7a4f00;
  font-size: 12px;
}
</style>
