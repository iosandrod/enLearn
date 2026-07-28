<template>
  <section class="outline-panel">
    <header class="outline-panel__header">
      <div>
        <strong>{{ currentPage.title || '当前页面' }}</strong>
        <span>{{ totalNodeCount }} 个节点</span>
      </div>
    </header>

    <section v-if="currentPage.blocks.length" class="outline-group">
      <div class="outline-group__title">页面布局</div>
      <LayerBlockList v-model:blocks="currentBlocks" />
    </section>

    <section v-if="currentOverlays.length" class="outline-group">
      <div class="outline-group__title">页面弹层</div>
      <LayerBlockList v-model:blocks="currentOverlays" overlay-list />
    </section>

    <vxe-empty v-if="!totalNodeCount" content="暂无节点" />
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { Operation } from '../../../common/remix-icons';
  import { useVisualData } from '../../../../hooks/useVisualData';
  import LayerBlockList from './LayerBlockList.vue';

  defineOptions({
    name: 'OutlineTree',
    label: '图层',
    order: 1.5,
    icon: Operation,
  });

  const { currentPage } = useVisualData();
  const currentBlocks = computed({
    get: () => currentPage.value.blocks,
    set: (blocks) => {
      currentPage.value.blocks = blocks;
    },
  });

  const currentOverlays = computed({
    get: () => {
      currentPage.value.overlays ??= [];
      return currentPage.value.overlays;
    },
    set: (blocks) => {
      currentPage.value.overlays = blocks;
    },
  });

  const totalNodeCount = computed(
    () => currentPage.value.blocks.length + currentOverlays.value.length,
  );
</script>

<style lang="scss" scoped>
  .outline-panel {
    display: flex;
    min-height: 100%;
    padding: 12px 10px 20px;
    background: #f8fafc;
    box-sizing: border-box;
    flex-direction: column;
    gap: 10px;
  }

  .outline-panel__header {
    display: flex;
    min-height: 44px;
    padding: 8px 10px;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    background: #ffffff;
    align-items: center;
    justify-content: space-between;
    box-shadow: 0 1px 2px rgb(15 23 42 / 4%);

    strong {
      display: block;
      max-width: 180px;
      color: #0f172a;
      font-size: 14px;
      line-height: 20px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    span {
      display: block;
      color: #64748b;
      font-size: 12px;
      line-height: 18px;
    }
  }

  .outline-group {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 6px;
  }

  .outline-group__title {
    padding: 0 4px;
    color: #64748b;
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
  }
</style>
