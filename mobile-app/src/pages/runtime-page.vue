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
} from '../config';
import { mobileNetwork } from '../runtime/network-status';
import { readPageCache, writePageCache } from '../runtime/runtime-cache';
import {
  firstMobilePageCode,
  loadMobileNavigation,
  mobileNavigation,
  navigationRuntimePath,
} from '../runtime/navigation';
import { clearMobileSession } from '../runtime/session';
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
  return routeCode;
}

function readRouteTarget() {
  const value = route.query.target;
  return typeof value === 'string' ? value.trim() : '';
}

function readRoutePageId() {
  const value = route.query.pageId ?? route.query.page_id;
  return typeof value === 'string' ? value.trim() : '';
}

function readSourcePageCode() {
  const value = route.query.fromPage ?? route.query.from_page;
  return typeof value === 'string' ? value.trim() : '';
}

function runtimePath(code: string) {
  return code ? `/page/${encodeURIComponent(code)}` : '/';
}

async function openLogin(code: string, clearSession = false) {
  if (clearSession) {
    await clearMobileSession();
  }

  await router.replace({
    path: '/login',
    query: {
      redirect: readRouteTarget()
        ? `/runtime?target=${encodeURIComponent(readRouteTarget())}`
        : runtimePath(code),
    },
  });
}

async function loadPage() {
  let code = readRouteCode();
  const routeTarget = readRouteTarget();
  const pageId = readRoutePageId();
  errorMessage.value = '';

  const config = getRuntimeConfig();
  if (!config.accessToken || !config.accountId) {
    await openLogin(code || config.pageCode);
    return;
  }

  loading.value = true;
  try {
    await loadMobileNavigation(serviceApi);
    if (!code) {
      const configuredCode = mobileNavigation.routes.some((item) => item.page_code === config.pageCode)
        ? config.pageCode
        : '';
      code = configuredCode || firstMobilePageCode();
      if (code) {
        await router.replace(runtimePath(code));
        return;
      }
      throw new Error('当前账号没有可用的移动端业务菜单。');
    }
    const loadedPage = pageId
      ? await serviceApi.getPageById(pageId, readSourcePageCode())
      : routeTarget
        ? await serviceApi.getPageByRoute(routeTarget, readSourcePageCode())
        : await serviceApi.getPage(code);
    page.value = loadedPage;
    await writePageCache(config.accountId, config.userId, loadedPage);
  } catch (error) {
    if (isMobileAuthenticationError(error)) {
      page.value = null;
      await openLogin(code, true);
      return;
    }
    const cached = await readPageCache(config.accountId, config.userId, {
      id: pageId || undefined,
      code: code || undefined,
    });
    if (cached?.data) {
      page.value = cached.data;
      errorMessage.value = '';
      return;
    }
    page.value = null;
    const reason = error instanceof Error ? error.message : '未知错误';
    errorMessage.value = mobileNetwork.status === 'offline'
      ? `当前网络不可用，且该页面尚无离线缓存。${reason}`
      : reason;
  } finally {
    loading.value = false;
  }
}

function handleNavigate(path: string) {
  if (!path) return;
  const target = navigationRuntimePath(path);
  if (target) router.push(target);
  else if (path.startsWith('/')) {
    router.push(`/runtime?target=${encodeURIComponent(path)}`);
  } else {
    errorMessage.value = `该页面尚未配置移动端路由：${path}`;
  }
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
watch(
  () => `${String(route.params.code ?? '')}:${route.fullPath}`,
  loadPage,
);
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
