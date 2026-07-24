<!--
 * @Author: 卜启缘
 * @Date: 2021-06-24 00:35:17
 * @LastEditTime: 2022-07-02 18:26:09
 * @LastEditors: 卜启缘
 * @Description: 左侧边栏
 * @FilePath: /vite-vue3-lowcode/src/visual-editor/components/left-aside/index.vue
-->
<template>
  <el-tabs v-model="activeName" tab-position="left" class="left-aside">
    <template v-for="tabItem in tabs" :key="tabItem.name">
      <el-tab-pane :name="tabItem.name" lazy>
        <template #label>
          <div class="tab-item">
            <el-icon :size="26"><component :is="tabItem.icon" /></el-icon>
            {{ tabItem.label }}
          </div>
        </template>
        <component :is="tabItem.comp" v-bind="$attrs" />
      </el-tab-pane>
    </template>
  </el-tabs>
</template>

<script lang="ts" setup>
  /**
   * @description 左侧边栏
   */
  import { computed, ref, watch } from 'vue';
  import components from './components';

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

        return !excludeLabels.includes(tab.label);
      })
      .sort((a, b) => a.order - b.order),
  );

  const activeName = ref('');

  watch(
    tabs,
    (nextTabs) => {
      if (!nextTabs.some((tab) => tab.name === activeName.value)) {
        activeName.value = nextTabs[0]?.name || '';
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

    > :deep(.el-tabs__header) {
      margin-right: 0;
      border-right: 1px solid #e2e8f0;
      background: #f8fafc;

      .el-tabs__item {
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

          [class^='el-icon-'] {
            font-size: 20px;
          }

          .el-icon {
            margin-bottom: 5px;
          }
        }
      }
    }

    > :deep(.el-tabs__content) {
      height: 100%;
      background: #ffffff;
      overflow: hidden auto;
    }
  }
</style>
