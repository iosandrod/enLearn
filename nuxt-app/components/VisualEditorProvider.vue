<template>
  <el-config-provider :locale="zhCn">
    <VisualEditor
      :show-header="showHeader"
      :left-exclude-labels="leftExcludeLabels"
      :left-width="leftWidth"
      :allow-form-design="allowFormDesign"
      :show-page-setting="showPageSetting"
      :workbench-mode="workbenchMode"
    />
  </el-config-provider>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, provide } from 'vue';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import VisualEditor from '@/visual-editor/index.vue';
import type {
  VisualEditorModelValue,
  VisualEditorPage
} from '@/visual-editor/visual-editor.utils';
import {
  initVisualData,
  injectKey,
  localKey
} from '@/visual-editor/hooks/useVisualData';
import { provideVisualEditorPersistence } from '@/visual-editor/hooks/useVisualPersistence';

const props = withDefaults(
  defineProps<{
    initialData?: VisualEditorModelValue | null;
    initialPath?: string;
    showHeader?: boolean;
    leftExcludeLabels?: string[];
    leftWidth?: string;
    allowFormDesign?: boolean;
    showPageSetting?: boolean;
    workbenchMode?: 'page' | 'form';
    persistToSession?: boolean;
  }>(),
  {
    initialData: null,
    initialPath: '',
    showHeader: true,
    leftExcludeLabels: () => [],
    leftWidth: '340px',
    allowFormDesign: true,
    showPageSetting: true,
    workbenchMode: 'page',
    persistToSession: true
  }
);

const emit = defineEmits<{
  save: [
    payload: {
      model: VisualEditorModelValue;
      currentPath: string;
      currentPage: VisualEditorPage;
    }
  ];
}>();

const visualData = initVisualData({
  initialData: props.initialData,
  initialPath: props.initialPath
});

provide(injectKey, visualData);

function cloneModel() {
  return JSON.parse(JSON.stringify(visualData.jsonData)) as VisualEditorModelValue;
}

function persistToSession() {
  if (props.persistToSession === false || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(localKey, JSON.stringify(visualData.jsonData));
}

function getSnapshot() {
  return {
    model: cloneModel(),
    currentPath: visualData.currentPath.value,
    currentPage: JSON.parse(JSON.stringify(visualData.currentPage.value)) as VisualEditorPage
  };
}

provideVisualEditorPersistence({
  saveProject: async () => {
    emit('save', getSnapshot());
  }
});

defineExpose({
  getSnapshot
});

onMounted(() => {
  window.addEventListener('beforeunload', persistToSession);
});

onBeforeUnmount(() => {
  persistToSession();
  window.removeEventListener('beforeunload', persistToSession);
});
</script>
