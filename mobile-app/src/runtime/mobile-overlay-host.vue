<template>
  <template v-for="overlay in overlays" :key="overlay.id">
    <MobileBlockRenderer
      v-if="overlay.open !== false"
      :block="overlay"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      :grid-states="gridStates"
      :service-api="serviceApi"
      @runtime-event="forwardRuntimeEvent"
    />
    <MobileOverlayHost
      v-if="overlay.open !== false && overlay.overlays?.length"
      :overlays="overlay.overlays"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      :grid-states="gridStates"
      :service-api="serviceApi"
      @runtime-event="forwardRuntimeEvent"
    />
  </template>
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

defineOptions({ name: 'MobileOverlayHost' });

defineProps<{
  overlays: MobileRuntimeBlock[];
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
