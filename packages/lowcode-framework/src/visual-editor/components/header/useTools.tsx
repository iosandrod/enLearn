/**
 * @name: tools
 * @author: 卜启缘
 * @date: 2021/5/7 10:46
 * @description：tools
 * @update: 2021/5/7 10:46
 */
import { computed, reactive } from 'vue';
import { VxeUI } from 'vxe-pc-ui';
import { ElMessage, ElRadio, ElRadioGroup } from '../common/designer-ui';
import { useQRCode } from '@vueuse/integrations/useQRCode';
import { useClipboard } from '@vueuse/core';
import {
  DocumentCopy,
  Cellphone,
  RefreshLeft,
  RefreshRight,
  Position,
  Delete,
  ChatLineSquare,
  Download,
  Upload,
  DocumentChecked,
} from '../common/remix-icons';
import { useVisualData, localKey } from '../../hooks/useVisualData';
import { useVisualEditorPersistence } from '../../hooks/useVisualPersistence';
import { useModal } from '../../hooks/useModal';
import MonacoEditor from '../common/monaco-editor/MonacoEditor';
import type {
  VisualEditorBlockData,
  VisualEditorModelValue,
  VisualEditorPage,
} from '../../visual-editor.utils';

type ImportScope = 'current' | 'all';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVisualEditorPage(value: unknown): value is VisualEditorPage {
  return (
    isPlainRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.path === 'string' &&
    isPlainRecord(value.config) &&
    Array.isArray(value.blocks)
  );
}

function isVisualEditorProject(value: unknown): value is VisualEditorModelValue {
  return (
    isPlainRecord(value) &&
    isPlainRecord(value.pages) &&
    Object.keys(value.pages).length > 0 &&
    Object.values(value.pages).every(isVisualEditorPage)
  );
}

function parseImportJson(value: string): unknown {
  if (!value.trim()) {
    throw new Error('JSON 内容不能为空');
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    const detail = error instanceof Error ? error.message : '无法解析 JSON';
    throw new Error(`JSON 格式错误：${detail}`);
  }
}

function resolveImportedPage(value: unknown, currentPath: string): VisualEditorPage {
  if (isVisualEditorPage(value)) {
    return value;
  }

  if (!isVisualEditorProject(value)) {
    throw new Error('当前页面导入需要页面 JSON 或完整项目 JSON');
  }

  const matchedPage = value.pages[currentPath];
  if (matchedPage) {
    return matchedPage;
  }

  const pages = Object.values(value.pages);
  if (pages.length === 1) {
    return pages[0];
  }

  throw new Error(`导入项目中不存在当前页面 ${currentPath}`);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export const useTools = () => {
  const {
    jsonData,
    updatePageBlock,
    currentPath,
    currentPage,
    overrideProject,
    setCurrentPage,
    setCurrentBlock,
    canUndo,
    canRedo,
    undoHistory,
    redoHistory,
  } = useVisualData();
  const persistence = useVisualEditorPersistence();
  const state = reactive<{
    coverRadio: ImportScope;
    importJsonValue: string;
    importEditorVersion: number;
  }>({
    coverRadio: 'current',
    importJsonValue: '',
    importEditorVersion: 0,
  });
  const importJsonChange = (value: string) => {
    state.importJsonValue = value;
  };

  return [
    {
      title: '保存',
      icon: DocumentChecked,
      onClick: async () => {
        if (!persistence.saveProject) {
          ElMessage.warning('当前页面未配置保存服务');
          return;
        }

        try {
          await persistence.saveProject();
          ElMessage.success('保存成功');
        } catch (error) {
          ElMessage.error(error instanceof Error ? error.message : '保存失败');
        }
      },
    },
    {
      title: '导入JSON',
      icon: Upload,
      onClick: () => {
        state.coverRadio = 'current';
        state.importJsonValue = JSON.stringify(jsonData, null, 2);
        state.importEditorVersion += 1;

        void VxeUI.modal.open({
          id: 'visual-editor-import-json',
          title: '导入JSON',
          width: 642,
          showFooter: true,
          showCancelButton: true,
          showConfirmButton: true,
          confirmClosable: false,
          destroyOnClose: true,
          slots: {
            default: () => (
              <>
                <ElRadioGroup v-model={state.coverRadio}>
                  <ElRadio label="current">覆盖当前页面</ElRadio>
                  <ElRadio label="all">覆盖整个项目</ElRadio>
                </ElRadioGroup>
                <MonacoEditor
                  onChange={importJsonChange}
                  code={state.importJsonValue}
                  vid={state.importEditorVersion}
                  layout={{ width: 600, height: 600 }}
                />
              </>
            ),
          },
          onConfirm: async ({ $modal }) => {
            try {
              const importedValue = parseImportJson(state.importJsonValue);
              const isCoverCurrent = state.coverRadio === 'current';

              if (isCoverCurrent) {
                const targetPath = currentPath.value;
                const importedPage = resolveImportedPage(importedValue, targetPath);
                const nextProject = cloneJson(jsonData) as VisualEditorModelValue;

                nextProject.pages[targetPath] = {
                  ...cloneJson(importedPage),
                  path: targetPath,
                };
                overrideProject(nextProject);
                setCurrentPage(targetPath);
                setCurrentBlock({} as VisualEditorBlockData);
              } else {
                if (!isVisualEditorProject(importedValue)) {
                  throw new Error('覆盖整个项目需要包含 pages 的完整项目 JSON');
                }
                overrideProject(cloneJson(importedValue));
              }

              ElMessage({
                showClose: true,
                type: 'success',
                duration: 2000,
                message: isCoverCurrent ? '成功覆盖当前页面' : '成功覆盖整个项目',
              });
              await $modal.close();
            } catch (error) {
              ElMessage.error(error instanceof Error ? error.message : '导入 JSON 失败');
            }
          },
        });
      },
    },
    {
      title: '导出JSON',
      icon: Download,
      onClick: () => {
        const { copy } = useClipboard({ source: JSON.stringify(jsonData) });

        copy()
          .then(() => ElMessage.success('复制成功'))
          .catch((err) => ElMessage.error(`复制失败：${err}`));
      },
    },
    {
      title: '真机预览',
      icon: Cellphone,
      onClick: () => {
        const qrcode = useQRCode(`${location.origin}/preview`);
        useModal({
          title: '预览二维码（暂不可用）',
          props: {
            width: 300,
          },
          footer: null,
          content: () => (
            <div class={'flex justify-center'}>
              <img width={220} height={220} src={qrcode.value} />
            </div>
          ),
        });
      },
    },
    {
      title: '复制页面',
      icon: DocumentCopy,
      onClick: () => {
        ElMessage({
          showClose: true,
          type: 'info',
          duration: 2000,
          message: '敬请期待！',
        });
      },
    },
    {
      title: '撤销',
      icon: RefreshLeft,
      disabled: computed(() => !canUndo.value),
      onClick: () => {
        undoHistory();
      },
    },
    {
      title: '重做',
      icon: RefreshRight,
      disabled: computed(() => !canRedo.value),
      onClick: () => {
        redoHistory();
      },
    },
    {
      title: '清空页面',
      icon: Delete,
      disabled: computed(() => !currentPage.value.blocks.length),
      onClick: () => {
        updatePageBlock(currentPage.value.path, []);
        setCurrentBlock({} as VisualEditorBlockData);
        ElMessage.success('已清空当前页面');
      },
    },
    {
      title: '预览',
      icon: Position,
      onClick: () => {
        localStorage.setItem(localKey, JSON.stringify(jsonData));
        window.open(location.href.replace('/#/', '/preview/#/'));
      },
    },
    {
      title: '反馈',
      icon: ChatLineSquare,
      onClick: () => {
        window.open('https://github.com/buqiyuan/vite-vue3-lowcode/issues/new');
      },
    },
  ];
};
