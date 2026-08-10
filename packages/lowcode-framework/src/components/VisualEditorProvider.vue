<template>
  <VisualEditor
    :show-header="showHeader"
    :left-exclude-labels="leftExcludeLabels"
    :left-width="leftWidth"
    :allow-form-design="allowFormDesign"
    :show-page-setting="showPageSetting"
    :workbench-mode="workbenchMode"
    :page-record="pageRecord"
  >
    <template v-if="hasMetaSlot" #meta>
      <slot name="meta" />
    </template>
    <template v-if="hasActionsSlot" #actions>
      <slot name="actions" />
    </template>
  </VisualEditor>
  <GlobalDialogHost v-if="showGlobalDialogHost" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, useSlots } from 'vue';
import VisualEditor from '../visual-editor/index.vue';
import GlobalDialogHost from './GlobalDialogHost';
import { useLowCodeHost } from '../core/host';
import { loadDatabaseMaterialPropForms } from '../visual-editor/material-prop-forms';
import {
  ensureUniqueVisualBlockIds,
  type VisualEditorModelValue,
  type VisualEditorPage
} from '../visual-editor/visual-editor.utils';
import {
  initVisualData,
  injectKey,
  localKey
} from '../visual-editor/hooks/useVisualData';
import { provideVisualEditorPersistence } from '../visual-editor/hooks/useVisualPersistence';
import type { LowCodePageRecord } from '../types/lowcode';

const props = withDefaults(
  defineProps<{
    initialData?: VisualEditorModelValue | null;
    initialPath?: string;
    routePath?: string;
    showHeader?: boolean;
    leftExcludeLabels?: string[];
    leftWidth?: string;
    allowFormDesign?: boolean;
    showPageSetting?: boolean;
    workbenchMode?: 'page' | 'form';
    pageRecord?: LowCodePageRecord | null;
    persistToSession?: boolean;
    showGlobalDialogHost?: boolean;
  }>(),
  {
    initialData: null,
    initialPath: '',
    routePath: '',
    showHeader: true,
    leftExcludeLabels: () => ['页面'],
    leftWidth: '340px',
    allowFormDesign: true,
    showPageSetting: true,
    workbenchMode: 'page',
    pageRecord: null,
    persistToSession: true,
    showGlobalDialogHost: true,
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
  initialPath: props.initialPath,
  routePath: props.routePath
});
const host = useLowCodeHost();
const slots = useSlots();
const hasMetaSlot = computed(() => Boolean(slots.meta));
const hasActionsSlot = computed(() => Boolean(slots.actions));

provide(injectKey, visualData);

function cloneModel() {
  return JSON.parse(JSON.stringify(visualData.jsonData)) as VisualEditorModelValue;
}

function persistToSession() {
  if (props.persistToSession === false || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(localKey, JSON.stringify(visualData.jsonData));
}

function getSnapshot() {
  const model = ensureUniqueVisualBlockIds(cloneModel());
  const currentPath = visualData.currentPath.value;
  const currentPage = model.pages[currentPath] ?? model.pages['/'];

  if (!currentPage) {
    throw new Error('当前设计页面不存在，无法保存。');
  }

  return {
    model,
    currentPath,
    currentPage: currentPage as VisualEditorPage
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

  try {
    void loadDatabaseMaterialPropForms(host.getServiceApi()).catch((error) => {
      console.warn('数据库物料属性表单加载失败，已继续使用内置定义。', error);
    });
  } catch (error) {
    console.warn('未配置低代码服务，已继续使用内置物料属性定义。', error);
  }
});

onBeforeUnmount(() => {
  persistToSession();
  window.removeEventListener('beforeunload', persistToSession);
});
</script>
