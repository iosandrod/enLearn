<template>
  <div class="mobile-tabs" :style="blockStyle">
    <div class="tab-bar">
      <button
        v-for="tab in block.tabs ?? []"
        :key="tab.key"
        :class="['tab-button', { 'is-active': tab.key === activeKey }]"
        @click="activeKey = tab.key"
      >
        <span class="tab-button-text">{{ tab.label }}</span>
      </button>
    </div>

    <MobileBlockChildren
      v-if="activeTab"
      :blocks="activeTab.blocks ?? []"
      :resolved-data="resolvedData"
      :form-models="formModels"
      :active-action-codes="activeActionCodes"
      :executing-action-keys="executingActionKeys"
      :grid-states="gridStates"
      :service-api="serviceApi!"
      @runtime-event="(event) => emit('runtimeEvent', event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from '@vue/runtime-core';

import MobileBlockChildren from '../mobile-block-children.vue';
import { resolveMobileBlockStyle } from '../block-style';
import type { MobileMaterialEmits, MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
const activeKey = ref('');
const blockStyle = computed(() => resolveMobileBlockStyle(props.block.style));

const activeTab = computed(() => {
  const tabs = props.block.tabs ?? [];
  return tabs.find((tab: { key: string }) => tab.key === activeKey.value) ?? tabs[0];
});

watch(
  () => props.block.id,
  () => {
    activeKey.value = props.block.defaultKey ?? props.block.tabs?.[0]?.key ?? '';
  },
  { immediate: true }
);
</script>

<style scoped>
.mobile-tabs {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.tab-bar {
  margin-bottom: 12px;
  display: flex;
  flex-direction: row;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #dfe4e8;
}

.tab-button {
  min-height: 40px;
  margin-right: 18px;
  padding-right: 2px;
  padding-left: 2px;
  align-items: center;
  justify-content: center;
  background-color: #ffffff;
  border-bottom-width: 2px;
  border-bottom-style: solid;
  border-bottom-color: #ffffff;
}

.tab-button.is-active {
  border-bottom-color: #1e67d6;
}

.tab-button-text {
  color: #68737d;
  font-size: 14px;
  line-height: 20px;
}

.tab-button.is-active .tab-button-text {
  color: #1e67d6;
  font-weight: bold;
}
</style>
