<template>
  <section class="content-panel lc-node-tabs">
    <vxe-tabs
      :model-value="activeTabKey"
      :height="tabsHeight"
      @update:model-value="(key) => setActiveTab(String(key))"
    >
      <vxe-tab-pane
        v-for="tab in block.tabs"
        :key="tab.key"
        :title="tab.label"
        :name="tab.key"
      >
        <div class="lc-node-stack lc-tab-pane-stack">
          <LowCodeBlockChildren
            :blocks="tab.blocks"
            :resolved-data="resolvedData"
            :form-models="formModels"
            :search-filters="searchFilters"
            :loading-block-id="loadingBlockId"
            :loading-grid-id="loadingGridId"
            @form-submit="(payload) => emit('formSubmit', payload)"
            @form-action="(payload) => emit('formAction', payload)"
            @grid-edit="(payload) => emit('gridEdit', payload)"
            @grid-delete="(payload) => emit('gridDelete', payload)"
            @toolbar-action="(payload) => emit('toolbarAction', payload)"
            @search-submit="(payload) => emit('searchSubmit', payload)"
            @search-action="(payload) => emit('searchAction', payload)"
            @runtime-event="(event) => emit('runtimeEvent', event)"
          />
        </div>
      </vxe-tab-pane>
    </vxe-tabs>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import LowCodeBlockChildren from '../../../components/LowCodeBlockChildren.vue';
import type { LowCodePageTabsBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageTabsBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const localActiveKey = ref('');
const isFillRemaining = computed(() => props.block.layout?.fillRemaining === true);
const tabsHeight = computed(() => (isFillRemaining.value ? '100%' : undefined));

const activeTabKey = computed(() => {
  const firstKey = props.block.tabs[0]?.key ?? '';
  return localActiveKey.value || props.block.defaultKey || firstKey;
});

async function setActiveTab(key: string) {
  localActiveKey.value = key;
  await nextTick();
  emit('runtimeEvent', {
    name: 'tabs.activeChange',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: { tabKey: key },
  });
  window.dispatchEvent(new CustomEvent('lowcode:tab-activated', {
    detail: { blockId: props.block.id, tabKey: key },
  }));
}

onMounted(() => {
  void nextTick(() => {
    window.dispatchEvent(new CustomEvent('lowcode:tab-activated', {
      detail: { blockId: props.block.id, tabKey: activeTabKey.value },
    }));
  });
});
</script>
