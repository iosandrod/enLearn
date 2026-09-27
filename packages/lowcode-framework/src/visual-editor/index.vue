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
    <div class="visual-editor-workspace" :class="{ 'is-mobile-left-open': mobileLeftOpen }">
      <button
        v-if="isMobileViewport && mobileLeftOpen"
        class="visual-editor-mobile-backdrop"
        type="button"
        aria-label="关闭组件面板"
        @click="mobileLeftOpen = false"
      />
      <aside
        class="visual-editor-sidebar"
        :class="{ 'is-mobile-open': mobileLeftOpen }"
        :style="{ width: leftWidth }"
        @click="handleSidebarClick"
      >
        <!-- 左侧组件start -->
        <left-aside :exclude-labels="leftExcludeLabels" />
        <!-- 左侧组件end -->
      </aside>
      <button
        v-if="isMobileViewport"
        class="visual-editor-mobile-panel-toggle"
        type="button"
        :aria-expanded="mobileLeftOpen"
        aria-label="打开组件面板"
        @click="mobileLeftOpen = !mobileLeftOpen"
      >
        <i class="ri-layout-left-line" aria-hidden="true" />
        <span>组件</span>
      </button>
      <main class="visual-editor-main">
        <!-- 中间编辑区域start -->
        <simulator-editor
          :allow-form-design="allowFormDesign"
          :workbench-mode="workbenchMode"
          :page-record="pageRecord"
        >
          <template v-if="hasCanvasToolbarSlot" #canvas-toolbar>
            <slot name="canvas-toolbar" />
          </template>
        </simulator-editor>
        <!-- 中间编辑区域end -->

        <!-- 右侧属性面板start -->
        <right-attribute-panel :show-page-setting="showPageSetting" />
        <!-- 右侧属性面板end -->
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref, useSlots } from 'vue';
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
  const hasCanvasToolbarSlot = computed(() => Boolean(slots['canvas-toolbar']));
  const isMobileViewport = ref(false);
  const mobileLeftOpen = ref(false);
  let mobileMediaQuery: MediaQueryList | null = null;

  const updateMobileViewport = () => {
    isMobileViewport.value = Boolean(mobileMediaQuery?.matches);
    if (!isMobileViewport.value) mobileLeftOpen.value = false;
  };

  const handleSidebarClick = (event: MouseEvent) => {
    if (!isMobileViewport.value || !(event.target instanceof Element)) return;
    if (event.target.closest('[class*="list-group-item"]')) mobileLeftOpen.value = false;
  };

  onMounted(() => {
    mobileMediaQuery = window.matchMedia('(max-width: 1024px)');
    updateMobileViewport();
    mobileMediaQuery.addEventListener('change', updateMobileViewport);
  });

  onBeforeUnmount(() => {
    mobileMediaQuery?.removeEventListener('change', updateMobileViewport);
  });
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
    position: relative;
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

  .visual-editor-mobile-backdrop,
  .visual-editor-mobile-panel-toggle {
    display: none;
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

  @media (max-width: 1024px) {
    .visual-editor-shell {
      border-top: 0;
    }

    .visual-editor-workspace {
      overflow: hidden;
    }

    .visual-editor-sidebar {
      position: fixed;
      right: 0;
      bottom: 0;
      left: 0;
      z-index: 31;
      width: 100% !important;
      height: min(52vh, 420px);
      max-height: calc(100% - 72px);
      padding-top: 10px;
      border-top: 1px solid #d8e0ea;
      border-right: 0;
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -10px 32px rgb(15 23 42 / 18%);
      transform: translateY(102%);
      transition: transform 0.2s ease;

      &::before {
        position: absolute;
        top: 5px;
        left: 50%;
        z-index: 2;
        width: 36px;
        height: 4px;
        border-radius: 999px;
        background: #cbd5e1;
        content: '';
        transform: translateX(-50%);
      }
    }

    .visual-editor-sidebar.is-mobile-open {
      transform: translateY(0);
    }

    .visual-editor-mobile-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: block;
      border: 0;
      background: rgb(15 23 42 / 28%);
      cursor: pointer;
    }

    .visual-editor-mobile-panel-toggle {
      position: absolute;
      left: 50%;
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 25;
      display: inline-flex;
      min-width: 68px;
      height: 42px;
      padding: 0 12px;
      border: 1px solid #cbd5e1;
      border-radius: 21px;
      background: #ffffff;
      color: #1d73d8;
      box-shadow: 0 8px 22px rgb(15 23 42 / 16%);
      cursor: pointer;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      transform: translateX(-50%);
    }

    .visual-editor-mobile-panel-toggle:active {
      transform: translate(-50%, 1px);
    }

    .visual-editor-main {
      width: 100%;
    }

    .visual-editor-shell.is-form-workbench {
      border: 0;
      border-radius: 0;

      .visual-editor-sidebar {
        width: 100% !important;
      }
    }
  }
</style>
