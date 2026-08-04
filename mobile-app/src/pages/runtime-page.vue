<template>
  <div class="runtime-screen">
    <div v-if="loading" class="runtime-state">
      <span class="runtime-state-title">正在加载页面</span>
      <span class="runtime-state-copy">正在解析 Schema 和页面数据。</span>
    </div>

    <div v-else-if="errorMessage" class="runtime-state is-error">
      <span class="runtime-state-title">页面加载失败</span>
      <span class="runtime-state-copy">{{ errorMessage }}</span>
      <button class="runtime-retry" @click="loadPage">
        <span class="runtime-retry-text">重新加载</span>
      </button>
    </div>

    <MobilePageRenderer
      v-else-if="page"
      :page="page"
      :service-api="serviceApi"
      @authentication-required="handleAuthenticationRequired"
      @page-title-change="handlePageTitleChange"
      @navigate="handleNavigate"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from '@vue/runtime-core';
import { useRoute, useRouter } from '@hippy/vue-router-next-history';

import MobilePageRenderer from '../runtime/mobile-page-renderer.vue';
import { createDemoPage } from '../runtime/demo-page';
import {
  createMobileServiceApi,
  isMobileAuthenticationError,
} from '../runtime/service-api';
import {
  getRuntimeConfig,
  removeMobileStorage,
  updateRuntimeAuth,
} from '../config';
import type { MobilePageRecord } from '../runtime/types';

const route = useRoute();
const router = useRouter();
const serviceApi = createMobileServiceApi();
const emit = defineEmits<{
  pageTitleChange: [title: string];
}>();
const loading = ref(false);
const errorMessage = ref('');
const page = ref<MobilePageRecord | null>(null);

function readRouteCode() {
  const value = route.params.code;
  const routeCode = typeof value === 'string' ? value.trim() : '';
  return routeCode || getRuntimeConfig().pageCode;
}

function runtimePath(code: string) {
  return code ? `/page/${encodeURIComponent(code)}` : '/';
}

async function openLogin(code: string, clearSession = false) {
  if (clearSession) {
    updateRuntimeAuth('', '');
    await Promise.all([
      removeMobileStorage('accessToken'),
      removeMobileStorage('refreshToken'),
      removeMobileStorage('accountId'),
    ]);
  }

  await router.replace({
    path: '/login',
    query: { redirect: runtimePath(code) },
  });
}

async function loadPage() {
  const code = readRouteCode();
  errorMessage.value = '';

  if (!code) {
    page.value = createDemoPage();
    return;
  }

  const config = getRuntimeConfig();
  if (!config.accessToken || !config.accountId) {
    await openLogin(code);
    return;
  }

  loading.value = true;
  try {
    page.value = await serviceApi.getPage(code);
  } catch (error) {
    if (isMobileAuthenticationError(error)) {
      page.value = null;
      await openLogin(code, true);
      return;
    }
    page.value = null;
    errorMessage.value = error instanceof Error ? error.message : '未知错误';
  } finally {
    loading.value = false;
  }
}

function handleNavigate(path: string) {
  if (!path) return;

  if (path.startsWith('/page/')) {
    router.push(path);
    return;
  }

  router.push(`/page/${encodeURIComponent(path.replace(/^\/+/, ''))}`);
}

async function handleAuthenticationRequired() {
  page.value = null;
  await openLogin(readRouteCode(), true);
}

function handlePageTitleChange(title: string) {
  const pageTitle = title.trim();
  if (pageTitle) emit('pageTitleChange', pageTitle);
}

onMounted(loadPage);
watch(() => route.params.code, loadPage);
</script>

<style scoped>
.runtime-screen {
  flex: 1;
  display: flex;
  min-height: 0;
}

.runtime-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 28px;
}

.runtime-state-title {
  color: #17212b;
  font-size: 18px;
  line-height: 26px;
  font-weight: bold;
}

.runtime-state-copy {
  margin-top: 8px;
  color: #68737d;
  font-size: 14px;
  line-height: 22px;
  text-align: center;
}

.runtime-state.is-error .runtime-state-title {
  color: #a12a2a;
}

.runtime-retry {
  height: 42px;
  margin-top: 18px;
  padding-right: 18px;
  padding-left: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #17212b;
  border-radius: 6px;
}

.runtime-retry-text {
  color: #ffffff;
  font-size: 14px;
}
</style>
