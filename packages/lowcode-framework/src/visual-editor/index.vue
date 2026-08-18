<!--
 * @Author: 卜启缘
 * @Date: 2021-06-24 00:35:17
 * @LastEditTime: 2021-06-27 14:31:28
 * @LastEditors: 卜启缘
 * @Description: 可视化编辑器
 * @FilePath: \vite-vue3-lowcode\src\visual-editor\index.vue
-->
<template>
  <div
    class="visual-editor-shell"
    :class="{
      'is-without-header': !showHeader,
      'is-form-workbench': workbenchMode === 'form',
    }"
  >
    <header v-if="showHeader" class="visual-editor-header">
      <Header>
        <template v-if="hasMetaSlot" #meta>
          <slot name="meta" />
        </template>
        <template v-if="hasActionsSlot" #actions>
          <slot name="actions" />
        </template>
      </Header>
    </header>
    <div class="visual-editor-workspace">
      <aside class="visual-editor-sidebar" :style="{ width: leftWidth }">
        <!-- 左侧组件start -->
        <left-aside :exclude-labels="leftExcludeLabels" />
        <!-- 左侧组件end -->
      </aside>
      <main class="visual-editor-main">
        <!-- 中间编辑区域start -->
        <simulator-editor
          :allow-form-design="allowFormDesign"
          :workbench-mode="workbenchMode"
          :page-record="pageRecord"
        />
        <!-- 中间编辑区域end -->

        <!-- 右侧属性面板start -->
        <right-attribute-panel :show-page-setting="showPageSetting" />
        <!-- 右侧属性面板end -->
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, useSlots } from 'vue';
  import Header from './components/header/index.vue';
  import LeftAside from './components/left-aside/index.vue';
  import RightAttributePanel from './components/right-attribute-panel';
  import SimulatorEditor from './components/simulator-editor/simulator-editor.vue';
  import type { LowCodePageRecord } from '../types/lowcode';

  withDefaults(
    defineProps<{
      showHeader?: boolean;
      leftExcludeLabels?: string[];
      leftWidth?: string;
      allowFormDesign?: boolean;
      showPageSetting?: boolean;
      workbenchMode?: 'page' | 'form';
      pageRecord?: LowCodePageRecord | null;
    }>(),
    {
      showHeader: true,
      leftExcludeLabels: () => ['页面'],
      leftWidth: '340px',
      allowFormDesign: true,
      showPageSetting: true,
      workbenchMode: 'page',
      pageRecord: null,
    },
  );

  const slots = useSlots();
  const hasMetaSlot = computed(() => Boolean(slots.meta));
  const hasActionsSlot = computed(() => Boolean(slots.actions));
</script>

<style lang="scss" scoped>
  .visual-editor-shell {
    display: flex;
    flex-direction: column;
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
    display: flex;
    flex: 1 1 auto;
    height: auto;
    min-height: 0;
  }

  .visual-editor-shell.is-without-header {
    border-top: 0;

    .visual-editor-workspace {
      height: 100%;
    }
  }

  .visual-editor-sidebar {
    flex: none;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid #d8e0ea;
    background: #ffffff;
    box-shadow: 1px 0 2px rgb(15 23 42 / 4%);
  }

  .visual-editor-main {
    flex: 1;
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
