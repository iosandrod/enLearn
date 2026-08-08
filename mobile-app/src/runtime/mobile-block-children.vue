<template>
  <div class="mobile-block-children">
    <MobileBlockRenderer
      v-for="child in blocks"
      :key="child.id"
      :block="child"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      :grid-states="gridStates"
      :service-api="serviceApi"
      @runtime-event="forwardRuntimeEvent"
    />
  </div>
</template>

<script setup lang="ts">
import MobileBlockRenderer from './mobile-block-renderer.vue';
import type {
  MobileFormModels,
  MobileMaterialEmits,
  MobileRuntimeBlock,
  MobileRuntimeEvent,
  MobileGridRuntimeStates,
} from './types';
import type { MobileServiceApi } from './service-api';

defineProps<{
  blocks: MobileRuntimeBlock[];
  resolvedData: Record<string, unknown>;
  formModels: MobileFormModels;
  activeActionCodes: Record<string, string>;
  gridStates: MobileGridRuntimeStates;
  serviceApi: MobileServiceApi;
}>();

const emit = defineEmits<MobileMaterialEmits>();

function forwardRuntimeEvent(event: MobileRuntimeEvent) {
  emit('runtimeEvent', event);
}
</script>

<style scoped>
.mobile-block-children {
  display: flex;
  flex-direction: column;
}

.mobile-block-children > * + * {
  margin-top: 10px;
}
</style>
