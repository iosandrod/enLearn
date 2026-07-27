<template>
  <section class="outline-panel">
    <header class="outline-panel__header">
      <div>
        <strong>{{ currentPage.title || '当前页面' }}</strong>
        <span>{{ currentPage.blocks.length }} 个节点</span>
      </div>
    </header>

    <LayerBlockList
      v-if="currentPage.blocks.length"
      v-model:blocks="currentBlocks"
    />
    <vxe-empty v-else content="暂无节点" />
  </section>
</template>

<script setup lang="ts">
  import { computed } from 'vue';
  import { Operation } from '@/visual-editor/components/common/remix-icons';
  import { useVisualData } from '@/visual-editor/hooks/useVisualData';
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
</style>
