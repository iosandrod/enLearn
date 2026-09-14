import { reactive } from '@vue/runtime-core';

import { getRuntimeConfig } from '../config';
import { readNavigationCache, writeNavigationCache } from './runtime-cache';
import type { MobileServiceApi } from './service-api';
import {
  buildMobileMenu,
  flattenMobileNavigation,
  normalizeMobileNavigationRows,
  resolveMobileRuntimePath,
  type MobileNavigationNode,
  type MobileNavigationRow,
} from './navigation-model';

export const mobileNavigation = reactive<{
  routes: MobileNavigationRow[];
  menu: MobileNavigationNode[];
  loading: boolean;
  loadedAccountId: string;
  error: string;
}>({
  routes: [],
  menu: [],
  loading: false,
  loadedAccountId: '',
  error: '',
});

let navigationRequest: Promise<MobileNavigationRow[]> | null = null;

export function clearMobileNavigation() {
  mobileNavigation.routes = [];
  mobileNavigation.menu = [];
  mobileNavigation.loading = false;
  mobileNavigation.loadedAccountId = '';
  mobileNavigation.error = '';
  navigationRequest = null;
}

export async function loadMobileNavigation(serviceApi: MobileServiceApi, force = false) {
  const { accountId, userId } = getRuntimeConfig();
  if (!accountId || !userId) {
    clearMobileNavigation();
    return [];
  }
  if (!force && mobileNavigation.loadedAccountId === accountId && mobileNavigation.routes.length) {
    return mobileNavigation.routes;
  }
  if (navigationRequest) return navigationRequest;

  mobileNavigation.loading = true;
  mobileNavigation.error = '';
  navigationRequest = serviceApi.listNavigationRoutes()
    .then(async (values) => {
      const routes = normalizeMobileNavigationRows(values);
      mobileNavigation.routes = routes;
      mobileNavigation.menu = buildMobileMenu(routes);
      mobileNavigation.loadedAccountId = accountId;
      await writeNavigationCache(accountId, userId, routes);
      return routes;
    })
    .catch(async (error) => {
      const cached = await readNavigationCache(accountId, userId);
      const cachedRoutes = normalizeMobileNavigationRows(cached?.data ?? []);
      if (cachedRoutes.length) {
        mobileNavigation.routes = cachedRoutes;
        mobileNavigation.menu = buildMobileMenu(cachedRoutes);
        mobileNavigation.loadedAccountId = accountId;
        mobileNavigation.error = '';
        return cachedRoutes;
      }
      mobileNavigation.routes = [];
      mobileNavigation.menu = [];
      mobileNavigation.loadedAccountId = '';
      mobileNavigation.error = error instanceof Error ? error.message : '菜单加载失败';
      throw error;
    })
    .finally(() => {
      mobileNavigation.loading = false;
      navigationRequest = null;
    });

  return navigationRequest;
}

export function firstMobilePageCode() {
  return flattenMobileNavigation(mobileNavigation.menu).find((node) => node.page_code)?.page_code ?? '';
}

export function navigationRuntimePath(target: string) {
  return resolveMobileRuntimePath(target, mobileNavigation.routes);
}
