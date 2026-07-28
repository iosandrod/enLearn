<template>
  <entity-data-source class="data-source" />
</template>

<script setup lang="tsx" name="EntityDataSourcePanel">
  import { DataBoard } from '@/visual-editor/components/common/remix-icons';
  import EntityDataSource from './entity-data-source.vue';

  defineOptions({
    label: '实体数据源',
    order: 2,
    icon: DataBoard,
  });
</script>

<style lang="scss" scoped>
  .data-source {
    min-height: 0;
  }
</style>
