<template>
  <section class="stack">
    <div v-if="loading" class="content-panel">
      <p class="page-description">Loading low-code page...</p>
    </div>

    <div v-else-if="errorMessage" class="content-panel">
      <h2 class="page-title">Page not available</h2>
      <p class="page-description">{{ errorMessage }}</p>
    </div>

    <LowCodePageRenderer v-else-if="page" :page="page" />
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { getBuiltinLowCodePageByCode } from '@enlearn/lowcode-framework/runtime';
import type { LowCodePageRecord } from '~/types/lowcode';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const route = useRoute();
const serviceApi = useServiceApi();
const page = ref<LowCodePageRecord & { resolvedData?: Record<string, unknown> } | null>(
  null
);
const loading = ref(true);
const errorMessage = ref('');

function isMissingLowCodePageError(error: unknown) {
  const fetchError = error as {
    status?: number;
    statusCode?: number;
    statusMessage?: string;
    message?: string;
    data?: { message?: string; statusMessage?: string };
  };
  const statusCode = fetchError.statusCode ?? fetchError.status;
  const message = [
    fetchError.statusMessage,
    fetchError.message,
    fetchError.data?.message,
    fetchError.data?.statusMessage,
  ]
    .filter(Boolean)
    .join(' ');

  return statusCode === 404 || message.includes('Low-code page not found');
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';

  try {
    page.value = await serviceApi.invoke('lowcode', 'getPage', {
      code: String(route.params.code ?? ''),
      includeData: true
    });
  } catch (error) {
    const builtinPage = getBuiltinLowCodePageByCode(String(route.params.code ?? ''));
    if (builtinPage && isMissingLowCodePageError(error)) {
      page.value = builtinPage;
      loading.value = false;
      return;
    }

    page.value = null;
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the page.';
  } finally {
    loading.value = false;
  }
}

watch(
  () => route.params.code,
  () => {
    loadPage();
  }
);

onMounted(loadPage);
</script>
