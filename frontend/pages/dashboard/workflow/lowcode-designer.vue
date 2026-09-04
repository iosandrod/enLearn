<template>
  <section class="workflow-lowcode-page">
    <div v-if="loading" class="content-panel"><p class="page-description">正在加载审批流设计器...</p></div>
    <div v-else-if="errorMessage" class="content-panel"><p class="page-description">{{ errorMessage }}</p></div>
    <LowCodePageRenderer
      v-else-if="page"
      :page="page"
      :service-api="serviceApi"
      :router="router"
      :route="pageRoute"
      :on-runtime-event="forwardWorkflowEvent"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { LowCodePageRecord, LowCodeRuntimeEvent } from '@enlearn/lowcode-framework/types/lowcode';
import { getLowCodePage } from '../../../utils/lowCodePages';

const route = useRoute();
const router = useRouter();
const serviceApi = useServiceApi();
const page = ref<LowCodePageRecord | null>(null);
const loading = ref(true);
const errorMessage = ref('');
const pageRoute = computed(() => ({
  path: route.path,
  fullPath: route.fullPath,
  query: { ...route.query },
  params: { ...route.params },
}));

function forwardWorkflowEvent(event: LowCodeRuntimeEvent) {
  window.dispatchEvent(new CustomEvent(`lowcode:${event.name}`, { detail: event }));
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';
  try {
    page.value = await getLowCodePage(serviceApi, {
      route: '/dashboard/workflow/designer',
      includeData: true,
    });
  } catch (error) {
    page.value = null;
    errorMessage.value = error instanceof Error ? error.message : '审批流设计器加载失败。';
  } finally {
    loading.value = false;
  }
}

watch(() => route.params.code, loadPage);
onMounted(loadPage);
</script>

<style scoped>
.workflow-lowcode-page { height: calc(100vh - 112px); min-height: 640px; }
.workflow-lowcode-page :deep(.lowcode-runtime-shell),
.workflow-lowcode-page :deep(.lowcode-runtime-page) { display:flex; flex-direction:column; height: 100%; min-height: 0; }
.workflow-lowcode-page :deep(.lc-runtime-block) { flex: 0 0 auto; min-height: 0; height: auto; }
.workflow-lowcode-page :deep(.lc-node-button-group) {
  flex: 0 0 auto;
  min-height: 0;
  padding: 2px 6px;
  gap: 2px;
}
.workflow-lowcode-page :deep(.lc-button-group) {
  min-height: 0;
  gap: 6px;
}
.workflow-lowcode-page :deep(.lc-button-group .vxe-button) {
  min-height: 28px;
  height: 28px;
  padding-top: 0;
  padding-bottom: 0;
}
.workflow-lowcode-page :deep(.approval-workflow-material) {
  flex: 1 1 auto;
  min-height: 560px;
  height: calc(100vh - 180px);
}
.workflow-lowcode-page :deep(.approval-designer) { min-height: 560px; height: 100%; }
</style>
