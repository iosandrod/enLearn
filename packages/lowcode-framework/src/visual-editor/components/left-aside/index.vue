<!--
 * @Author: 卜启缘
 * @Date: 2021-06-24 00:35:17
 * @LastEditTime: 2022-07-02 18:26:09
 * @LastEditors: 卜启缘
 * @Description: 左侧边栏
 * @FilePath: /vite-vue3-lowcode/src/visual-editor/components/left-aside/index.vue
-->
<template>
  <div class="left-aside">
    <nav class="left-aside__tabs" aria-label="设计器组件分类">
      <button
        v-for="tabItem in tabs"
        :key="tabItem.name"
        type="button"
        :class="{ 'is-active': activeName === tabItem.name }"
        :aria-pressed="activeName === tabItem.name"
        @click="activeName = tabItem.name"
      >
        <span class="tab-icon"><component :is="tabItem.icon" /></span>
        <span>{{ tabItem.label }}</span>
      </button>
    </nav>
    <div class="left-aside__panel">
      <component v-if="activeTab" :is="activeTab.comp" v-bind="$attrs" />
    </div>
  </div>
</template>

<script lang="ts" setup>
  /**
   * @description 左侧边栏
   */
  import { computed, inject, ref, watch } from 'vue';
  import components from './components';
  import { formDesignerModeKey } from '../../form-designer-context';

  defineOptions({
    name: 'LeftAside',
  });

  const props = withDefaults(
    defineProps<{
      excludeLabels?: string[];
      includeLabels?: string[];
    }>(),
    {
      excludeLabels: () => [],
      includeLabels: () => [],
    },
  );

  const formDesignerMode = inject(formDesignerModeKey, null);

  const tabs = computed(() =>
    Object.entries(components)
      .map(([name, component]) => {
        const { label, icon, order } = component;
        return { label, icon, name, order, comp: component };
      })
      .filter((tab) => {
        const includeLabels = props.includeLabels;
        const excludeLabels = props.excludeLabels;

        // Data sources are configured from the page settings and are no longer
        // exposed as a material tab in the visual editor.
        if (tab.label === '数据源') {
          return false;
        }

        if (includeLabels.length && !includeLabels.includes(tab.label)) {
          return false;
        }

        if (excludeLabels.includes(tab.label)) {
          return false;
        }

        return tab.label !== '列组件' || formDesignerMode?.value === 'edit';
      })
      .sort((a, b) => a.order - b.order),
  );

  const activeName = ref('');
  const activeTab = computed(() => tabs.value.find((tab) => tab.name === activeName.value));

  watch(
    tabs,
    (nextTabs) => {
      if (!nextTabs.some((tab) => tab.name === activeName.value)) {
        activeName.value =
          nextTabs.find((tab) => tab.label === '图层')?.name || nextTabs[0]?.name || '';
      }
    },
    { immediate: true },
  );
</script>

<style lang="scss" scoped>
  .left-aside {
    display: grid;
    grid-template-columns: 80px minmax(0, 1fr);
    height: 100%;
    background: #fff;
    contain: layout;
  }

  .left-aside__tabs {
    overflow: hidden auto;
    border-right: 1px solid #e2e8f0;
    background: #f8fafc;
    padding: 10px 6px;

    button {
      position: relative;
      display: flex;
      width: 68px;
      height: 68px;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 4px;
      margin: 0 0 4px;
      border: 0;
      border-radius: 8px;
      background: transparent;
      color: #475569;
      cursor: pointer;
      padding: 8px 5px;
      font-size: 12px;
      line-height: 1.2;
      transition: color 0.15s ease, background-color 0.15s ease;

      @media (max-width: 1024px) {
        flex: 0 0 54px;
        width: 54px;
        height: 48px;
        margin: 0 2px;
        padding: 4px 2px;
        font-size: 10px;
      }

      &.is-active {
        background: #eaf3ff;
        color: #1d73d8;
        font-weight: 600;

        &::before {
          position: absolute;
          top: 50%;
          left: 0;
          width: 3px;
          height: 28px;
          border-radius: 0 3px 3px 0;
          background: #2f80ed;
          content: '';
          transform: translateY(-50%);
        }

        .tab-icon { background: #dbeafe; }
      }
    }
  }

  .tab-icon {
    display: grid;
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: #eef2f7;
    font-size: 17px;
    place-items: center;
  }

  .left-aside__panel {
    min-width: 0;
    min-height: 0;
    overflow: hidden auto;
    background: #ffffff;

    > :deep(*) {
      min-height: 100%;
    }
  }

  @media (max-width: 1024px) {
    .left-aside {
      grid-template-rows: 58px minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
    }

    .left-aside__tabs {
      display: flex;
      padding: 5px 4px;
      overflow: auto hidden;
      border-right: 0;
      border-bottom: 1px solid #e2e8f0;
      align-items: center;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }

      button.is-active::before {
        top: auto;
        bottom: 0;
        left: 50%;
        width: 24px;
        height: 3px;
        border-radius: 3px 3px 0 0;
        transform: translateX(-50%);
      }
    }

    .tab-icon {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      font-size: 14px;
    }

    .left-aside__panel {
      padding: 4px;

      :deep([class*='list-group']:not([class*='list-group-item'])) {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        padding: 4px;
        align-content: start;
      }

      :deep([class*='list-group-item']) {
        width: 100%;
        min-height: 58px;
        margin: 0;
        padding: 24px 6px 6px;
        border-radius: 7px;
        font-size: 11px;
      }

      :deep([class*='list-group-item']::before) {
        top: 5px;
        left: 5px;
        max-width: calc(100% - 10px);
        padding: 2px 5px;
        font-size: 10px;
      }
    }
  }
</style>
