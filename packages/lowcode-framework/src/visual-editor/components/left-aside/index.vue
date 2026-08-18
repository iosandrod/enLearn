<!--
 * @Author: 卜启缘
 * @Date: 2021-06-24 00:35:17
 * @LastEditTime: 2022-07-02 18:26:09
 * @LastEditors: 卜启缘
 * @Description: 左侧边栏
 * @FilePath: /vite-vue3-lowcode/src/visual-editor/components/left-aside/index.vue
-->
<template>
  <vxe-tabs v-model="activeName" position="left" class="left-aside">
    <template v-for="tabItem in tabs" :key="tabItem.name">
      <vxe-tab-pane :name="tabItem.name" :title="tabItem.label" lazy>
        <template #title>
          <div class="tab-item">
            <span class="tab-icon"><component :is="tabItem.icon" /></span>
            {{ tabItem.label }}
          </div>
        </template>
        <component :is="tabItem.comp" v-bind="$attrs" />
      </vxe-tab-pane>
    </template>
  </vxe-tabs>
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
    height: 100%;
    background: #fff;
    contain: layout;

    > :deep(.vxe-tabs--header) {
      margin-right: 0;
      border-right: 1px solid #e2e8f0;
      background: #f8fafc;

      .vxe-tabs--item {
        width: 88px;
        height: 72px;
        padding: 10px 8px;
        color: #475569;
        font-size: 13px;
        line-height: 1.2;

        &.is-active {
          background: #eef6ff;
          color: #1d73d8;
        }

        .tab-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;

          .tab-icon {
            font-size: 20px;
            margin-bottom: 5px;
          }
        }
      }
    }

    > :deep(.vxe-tabs--body) {
      height: 100%;
      background: #ffffff;
      overflow: hidden auto;
    }
  }
</style>
