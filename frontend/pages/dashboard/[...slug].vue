<template>
  <section class="stack">
    <div v-if="loading" class="content-panel">
      <p class="page-description">Loading page...</p>
    </div>

    <div v-else-if="errorMessage" class="content-panel">
      <h2 class="page-title">Page not available</h2>
      <p class="page-description">{{ errorMessage }}</p>
    </div>

    <LowCodePageRenderer
      v-else-if="page"
      ref="rendererRef"
      :page="page"
      :service-api="serviceApi"
      :router="router"
      :route="pageRoute"
      :on-runtime-event="handleRuntimeEvent"
    />
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  getBuiltinLowCodePageByRoute,
  type LowCodeHostRoute,
} from '@enlearn/lowcode-framework/runtime';
import type {
  LowCodePageRecord,
  LowCodeRuntimeEvent,
} from '@enlearn/lowcode-framework/types/lowcode';
import { getLowCodePage } from '../../utils/lowCodePages';
import { notifySystemSettingsChanged } from '../../composables/useSystemSettings';
import {
  clearAiPageContext,
  setAiPageContext,
} from '../../composables/useAiPageContext';

const props = defineProps<{
  routePath: string;
}>();

const serviceApi = useServiceApi();
const router = useRouter();
const currentRoute = useRoute();
const pageRoute = ref<LowCodeHostRoute>(createPageRoute());
const page = ref<LowCodePageRecord & { resolvedData?: Record<string, unknown> } | null>(
  null
);
const loading = ref(true);
const errorMessage = ref('');
const rendererRef = ref<{ getSnapshot?: () => unknown } | null>(null);

function createPageRoute(): LowCodeHostRoute {
  return {
    query: { ...currentRoute.query },
    params: { ...currentRoute.params },
    path: currentRoute.path,
    fullPath: currentRoute.fullPath,
  };
}

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

function handleRuntimeEvent(event: LowCodeRuntimeEvent) {
  if (
    event.name === 'form.saved' &&
    page.value &&
    ['system-settings', 'system-settings-edit'].includes(page.value.code)
  ) {
    notifySystemSettingsChanged();
  }
}

async function loadPage() {
  loading.value = true;
  errorMessage.value = '';

  try {
    page.value = await getLowCodePage(serviceApi, {
      route: props.routePath,
      includeData: true
    });
    await nextTick();
    if (page.value) {
      setAiPageContext(page.value, () => rendererRef.value?.getSnapshot?.());
    }
  } catch (error) {
    const builtinPage = getBuiltinLowCodePageByRoute(props.routePath);
    if (builtinPage && isMissingLowCodePageError(error)) {
      page.value = builtinPage;
      await nextTick();
      setAiPageContext(page.value, () => rendererRef.value?.getSnapshot?.());
      loading.value = false;
      return;
    }

    page.value = null;
    clearAiPageContext();
    errorMessage.value =
      error instanceof Error ? error.message : 'Could not load the page.';
  } finally {
    loading.value = false;
  }
}

watch(() => props.routePath, () => {
  pageRoute.value = createPageRoute();
  loadPage();
});

watch(() => currentRoute.fullPath, () => {
  if (currentRoute.path === props.routePath) {
    pageRoute.value = createPageRoute();
  }
});

onMounted(loadPage);

function handleAiPageApplied(event: Event) {
  const detail = (event as CustomEvent<Record<string, unknown> | undefined>).detail;
  const appliedId = typeof detail?.id === 'string' ? detail.id : '';
  const appliedRoute = typeof detail?.route === 'string' ? detail.route : '';
  if (
    (appliedId && appliedId === page.value?.id) ||
    (appliedRoute && appliedRoute === props.routePath)
  ) {
    void loadPage();
  }
}

onMounted(() => window.addEventListener('enlearn:ai-page-applied', handleAiPageApplied));

onBeforeUnmount(() => {
  window.removeEventListener('enlearn:ai-page-applied', handleAiPageApplied);
  clearAiPageContext(page.value?.id);
});
</script>
