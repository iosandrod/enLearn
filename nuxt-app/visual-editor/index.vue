<!--
 * @Author: 卜启缘
 * @Date: 2021-06-24 00:35:17
 * @LastEditTime: 2021-06-27 14:31:28
 * @LastEditors: 卜启缘
 * @Description: 可视化编辑器
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\index.vue
-->
<template>
  <el-container
    class="visual-editor-shell"
    :class="{
      'is-without-header': !showHeader,
      'is-form-workbench': workbenchMode === 'form',
    }"
  >
    <el-header v-if="showHeader" height="64px" class="visual-editor-header">
      <!-- 顶部start -->
      <Header />
      <!-- 顶部end -->
    </el-header>
    <el-container class="visual-editor-workspace">
      <el-aside class="visual-editor-sidebar" :width="leftWidth">
        <!-- 左侧组件start -->
        <left-aside :exclude-labels="leftExcludeLabels" />
        <!-- 左侧组件end -->
      </el-aside>
      <el-main class="visual-editor-main">
        <!-- 中间编辑区域start -->
        <simulator-editor
          :allow-form-design="allowFormDesign"
          :workbench-mode="workbenchMode"
        />
        <!-- 中间编辑区域end -->

        <!-- 右侧属性面板start -->
        <right-attribute-panel :show-page-setting="showPageSetting" />
        <!-- 右侧属性面板end -->
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
  import Header from './components/header/index.vue';
  import LeftAside from './components/left-aside/index.vue';
  import RightAttributePanel from './components/right-attribute-panel';
  import SimulatorEditor from './components/simulator-editor/simulator-editor.vue';

  withDefaults(
    defineProps<{
      showHeader?: boolean;
      leftExcludeLabels?: string[];
      leftWidth?: string;
      allowFormDesign?: boolean;
      showPageSetting?: boolean;
      workbenchMode?: 'page' | 'form';
    }>(),
    {
      showHeader: true,
      leftExcludeLabels: () => [],
      leftWidth: '340px',
      allowFormDesign: true,
      showPageSetting: true,
      workbenchMode: 'page',
    },
  );
</script>

<style lang="scss" scoped>
  .visual-editor-shell {
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-top: 1px solid #d8e0ea;
    background: #eef3f8;
  }

  .visual-editor-header {
    position: relative;
    z-index: 22;
    padding: 0;
    border-bottom: 1px solid #d8e0ea;
    background: #ffffff;
    box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
  }

  .visual-editor-workspace {
    height: calc(100% - 64px);
    min-height: 0;
  }

  .visual-editor-shell.is-without-header {
    border-top: 0;

    .visual-editor-workspace {
      height: 100%;
    }
  }

  .visual-editor-sidebar {
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid #d8e0ea;
    background: #ffffff;
    box-shadow: 1px 0 2px rgb(15 23 42 / 4%);
  }

  .visual-editor-main {
    position: relative;
    min-width: 0;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    background: #f1f5f9;
  }

  .visual-editor-shell.is-form-workbench {
    border: 1px solid #d8e0ea;
    border-radius: 8px;

    .visual-editor-sidebar {
      width: 300px;
    }
  }
</style>
