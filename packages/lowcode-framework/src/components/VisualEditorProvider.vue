<template>
  <VisualEditor
    :show-header="showHeader"
    :left-exclude-labels="leftExcludeLabels"
    :left-width="leftWidth"
    :allow-form-design="allowFormDesign"
    :show-page-setting="showPageSetting"
    :workbench-mode="workbenchMode"
  >
    <template v-if="hasMetaSlot" #meta>
      <slot name="meta" />
    </template>
    <template v-if="hasActionsSlot" #actions>
      <slot name="actions" />
    </template>
  </VisualEditor>
  <GlobalDialogHost />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, useSlots } from 'vue';
import VisualEditor from '../visual-editor/index.vue';
import GlobalDialogHost from './GlobalDialogHost';
import type {
  VisualEditorModelValue,
  VisualEditorPage
} from '../visual-editor/visual-editor.utils';
import {
  initVisualData,
  injectKey,
  localKey
} from '../visual-editor/hooks/useVisualData';
import { provideVisualEditorPersistence } from '../visual-editor/hooks/useVisualPersistence';

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
    persistToSession?: boolean;
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
  initialPath: props.initialPath,
  routePath: props.routePath
});
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
