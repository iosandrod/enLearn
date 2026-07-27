<template>
  <div
    class="visual-editor-toolbar"
    :class="{
      'has-actions': hasActionsSlot,
    }"
  >
    <div class="toolbar-tools">
      <template v-for="(toolItem, toolIndex) in tools" :key="toolIndex">
        <button
          class="tool-item"
          :class="{ 'is-disabled': isToolDisabled(toolItem) }"
          type="button"
          :disabled="isToolDisabled(toolItem)"
          @click="handleToolClick(toolItem)"
        >
          <span class="toolbar-icon">
            <component :is="toolItem.icon" />
          </span>
          <span class="title">{{ toolItem.title }}</span>
        </button>
      </template>
    </div>

    <div v-if="hasActionsSlot" class="toolbar-actions">
      <slot name="actions" />
    </div>

    <div class="right-tools">
      <vxe-tooltip class="item" content="预览" placement="bottom">
        <vxe-button status="primary" size="large" circle class="run-button" @click="runPreview">
          <VideoPlay />
        </vxe-button>
      </vxe-tooltip>
      <details class="repo-dropdown">
        <summary class="repo-link" aria-label="项目链接">
          <LinkIcon />
        </summary>
        <div class="repo-menu">
          <a
            class="repo-menu-link"
            href="https://github.com/buqiyuan/vite-vue3-lowcode"
            target="_blank"
            rel="noreferrer"
          >
            <LinkIcon />
            <span>GitHub</span>
          </a>
          <a
            class="repo-menu-link"
            href="https://gitee.com/buqiyuan/vite-vue3-lowcode"
            target="_blank"
            rel="noreferrer"
          >
            <Promotion />
            <span>Gitee</span>
          </a>
        </div>
      </details>
    </div>
  </div>
  <preview v-model:visible="isShowH5Preview" />
</template>

<script lang="ts" setup>
  import { computed, onBeforeUnmount, onMounted, ref, unref, useSlots } from 'vue';
  import { Link as LinkIcon, Promotion, VideoPlay } from '@/visual-editor/components/common/remix-icons';
  import Preview from './preview.vue';
  import { useTools } from './useTools';
  import { useVisualData, localKey } from '@/visual-editor/hooks/useVisualData';

  defineOptions({
    name: 'PageHeader',
  });

  const isShowH5Preview = ref(false);
  const tools = useTools();
  const slots = useSlots();
  const hasActionsSlot = computed(() => Boolean(slots.actions));
  const { jsonData, undoHistory, redoHistory } = useVisualData();

  const isToolDisabled = (toolItem) => unref(toolItem.disabled) === true;

  const handleToolClick = (toolItem) => {
    if (isToolDisabled(toolItem)) return;
    toolItem.onClick();
  };

  const runPreview = () => {
    sessionStorage.setItem(localKey, JSON.stringify(jsonData));
    localStorage.setItem(localKey, JSON.stringify(jsonData));
    isShowH5Preview.value = true;
  };

  const isEditableShortcutTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;

    const tagName = target.tagName.toLowerCase();
    return (
      target.isContentEditable ||
      ['input', 'textarea', 'select'].includes(tagName) ||
      Boolean(target.closest('.monaco-editor'))
    );
  };

  const handleHistoryShortcut = (event: KeyboardEvent) => {
    if (isEditableShortcutTarget(event.target)) return;
    if (!event.ctrlKey && !event.metaKey) return;

    const key = event.key.toLowerCase();
    const handled =
      key === 'z'
        ? event.shiftKey
          ? redoHistory()
          : undoHistory()
        : key === 'y'
          ? redoHistory()
          : false;

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleHistoryShortcut);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleHistoryShortcut);
  });
</script>

<style lang="scss" scoped>
  .visual-editor-toolbar {
    display: flex;
    width: 100%;
    height: 56px;
    padding: 0 10px;
    gap: 10px;
    align-items: center;
    box-sizing: border-box;

    .toolbar-tools {
      display: flex;
      flex: 1 1 160px;
      min-width: 0;
      align-items: center;
      justify-content: flex-start;
      gap: 2px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .tool-item {
      display: inline-flex;
      width: 56px;
      height: 48px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #475569;
      cursor: pointer;
      flex: 0 0 56px;
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

      &:disabled,
      &.is-disabled {
        color: #94a3b8;
        cursor: not-allowed;
        opacity: 0.55;
      }

      &:disabled:hover,
      &.is-disabled:hover {
        background: transparent;
        color: #94a3b8;
      }

      .toolbar-icon {
        font-size: 17px;
      }

      .title {
        max-width: 52px;
        font-size: 12px;
        line-height: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }

    .toolbar-actions {
      display: flex;
      flex: 0 0 auto;
      min-width: 0;
      max-width: min(560px, 52vw);
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;

      &::-webkit-scrollbar {
        display: none;
      }
    }

    .right-tools {
      display: inline-flex;
      flex: 0 0 auto;
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

      .toolbar-icon {
        font-size: 18px;
      }
    }

    :deep(.run-button) {
      width: 34px;
      height: 34px;
      min-height: 34px;
      font-size: 18px;
    }
  }

  @media (max-width: 1180px) {
    .visual-editor-toolbar {
      .repo-link {
        display: none;
      }
    }
  }

  .repo-dropdown {
    position: relative;
  }

  .repo-dropdown summary {
    list-style: none;
  }

  .repo-dropdown summary::-webkit-details-marker {
    display: none;
  }

  .repo-menu {
    position: absolute;
    top: 40px;
    right: 0;
    z-index: 40;
    display: grid;
    width: 180px;
    padding: 8px;
    border: 1px solid #d8e0ea;
    border-radius: 8px;
    background: #fff;
    box-shadow: 0 12px 36px rgb(15 23 42 / 12%);
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

    .toolbar-icon {
      font-size: 16px;
    }
  }
</style>
