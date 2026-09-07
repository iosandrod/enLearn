<template>
  <section class="print-lowcode-page">
    <div v-if="loading" class="content-panel"><p class="page-description">正在加载打印设计器...</p></div>
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

onMounted(async () => {
  try {
    page.value = await getLowCodePage(serviceApi, { code: 'print-designer', includeData: true });
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '打印设计器加载失败。';
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.print-lowcode-page {
  display: flex;
  height: calc(100vh - 112px);
  min-height: 640px;
  flex-direction: column;
}
.print-lowcode-page :deep(.lowcode-runtime-shell),
.print-lowcode-page :deep(.lowcode-runtime-page) {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}
.print-lowcode-page :deep(.lc-runtime-block) {
  flex: 0 0 auto;
  min-height: 0;
}
.print-lowcode-page :deep(.lc-node-button-group) {
  flex: 0 0 auto;
  min-height: 0;
  padding: 2px 6px;
}
.print-lowcode-page :deep(.lc-node-button-group .lc-button-group) { gap: 6px; }
.print-lowcode-page :deep(.lc-node-button-group .vxe-button) { height: 30px; }
.print-lowcode-page :deep(.label-designer-material) {
  flex: 1 1 auto;
  min-height: 560px;
  height: calc(100vh - 180px);
}
</style>
