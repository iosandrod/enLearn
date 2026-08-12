<template>
  <div
    :class="[
      'mobile-container',
      {
        'is-panel': block.panel === true,
        'is-fill-remaining': block.layout?.fillRemaining === true,
      },
    ]"
    :style="blockStyle"
    @layout="handleLayout"
  >
    <span v-if="block.title" class="container-title">{{ block.title }}</span>
    <span v-if="block.description" class="container-description">{{ block.description }}</span>
    <div class="container-grid" :style="gridStyle">
      <div
        v-for="child in block.blocks ?? []"
        :key="child.id"
        :class="['container-cell', { 'is-fill-remaining': child.layout?.fillRemaining === true }]"
        :style="cellStyle"
      >
        <MobileBlockRenderer
          :block="child"
          :resolved-data="resolvedData"
          :form-models="formModels"
          :active-action-codes="activeActionCodes"
          :executing-action-keys="executingActionKeys"
          :grid-states="gridStates"
          :service-api="serviceApi!"
          @runtime-event="(event) => emit('runtimeEvent', event)"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from '@vue/runtime-core';
import type { HippyLayoutEvent } from '@hippy/vue-next';
import type { CSSProperties } from 'vue';

import MobileBlockRenderer from '../mobile-block-renderer.vue';
import {
  createLayoutWidthScheduler,
  getWebLayoutFrameDriver,
} from '../layout-width';
import { readFormNumber, resolveResponsiveFormColumns } from '../mobile-form';
import { resolveMobileBlockStyle } from '../block-style';
import type { MobileMaterialEmits, MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
const containerWidth = ref(0);
const widthScheduler = createLayoutWidthScheduler(
  () => containerWidth.value,
  (width) => {
    containerWidth.value = width;
  },
  getWebLayoutFrameDriver(),
);

const columns = computed(() => resolveResponsiveFormColumns(
  props.block.columns,
  containerWidth.value,
));
const blockStyle = computed(() => resolveMobileBlockStyle(props.block.style));
const gap = computed(() => Math.min(32, Math.max(0, readFormNumber(props.block.gap, 10) ?? 10)));
const gridStyle = computed<CSSProperties>(() => ({
  marginRight: `${-gap.value / 2}px`,
  marginLeft: `${-gap.value / 2}px`,
}));
const cellStyle = computed<CSSProperties>(() => {
  const width = `${100 / columns.value}%`;
  return {
    width,
    flexBasis: width,
    paddingRight: `${gap.value / 2}px`,
    paddingLeft: `${gap.value / 2}px`,
    marginBottom: `${gap.value}px`,
  };
});

function handleLayout(event: HippyLayoutEvent) {
  widthScheduler.schedule(event.width);
}

onBeforeUnmount(widthScheduler.cancel);
</script>

<style scoped>
.mobile-container {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.mobile-container.is-fill-remaining,
.container-cell.is-fill-remaining {
  flex: 1;
  min-height: 0;
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

.container-grid {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: stretch;
}

.container-cell {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
</style>
