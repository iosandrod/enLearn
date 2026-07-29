<!--
 * @Author: 卜启缘
 * @Date: 2021-06-24 18:36:03
 * @LastEditTime: 2022-07-02 23:13:00
 * @LastEditors: 卜启缘
 * @Description: 数据源管理
 * @FilePath: /vite-vue3-lowcode/src/visual-editor/components/left-aside/components/data-source/index.vue
-->
<template>
  <vxe-tabs type="card" class="data-source">
    <vxe-tab-pane title="数据模型" name="model" lazy>
      <data-model />
    </vxe-tab-pane>
    <vxe-tab-pane title="数据接口" name="fetch" lazy>
      <data-fetch />
    </vxe-tab-pane>
  </vxe-tabs>
</template>

<script setup lang="tsx" name="基本组件">
  import { DataBoard } from '../../../common/remix-icons';
  import DataModel from './data-model.vue';
  import DataFetch from './data-fetch.vue';

  defineOptions({
    label: '数据源',
    order: 2,
    icon: DataBoard,
  });
</script>

<style lang="scss" scoped>
  .data-source :deep {
    .vxe-tabs--header {
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .vxe-tabs--body {
      contain: layout;
      content-visibility: auto;
    }
  }
</style>
