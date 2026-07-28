<template>
  <section class="stack">
    <div v-if="loading" class="content-panel">
      <p class="page-description">正在加载低代码页面...</p>
    </div>

    <div v-else-if="errorMessage" class="content-panel">
      <h2 class="page-title">页面不可用</h2>
      <p class="page-description">{{ errorMessage }}</p>
    </div>

    <LowCodePageRenderer v-else-if="page" :page="page" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { LowCodePageRecord } from '~/types/lowcode';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth',
});

const pageCode = 'notification-deliveries';
const serviceApi = useServiceApi();
const page = ref<LowCodePageRecord & { resolvedData?: Record<string, unknown> } | null>(null);
const loading = ref(true);
const errorMessage = ref('');

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';

  try {
    page.value = await serviceApi.invoke('lowcode', 'getPage', {
      code: pageCode,
      includeData: true,
    });
  } catch (error) {
    page.value = null;
    errorMessage.value = error instanceof Error ? error.message : '低代码页面加载失败。';
  } finally {
    loading.value = false;
  }
}

onMounted(loadPage);
</script>
