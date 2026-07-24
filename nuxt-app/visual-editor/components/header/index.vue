<template>
  <div class="visual-editor-toolbar">
    <!--    左侧logo start-->
    <div class="toolbar-brand">
      <div class="logo"></div>
      <h3 class="font-semibold">H5低代码</h3>
    </div>
    <!--    左侧logo end-->
    <!--    中间操作页面部分 start-->
    <div class="toolbar-tools">
      <template v-for="(toolItem, toolIndex) in tools" :key="toolIndex">
        <button class="tool-item" type="button" @click="toolItem.onClick">
          <el-icon>
            <component :is="toolItem.icon" />
          </el-icon>
          <span class="title">{{ toolItem.title }}</span>
        </button>
      </template>
    </div>
    <!--    中间操作页面部分 end-->
    <!--    右侧工具栏 start-->
    <div class="right-tools">
      <el-tooltip class="item" effect="dark" content="运行" placement="bottom">
        <el-button
          type="primary"
          :icon="VideoPlay"
          size="large"
          circle
          class="flex-shrink-0 !p-6px"
          @click="runPreview"
        />
      </el-tooltip>
      <el-popover placement="bottom-end" :width="180" trigger="hover" popper-class="repo-popover">
        <div class="repo-menu">
          <a
            class="repo-menu-link"
            href="https://github.com/buqiyuan/vite-vue3-lowcode"
            target="_blank"
            rel="noreferrer"
          >
            <el-icon><LinkIcon /></el-icon>
            <span>GitHub</span>
          </a>
          <a
            class="repo-menu-link"
            href="https://gitee.com/buqiyuan/vite-vue3-lowcode"
            target="_blank"
            rel="noreferrer"
          >
            <el-icon><Promotion /></el-icon>
            <span>Gitee</span>
          </a>
        </div>
        <template #reference>
          <button class="repo-link" type="button" aria-label="开源仓库">
            <el-icon><LinkIcon /></el-icon>
          </button>
        </template>
      </el-popover>
    </div>
    <!--    右侧工具栏 end-->
  </div>
  <preview v-model:visible="isShowH5Preview" />
</template>

<script lang="ts" setup>
  import { Link as LinkIcon, Promotion, VideoPlay } from '@element-plus/icons-vue';
  import Preview from './preview.vue';
  import { useTools } from './useTools';
  import { useVisualData, localKey } from '@/visual-editor/hooks/useVisualData';

  defineOptions({
    name: 'PageHeader',
  });

  const isShowH5Preview = ref(false);

  const tools = useTools();

  const { jsonData } = useVisualData();

  const runPreview = () => {
    sessionStorage.setItem(localKey, JSON.stringify(jsonData));
    localStorage.setItem(localKey, JSON.stringify(jsonData));
    isShowH5Preview.value = true;
  };
</script>

<style lang="scss" scoped>
  .visual-editor-toolbar {
    display: grid;
    width: 100%;
    height: 64px;
    padding: 0 14px;
    grid-template-columns: 170px minmax(0, 1fr) 92px;
    gap: 12px;
    align-items: center;
    box-sizing: border-box;

    .toolbar-brand {
      display: inline-flex;
      min-width: 0;
      align-items: center;
      gap: 10px;
    }

    .logo {
      width: 34px;
      height: 34px;
      background-image: url('@/assets/logo.png');
      background-repeat: no-repeat;
      background-size: contain;
      flex: none;
    }

    h3 {
      margin: 0;
      color: #111827;
      font-size: 15px;
      line-height: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .toolbar-tools {
      display: flex;
      min-width: 0;
      align-items: center;
      justify-content: center;
      gap: 4px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .tool-item {
      display: inline-flex;
      width: 66px;
      height: 50px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #475569;
      cursor: pointer;
      flex: 0 0 66px;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      transition:
        background-color 0.15s ease,
        color 0.15s ease;

      &:hover {
        background: #eef6ff;
        color: #1d73d8;
      }

      .el-icon {
        font-size: 17px;
      }

      .title {
        max-width: 58px;
        font-size: 12px;
        line-height: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .right-tools {
      display: inline-flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .repo-link {
      display: inline-grid;
      width: 34px;
      height: 34px;
      padding: 0;
      border: 1px solid #d8e0ea;
      border-radius: 6px;
      background: #fff;
      color: #475569;
      cursor: pointer;
      place-items: center;
      transition:
        border-color 0.15s ease,
        background-color 0.15s ease;

      &:hover {
        border-color: #93c5fd;
        background: #f8fbff;
        color: #1d73d8;
      }

      .el-icon {
        font-size: 18px;
      }
    }

    :deep(.el-button.is-circle) {
      width: 34px;
      height: 34px;
      min-height: 34px;
      font-size: 18px;
    }
  }

  @media (max-width: 1180px) {
    .visual-editor-toolbar {
      grid-template-columns: 140px minmax(0, 1fr) 44px;

      .repo-link {
        display: none;
      }
    }
  }

  .repo-menu {
    display: grid;
    gap: 6px;
  }

  .repo-menu-link {
    display: flex;
    height: 34px;
    padding: 0 10px;
    border-radius: 6px;
    color: #334155;
    text-decoration: none;
    align-items: center;
    gap: 8px;
    transition:
      background-color 0.15s ease,
      color 0.15s ease;

    &:hover {
      background: #eef6ff;
      color: #1d73d8;
    }

    .el-icon {
      font-size: 16px;
    }
  }
</style>
