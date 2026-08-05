<template>
  <MobileList
    v-if="block.schema?.grid?.mobileDisplay === 'card'"
    :block="block"
    :resolved-data="resolvedData"
    :form-models="formModels"
    :active-action-codes="activeActionCodes"
    @runtime-event="forwardRuntimeEvent"
  />
  <MobileVirtualTable
    v-else
    :block="block"
    :resolved-data="resolvedData"
    :form-models="formModels"
    :active-action-codes="activeActionCodes"
    @runtime-event="forwardRuntimeEvent"
  />
</template>

<script setup lang="ts">
import MobileList from './mobile-list.vue';
import MobileVirtualTable from './mobile-virtual-table.vue';
import type {
  MobileMaterialEmits,
  MobileMaterialProps,
  MobileRuntimeEvent,
} from '../types';

defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

function forwardRuntimeEvent(event: MobileRuntimeEvent) {
  emit('runtimeEvent', event);
}
</script>
