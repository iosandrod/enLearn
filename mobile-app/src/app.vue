<template>
  <div id="root" class="app-shell" @layout="handleShellLayout">
    <div
      v-if="!isPublicPage && (network.status === 'offline' || offlineQueue.pending || offlineQueue.failed || offlineQueue.conflicts)"
      :class="['network-banner', { 'has-failure': offlineQueue.failed > 0 || offlineQueue.conflicts > 0 }]"
    >
      <span class="network-banner-text">{{ syncBannerText }}</span>
      <button
        v-if="network.status === 'online' && offlineQueue.failed"
        class="network-banner-action"
        :disabled="offlineQueue.syncing"
        @click="retryOfflineWrites"
      >
        <span class="network-banner-action-text">重试</span>
      </button>
      <button
        v-if="offlineQueue.conflicts"
        class="network-banner-action"
        @click="conflictDialogOpen = true"
      >
        <span class="network-banner-action-text">处理</span>
      </button>
    </div>
    <template v-if="isPublicPage">
      <router-view @page-title-change="setPageTitle" />
    </template>

    <template v-else>
      <div class="app-header">
        <button
          v-if="!wideLayout && !showBackButton"
          class="header-icon-button"
          aria-label="打开菜单"
          @click="menuOpen = true"
        >
          <span class="header-icon">☰</span>
        </button>

        <button
          v-else-if="!wideLayout"
          class="header-icon-button"
          aria-label="返回"
          @click="goBack"
        >
          <span class="header-icon back-icon">‹</span>
        </button>

        <button
          v-else
          class="brand-mark-small"
          aria-label="返回工作台"
          @click="goHome"
        >
          <span class="brand-mark-small-text">M</span>
        </button>

        <div class="app-title-group">
          <span class="app-kicker">MANUFACTURING MES</span>
          <span class="app-title" :numberOfLines="1" ellipsizeMode="tail">{{ pageTitle }}</span>
        </div>

        <button class="header-icon-button" aria-label="刷新页面" @click="refreshPage">
          <span class="header-icon refresh-icon">↻</span>
        </button>

        <button
          v-if="!wideLayout"
          class="header-icon-button header-account-button"
          aria-label="账户与账套"
          @click="menuOpen = true"
        >
          <span class="header-account-text">{{ userInitial }}</span>
        </button>
      </div>

      <div class="app-workspace">
        <div v-if="wideLayout" class="desktop-sidebar">
          <div class="sidebar-brand">
            <span class="sidebar-brand-title">工厂制造管理</span>
            <span class="sidebar-brand-copy">生产现场移动工作台</span>
          </div>
          <div class="sidebar-search-control">
            <span class="sidebar-search-icon">⌕</span>
            <input
              class="sidebar-search-input"
              type="text"
              :value="menuFilter"
              placeholder="搜索功能"
              @change="menuFilter = readInputEventValue($event)"
            />
          </div>
          <div class="sidebar-menu-scroll">
            <MobileMenuTree
              :nodes="filteredMenu"
              :active-page-code="activePageCode"
              :force-expanded="Boolean(menuFilter.trim())"
              @select="openMenuNode"
            />
            <div v-if="navigation.loading" class="menu-state">
              <span class="menu-state-text">正在同步菜单...</span>
            </div>
            <div v-else-if="navigation.error" class="menu-state is-error">
              <span class="menu-state-text">{{ navigation.error }}</span>
              <button class="menu-state-action" @click="reloadMenu">
                <span class="menu-state-action-text">重试</span>
              </button>
            </div>
            <div v-else-if="!filteredMenu.length" class="menu-state">
              <span class="menu-state-text">{{ menuFilter ? '没有匹配的功能' : '暂无可用菜单' }}</span>
            </div>
          </div>
          <div class="sidebar-user">
            <div class="user-avatar">
              <span class="user-avatar-text">{{ userInitial }}</span>
            </div>
            <div class="user-copy">
              <span class="user-name" :numberOfLines="1">{{ loginAccount || '当前用户' }}</span>
              <span class="user-account" :numberOfLines="1">账套 {{ shortAccountId }}</span>
            </div>
            <button class="logout-button" aria-label="退出登录" @click="signOut">
              <span class="logout-symbol">⇥</span>
            </button>
          </div>
        </div>

        <div class="app-body">
          <router-view
            :key="`${route.path}:${contentVersion}`"
            @page-title-change="setPageTitle"
          />
        </div>
      </div>

      <dialog
        v-if="menuOpen && !wideLayout"
        class="mobile-menu-dialog"
        transparent
        :animated="false"
        animation-type="none"
        @request-close="menuOpen = false"
      >
        <div class="mobile-menu-mask" @click="menuOpen = false">
          <div class="mobile-menu-panel" @click.stop>
            <div class="mobile-menu-heading">
              <div class="mobile-menu-brand">
                <div class="brand-mark-small">
                  <span class="brand-mark-small-text">M</span>
                </div>
                <div class="mobile-menu-brand-copy">
                  <span class="mobile-menu-title">工厂制造管理</span>
                  <span class="mobile-menu-subtitle">MES 移动工作台</span>
                </div>
              </div>
              <button class="header-icon-button" aria-label="关闭菜单" @click="menuOpen = false">
                <span class="header-icon close-icon">×</span>
              </button>
            </div>

            <div class="sidebar-search-control mobile-search-control">
              <span class="sidebar-search-icon">⌕</span>
              <input
                class="sidebar-search-input"
                type="text"
                :value="menuFilter"
                placeholder="搜索功能"
                @change="menuFilter = readInputEventValue($event)"
              />
            </div>

            <div class="mobile-menu-scroll">
              <MobileMenuTree
                :nodes="filteredMenu"
                :active-page-code="activePageCode"
                :force-expanded="Boolean(menuFilter.trim())"
                @select="openMenuNode"
              />
              <div v-if="navigation.loading" class="menu-state">
                <span class="menu-state-text">正在同步菜单...</span>
              </div>
              <div v-else-if="navigation.error" class="menu-state is-error">
                <span class="menu-state-text">{{ navigation.error }}</span>
                <button class="menu-state-action" @click="reloadMenu">
                  <span class="menu-state-action-text">重试</span>
                </button>
              </div>
              <div v-else-if="!filteredMenu.length" class="menu-state">
                <span class="menu-state-text">{{ menuFilter ? '没有匹配的功能' : '暂无可用菜单' }}</span>
              </div>
            </div>

            <div class="sidebar-user mobile-user">
              <div class="user-avatar">
                <span class="user-avatar-text">{{ userInitial }}</span>
              </div>
              <div class="user-copy">
                <span class="user-name" :numberOfLines="1">{{ loginAccount || '当前用户' }}</span>
                <span class="user-account" :numberOfLines="1">账套 {{ shortAccountId }}</span>
              </div>
              <button class="logout-button" aria-label="退出登录" @click="signOut">
                <span class="logout-symbol">⇥</span>
              </button>
            </div>

            <div v-if="session.accounts.length > 1" class="mobile-account-switcher">
              <span class="account-switcher-label">切换账套</span>
              <button
                v-for="account in session.accounts"
                :key="account.account_id"
                :class="[
                  'account-switcher-item',
                  { 'is-active': account.account_id === activeAccountId },
                ]"
                :disabled="switchingAccount || account.account_id === activeAccountId"
                @click="switchAccount(account.account_id)"
              >
                <span class="account-switcher-code">{{ account.code || '--' }}</span>
                <span class="account-switcher-name">{{ account.name || '未命名账套' }}</span>
                <span v-if="account.account_id === activeAccountId" class="account-switcher-active">当前</span>
              </button>
            </div>
          </div>
        </div>
      </dialog>

      <dialog
        v-if="conflictDialogOpen"
        class="sync-conflict-dialog"
        transparent
        :animated="false"
        animation-type="none"
        @request-close="conflictDialogOpen = false"
      >
        <div class="sync-conflict-mask" @click="conflictDialogOpen = false">
          <div class="sync-conflict-panel" @click.stop>
            <span class="sync-conflict-title">发现数据冲突</span>
            <span class="sync-conflict-copy">
              {{ offlineQueue.conflicts }} 条离线操作与服务器上的最新数据不一致。为避免覆盖他人修改，系统已暂停这些操作。
            </span>
            <span class="sync-conflict-note">请先刷新业务页面核对最新数据，再重新提交需要保留的修改。</span>
            <div class="sync-conflict-actions">
              <button class="sync-conflict-action" @click="conflictDialogOpen = false">
                <span class="sync-conflict-action-text">稍后处理</span>
              </button>
              <button class="sync-conflict-action is-danger" @click="discardConflicts">
                <span class="sync-conflict-action-text is-danger">放弃冲突操作</span>
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from '@vue/runtime-core';
import type { HippyLayoutEvent } from '@hippy/vue-next';
import { useRoute, useRouter } from '@hippy/vue-router-next-history';

import MobileMenuTree from './components/mobile-menu-tree.vue';
import {
  getRuntimeConfig,
  readMobileStorage,
} from './config';
import { createMobileAuthApi } from './runtime/auth-api';
import { readInputEventValue } from './runtime/mobile-form';
import {
  clearMobileNavigation,
  firstMobilePageCode,
  loadMobileNavigation,
  mobileNavigation,
} from './runtime/navigation';
import { filterMobileMenu, type MobileNavigationNode } from './runtime/navigation-model';
import { parentMobilePageCode } from './runtime/navigation-model';
import {
  createMobileServiceApi,
  isMobileAuthenticationError,
} from './runtime/service-api';
import {
  applyMobileSessionPayload,
  clearMobileSession,
  mobileSession,
  restoreMobileSession,
  saveMobileAuthSession,
} from './runtime/session';
import { registerMobileBackHandler } from './runtime/mobile-back';
import { mobileNetwork, startMobileNetworkMonitor } from './runtime/network-status';
import {
  discardConflictedOfflineRequests,
  flushOfflineQueue,
  mobileOfflineQueue,
  refreshOfflineQueueState,
  retryFailedOfflineRequests,
} from './runtime/offline-queue';
import {
  registerMobilePushDevice,
  unregisterMobilePushDevice,
} from './runtime/push-notifications';

const route = useRoute();
const router = useRouter();
const serviceApi = createMobileServiceApi();
const authApi = createMobileAuthApi();
const navigation = mobileNavigation;
const runtimePageTitle = ref('');
const menuOpen = ref(false);
const menuFilter = ref('');
const shellWidth = ref(0);
const contentVersion = ref(0);
const loginAccount = ref('');
const switchingAccount = ref(false);
const conflictDialogOpen = ref(false);
const session = mobileSession;
const network = mobileNetwork;
const offlineQueue = mobileOfflineQueue;

const isLoginPage = computed(() => route.path === '/login');
const isPublicPage = computed(() => isLoginPage.value || route.meta.public === true);
const activePageCode = computed(() => {
  const value = route.params.code;
  return typeof value === 'string' ? value : '';
});
const wideLayout = computed(() => shellWidth.value >= 900);
const filteredMenu = computed(() => filterMobileMenu(navigation.menu, menuFilter.value));
const pageTitle = computed(() => runtimePageTitle.value || String(route.meta.title ?? 'MES 工作台'));
const activeAccountId = computed(() => getRuntimeConfig().accountId);
const userInitial = computed(() => (
  String(session.profile?.nickname ?? session.profile?.full_name ?? loginAccount.value)
    .trim()
    .slice(0, 1) || 'M'
).toUpperCase());
const showBackButton = computed(() => {
  if (route.path === '/' || !activePageCode.value) return false;
  return Boolean(route.query.fromPage)
    || Boolean(parentMobilePageCode(activePageCode.value, navigation.routes));
});
const shortAccountId = computed(() => {
  const accountId = getRuntimeConfig().accountId;
  if (!accountId) return '--';
  return accountId.length > 10 ? `${accountId.slice(0, 6)}...${accountId.slice(-4)}` : accountId;
});
const syncBannerText = computed(() => {
  if (network.status === 'offline') {
    return offlineQueue.pending
      ? `当前离线，${offlineQueue.pending} 条操作等待同步`
      : '当前处于离线模式，页面显示最近一次同步的数据';
  }
  if (offlineQueue.syncing) return `正在同步 ${offlineQueue.pending} 条离线操作`;
  if (offlineQueue.conflicts) return `${offlineQueue.conflicts} 条离线操作存在数据冲突`;
  if (offlineQueue.failed) return `${offlineQueue.failed} 条离线操作同步失败`;
  return offlineQueue.pending ? `${offlineQueue.pending} 条离线操作等待同步` : '';
});

function handleShellLayout(event: HippyLayoutEvent) {
  if (typeof event.width === 'number' && Number.isFinite(event.width)) {
    shellWidth.value = event.width;
  }
}

function setPageTitle(title: string) {
  runtimePageTitle.value = title.trim();
}

function openMenuNode(node: MobileNavigationNode) {
  if (!node.page_code) return;
  menuOpen.value = false;
  menuFilter.value = '';
  const target = `/page/${encodeURIComponent(node.page_code)}`;
  if (route.path === target) refreshPage();
  else router.push(target);
}

function refreshPage() {
  contentVersion.value += 1;
}

function goBack() {
  const fromPage = typeof route.query.fromPage === 'string' ? route.query.fromPage.trim() : '';
  const parentCode = parentMobilePageCode(activePageCode.value, navigation.routes);
  if (fromPage || parentCode) {
    router.replace(`/page/${encodeURIComponent(fromPage || parentCode)}`);
    return;
  }
  router.back();
}

function goHome() {
  const pageCode = firstMobilePageCode();
  router.push(pageCode ? `/page/${encodeURIComponent(pageCode)}` : '/');
}

async function reloadMenu() {
  try {
    await loadMobileNavigation(serviceApi, true);
  } catch (error) {
    if (isMobileAuthenticationError(error)) await requireLogin();
  }
}

async function retryOfflineWrites() {
  const config = getRuntimeConfig();
  if (!config.accountId || !config.userId || offlineQueue.syncing) return;
  await retryFailedOfflineRequests(config.accountId, config.userId);
  const result = await flushOfflineQueue(serviceApi, config.accountId, config.userId, true);
  if (result.completed > 0) refreshPage();
}

async function discardConflicts() {
  const config = getRuntimeConfig();
  if (!config.accountId || !config.userId) return;
  await discardConflictedOfflineRequests(config.accountId, config.userId);
  conflictDialogOpen.value = false;
  refreshPage();
}

async function requireLogin() {
  await clearMobileSession();
  const redirect = route.path.startsWith('/page/') ? route.path : '/';
  await router.replace({ path: '/login', query: { redirect } });
}

async function signOut() {
  const config = getRuntimeConfig();
  await unregisterMobilePushDevice(serviceApi, config.userId, config.accountId).catch(() => undefined);
  try {
    await authApi.signOut();
  } catch {
    // Local session cleanup must still complete when the remote session expired.
  }
  await clearMobileSession();
  menuOpen.value = false;
  await router.replace('/login');
}

async function synchronizeNavigation() {
  if (isPublicPage.value) return;
  const config = getRuntimeConfig();
  if (!config.accessToken || !config.accountId) {
    await requireLogin();
    return;
  }

  try {
    const restored = await restoreMobileSession();
    if (!restored) {
      await requireLogin();
      return;
    }
    await loadMobileNavigation(serviceApi);
    await refreshOfflineQueueState(config.accountId, config.userId);
    await registerMobilePushDevice(serviceApi, config.userId, config.accountId).catch(() => undefined);
  } catch (error) {
    if (isMobileAuthenticationError(error)) await requireLogin();
  }
}

async function switchAccount(accountId: string) {
  if (!accountId || accountId === activeAccountId.value || switchingAccount.value) return;
  switchingAccount.value = true;
  try {
    const payload = await authApi.selectAccount(accountId);
    await saveMobileAuthSession(payload, accountId);
    applyMobileSessionPayload(payload, accountId);
    clearMobileNavigation();
    menuFilter.value = '';
    await loadMobileNavigation(serviceApi, true);
    const pageCode = firstMobilePageCode();
    menuOpen.value = false;
    await router.replace(pageCode ? `/page/${encodeURIComponent(pageCode)}` : '/');
    refreshPage();
  } catch (error) {
    if (isMobileAuthenticationError(error)) await requireLogin();
    else navigation.error = error instanceof Error ? error.message : '账套切换失败';
  } finally {
    switchingAccount.value = false;
  }
}

watch(() => route.path, () => {
  runtimePageTitle.value = '';
  menuOpen.value = false;
  conflictDialogOpen.value = false;
  void synchronizeNavigation();
});

watch(wideLayout, (isWide) => {
  if (isWide) menuOpen.value = false;
});

const unregisterBackHandler = registerMobileBackHandler(() => {
  if (conflictDialogOpen.value) {
    conflictDialogOpen.value = false;
    return true;
  }
  if (!menuOpen.value) return false;
  menuOpen.value = false;
  return true;
});
const stopNetworkMonitor = startMobileNetworkMonitor();

onMounted(async () => {
  loginAccount.value = await readMobileStorage('loginAccount');
  await synchronizeNavigation();
});
onBeforeUnmount(() => {
  unregisterBackHandler();
  stopNetworkMonitor();
});
</script>

<style>
#root,
.app-shell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background-color: #edf1f3;
}

.app-header {
  height: 64px;
  min-height: 64px;
  padding-right: 10px;
  padding-left: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #ffffff;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #d9e0e4;
}

.network-banner {
  min-height: 30px;
  padding-right: 12px;
  padding-left: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #fff1cc;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #e4c571;
}

.network-banner-text {
  color: #6f4b00;
  font-size: 11px;
  line-height: 17px;
  text-align: center;
}

.network-banner.has-failure {
  background-color: #ffe3df;
  border-bottom-color: #d99086;
}

.network-banner.has-failure .network-banner-text {
  color: #7d2923;
}

.network-banner-action {
  height: 24px;
  margin-left: 10px;
  padding-right: 10px;
  padding-left: 10px;
  align-items: center;
  justify-content: center;
  background-color: #8f3028;
  border-radius: 4px;
}

.network-banner-action-text {
  color: #ffffff;
  font-size: 11px;
  font-weight: bold;
}

.sync-conflict-dialog {
  width: 100%;
  height: 100%;
}

.sync-conflict-mask {
  flex: 1;
  padding: 18px;
  align-items: center;
  justify-content: center;
  background-color: rgba(13, 25, 34, 0.52);
}

.sync-conflict-panel {
  width: 100%;
  max-width: 420px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
}

.sync-conflict-title {
  color: #792c27;
  font-size: 17px;
  line-height: 24px;
  font-weight: bold;
}

.sync-conflict-copy,
.sync-conflict-note {
  margin-top: 9px;
  color: #536772;
  font-size: 13px;
  line-height: 20px;
}

.sync-conflict-note {
  padding: 10px;
  color: #6b4b00;
  background-color: #fff3cf;
  border-left-width: 3px;
  border-left-style: solid;
  border-left-color: #d9aa32;
}

.sync-conflict-actions {
  margin-top: 18px;
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
}

.sync-conflict-action {
  min-width: 88px;
  height: 40px;
  margin-left: 8px;
  padding-right: 12px;
  padding-left: 12px;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 4px;
}

.sync-conflict-action.is-danger {
  background-color: #a73b34;
}

.sync-conflict-action-text {
  color: #405761;
  font-size: 12px;
}

.sync-conflict-action-text.is-danger {
  color: #ffffff;
  font-weight: bold;
}

.app-title-group {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
  margin-left: 8px;
  display: flex;
  flex-direction: column;
}

.app-kicker {
  color: #71818b;
  font-size: 9px;
  line-height: 13px;
}

.app-title {
  color: #172b38;
  font-size: 18px;
  line-height: 25px;
  font-weight: bold;
}

.header-icon-button,
.logout-button {
  width: 42px;
  height: 42px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 5px;
}

.header-icon {
  color: #294554;
  font-size: 22px;
  line-height: 26px;
}

.refresh-icon {
  font-size: 26px;
}

.back-icon {
  font-size: 34px;
  line-height: 36px;
}

.header-account-button {
  margin-left: 6px;
  background-color: #2f687e;
}

.header-account-text {
  color: #ffffff;
  font-size: 13px;
  line-height: 18px;
  font-weight: bold;
}

.close-icon {
  font-size: 28px;
}

.brand-mark-small {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #cf453d;
  border-radius: 3px;
}

.brand-mark-small-text {
  color: #ffffff;
  font-size: 20px;
  line-height: 24px;
  font-weight: bold;
}

.app-workspace,
.app-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: row;
}

.app-body {
  flex-direction: column;
}

.desktop-sidebar {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-right-width: 1px;
  border-right-style: solid;
  border-right-color: #d7dee2;
}

.sidebar-brand {
  padding-top: 18px;
  padding-right: 16px;
  padding-bottom: 14px;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
}

.sidebar-brand-title {
  color: #173243;
  font-size: 17px;
  line-height: 24px;
  font-weight: bold;
}

.sidebar-brand-copy {
  margin-top: 3px;
  color: #7a8992;
  font-size: 11px;
  line-height: 16px;
}

.sidebar-search-control {
  height: 42px;
  margin-right: 12px;
  margin-bottom: 12px;
  margin-left: 12px;
  padding-right: 10px;
  padding-left: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #f2f5f6;
  border-width: 1px;
  border-style: solid;
  border-color: #d2dade;
  border-radius: 5px;
}

.sidebar-search-icon {
  margin-right: 7px;
  color: #617581;
  font-size: 20px;
  line-height: 22px;
}

.sidebar-search-input {
  flex: 1;
  min-width: 0;
  height: 40px;
  color: #263d4a;
  font-size: 13px;
  background-color: transparent;
  border-width: 0;
}

.sidebar-menu-scroll,
.mobile-menu-scroll {
  flex: 1;
  min-height: 0;
  padding-right: 8px;
  padding-bottom: 10px;
  padding-left: 8px;
  overflow-y: scroll;
}

.menu-state {
  padding: 20px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.menu-state-text {
  color: #75858f;
  font-size: 12px;
  line-height: 18px;
  text-align: center;
}

.menu-state.is-error .menu-state-text {
  color: #a13a34;
}

.menu-state-action {
  min-width: 72px;
  height: 36px;
  margin-top: 10px;
  align-items: center;
  justify-content: center;
  background-color: #e1edf2;
  border-radius: 4px;
}

.menu-state-action-text {
  color: #185d78;
  font-size: 12px;
}

.sidebar-user {
  min-height: 72px;
  padding-right: 12px;
  padding-left: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #e1e6e9;
}

.user-avatar {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: #2f687e;
  border-radius: 18px;
}

.user-avatar-text {
  color: #ffffff;
  font-size: 14px;
  font-weight: bold;
}

.user-copy {
  flex: 1;
  min-width: 0;
  margin-right: 8px;
  margin-left: 9px;
  display: flex;
  flex-direction: column;
}

.user-name {
  color: #263944;
  font-size: 12px;
  line-height: 18px;
  font-weight: bold;
}

.user-account {
  color: #7b8991;
  font-size: 9px;
  line-height: 14px;
}

.logout-button {
  width: 36px;
  height: 36px;
}

.logout-symbol {
  color: #8f413c;
  font-size: 21px;
  line-height: 24px;
}

.mobile-menu-dialog {
  width: 100%;
  height: 100%;
}

.mobile-menu-mask {
  flex: 1;
  display: flex;
  flex-direction: row;
  background-color: rgba(15, 27, 36, 0.48);
}

.mobile-menu-panel {
  width: 88%;
  max-width: 370px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
}

.mobile-menu-heading {
  min-height: 78px;
  padding-right: 12px;
  padding-left: 16px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #e1e6e9;
}

.mobile-menu-brand {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  align-items: center;
}

.mobile-menu-brand-copy {
  flex: 1;
  min-width: 0;
  margin-left: 11px;
  display: flex;
  flex-direction: column;
}

.mobile-menu-title {
  color: #173243;
  font-size: 15px;
  line-height: 22px;
  font-weight: bold;
}

.mobile-menu-subtitle {
  color: #74858f;
  font-size: 10px;
  line-height: 15px;
}

.mobile-search-control {
  margin-top: 12px;
}

.mobile-user {
  min-height: 76px;
}

.mobile-account-switcher {
  padding-top: 10px;
  padding-right: 12px;
  padding-bottom: 14px;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  border-top-width: 1px;
  border-top-style: solid;
  border-top-color: #e1e6e9;
}

.account-switcher-label {
  margin-bottom: 7px;
  color: #71818b;
  font-size: 10px;
  line-height: 15px;
  font-weight: bold;
}

.account-switcher-item {
  min-height: 42px;
  padding-right: 9px;
  padding-left: 9px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: #f3f6f7;
  border-radius: 4px;
}

.account-switcher-item + .account-switcher-item {
  margin-top: 6px;
}

.account-switcher-item.is-active {
  background-color: #e4f0f4;
}

.account-switcher-code {
  width: 44px;
  color: #2f687e;
  font-size: 11px;
  line-height: 17px;
  font-weight: bold;
}

.account-switcher-name {
  flex: 1;
  min-width: 0;
  color: #2e414c;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
}

.account-switcher-active {
  margin-left: 8px;
  color: #0b7957;
  font-size: 10px;
  line-height: 15px;
}
</style>
