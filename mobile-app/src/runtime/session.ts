import {
  getRuntimeConfig,
  readMobileStorage,
  removeMobileStorage,
  updateRuntimeAuth,
  writeMobileStorage,
} from '../config';
import { reactive } from '@vue/runtime-core';

import {
  createMobileAuthApi,
  type MobileAccountOption,
  type MobileAuthPayload,
} from './auth-api';
import { clearMobileNavigation } from './navigation';
import { clearRuntimeCache } from './runtime-cache';
import { clearOfflineQueue } from './offline-queue';

export const mobileSession = reactive<{
  ready: boolean;
  user: MobileAuthPayload['user'];
  profile: Record<string, unknown> | null;
  accounts: MobileAccountOption[];
  activeAccount: MobileAccountOption | null;
  permissions: string[];
}>({
  ready: false,
  user: null,
  profile: null,
  accounts: [],
  activeAccount: null,
  permissions: [],
});

let refreshRequest: Promise<string> | null = null;
let restoreRequest: Promise<boolean> | null = null;

function normalizePermissions(values: unknown) {
  return Array.isArray(values)
    ? values.map((value) => String(value).trim()).filter(Boolean)
    : [];
}

export function applyMobileSessionPayload(
  payload: MobileAuthPayload,
  preferredAccountId = getRuntimeConfig().accountId,
) {
  const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
  const activeAccount = payload.activeAccount
    ?? accounts.find((account) => account.account_id === preferredAccountId)
    ?? null;

  mobileSession.user = payload.user ?? null;
  mobileSession.profile = payload.profile ?? null;
  mobileSession.accounts = accounts;
  mobileSession.activeAccount = activeAccount;
  mobileSession.permissions = normalizePermissions(payload.permissions);
  mobileSession.ready = true;
}

export async function saveMobileAuthSession(
  payload: MobileAuthPayload,
  preferredAccountId = getRuntimeConfig().accountId,
) {
  const current = getRuntimeConfig();
  const accessToken = payload.session?.access_token ?? current.accessToken;
  const accountId = payload.activeAccount?.account_id
    ?? preferredAccountId
    ?? current.accountId;
  const refreshToken = payload.session?.refresh_token;
  const userId = payload.user?.id ?? current.userId;

  updateRuntimeAuth(accessToken, accountId, userId);
  applyMobileSessionPayload(payload, accountId);

  const writes: Promise<void>[] = [];
  if (accessToken) writes.push(writeMobileStorage('accessToken', accessToken));
  if (accountId) writes.push(writeMobileStorage('accountId', accountId));
  if (refreshToken) writes.push(writeMobileStorage('refreshToken', refreshToken));
  if (userId) writes.push(writeMobileStorage('userId', userId));
  await Promise.all(writes);
  return { accessToken, accountId, userId };
}

export async function refreshMobileSession() {
  if (refreshRequest) return refreshRequest;

  refreshRequest = (async () => {
    const refreshToken = await readMobileStorage('refreshToken');
    if (!refreshToken) throw new Error('登录会话已过期，请重新登录。');

    const payload = await createMobileAuthApi().refreshSession(refreshToken);
    const { accessToken } = await saveMobileAuthSession(
      payload,
      getRuntimeConfig().accountId,
    );
    if (!accessToken) throw new Error('登录会话刷新失败，请重新登录。');
    return accessToken;
  })().finally(() => {
    refreshRequest = null;
  });

  return refreshRequest;
}

export async function restoreMobileSession(force = false) {
  if (!force && mobileSession.ready) return Boolean(mobileSession.activeAccount);
  if (restoreRequest) return restoreRequest;

  restoreRequest = (async () => {
    const config = getRuntimeConfig();
    if (!config.accessToken || !config.accountId) {
      mobileSession.ready = true;
      return false;
    }

    const authApi = createMobileAuthApi();
    try {
      const payload = await authApi.getCurrentSession();
      applyMobileSessionPayload(payload, config.accountId);
      return Boolean(mobileSession.activeAccount);
    } catch (error) {
      const status = Number((error as { status?: unknown })?.status ?? 0);
      if (status !== 401) throw error;
      await refreshMobileSession();
      const payload = await authApi.getCurrentSession();
      applyMobileSessionPayload(payload, getRuntimeConfig().accountId);
      return Boolean(mobileSession.activeAccount);
    }
  })().finally(() => {
    restoreRequest = null;
  });

  return restoreRequest;
}

export function hasMobilePermission(permissionCode: unknown) {
  const code = typeof permissionCode === 'string' ? permissionCode.trim() : '';
  if (!code || !mobileSession.ready) return true;
  return mobileSession.permissions.includes(code);
}

export async function clearMobileSession() {
  const userId = mobileSession.user?.id ?? getRuntimeConfig().userId;
  const accountId = getRuntimeConfig().accountId;
  await Promise.all([
    clearRuntimeCache(userId),
    accountId && userId ? clearOfflineQueue(accountId, userId) : Promise.resolve(),
  ]);
  updateRuntimeAuth('', '', '');
  clearMobileNavigation();
  mobileSession.ready = true;
  mobileSession.user = null;
  mobileSession.profile = null;
  mobileSession.accounts = [];
  mobileSession.activeAccount = null;
  mobileSession.permissions = [];
  await Promise.all([
    removeMobileStorage('accessToken'),
    removeMobileStorage('refreshToken'),
    removeMobileStorage('accountId'),
    removeMobileStorage('userId'),
  ]);
}
