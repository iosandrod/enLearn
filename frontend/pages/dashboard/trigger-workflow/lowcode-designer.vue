<template>
  <section class="trigger-workflow-lowcode-page">
    <div v-if="loading" class="content-panel"><p class="page-description">正在加载触发器编排器...</p></div>
    <div v-else-if="errorMessage" class="content-panel"><p class="page-description">{{ errorMessage }}</p></div>
    <LowCodePageRenderer
      v-else-if="page"
      :page="page"
      :service-api="serviceApi"
      :router="router"
      :route="pageRoute"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type { LowCodePageRecord } from '@enlearn/lowcode-framework/types/lowcode';
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

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';
  try {
    page.value = await getLowCodePage(serviceApi, {
      route: '/dashboard/trigger-workflow/designer',
      includeData: true,
    });
  } catch (error) {
    page.value = null;
    errorMessage.value = error instanceof Error ? error.message : '触发器编排器加载失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(loadPage);
</script>

<style scoped>
.trigger-workflow-lowcode-page { height: calc(100vh - 112px); min-height: 640px; }
.trigger-workflow-lowcode-page :deep(.lowcode-runtime-shell),
.trigger-workflow-lowcode-page :deep(.lowcode-runtime-page) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.trigger-workflow-lowcode-page :deep(.lc-runtime-block) { flex: 0 0 auto; min-height: 0; height: auto; }
.trigger-workflow-lowcode-page :deep(.lc-node-button-group) { flex: 0 0 auto; min-height: 0; padding: 2px 6px; gap: 2px; }
.trigger-workflow-lowcode-page :deep(.lc-button-group) { min-height: 0; gap: 6px; }
.trigger-workflow-lowcode-page :deep(.lc-button-group .vxe-button) { min-height: 28px; height: 28px; padding-top: 0; padding-bottom: 0; }
.trigger-workflow-lowcode-page :deep(.trigger-workflow-material) { flex: 1 1 auto; min-height: 560px; height: calc(100vh - 180px); }
.trigger-workflow-lowcode-page :deep(.trigger-editor) { min-height: 560px; height: 100%; }
</style>
