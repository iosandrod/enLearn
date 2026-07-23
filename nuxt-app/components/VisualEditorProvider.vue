<template>
  <el-config-provider :locale="zhCn">
    <VisualEditor />
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

const props = defineProps<{
  initialData?: VisualEditorModelValue | null;
}>();

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
  initialData: props.initialData
});

provide(injectKey, visualData);

function cloneModel() {
  return JSON.parse(JSON.stringify(visualData.jsonData)) as VisualEditorModelValue;
}

function persistToSession() {
  if (typeof sessionStorage === 'undefined') return;
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
