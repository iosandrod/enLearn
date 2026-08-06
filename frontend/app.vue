<template>
  <component :is="layoutComponent" v-if="layoutComponent" :key="layoutKey">
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Suspense>
        <template #default>
          <RouteCacheOutlet
            :route-component="Component"
            :keep-alive="shouldKeepAliveRoute(viewRoute)"
            :cache-key="resolveRouteCacheKey(viewRoute)"
            :cache-invalidation="routeCacheInvalidation"
            :route-key="resolveRouteKey(viewRoute)"
            :max="dashboardKeepAliveMax"
          />
        </template>
      </Suspense>
    </RouterView>
  </component>
  <RouterView v-else v-slot="{ Component, route: viewRoute }">
    <Suspense>
      <template #default>
        <component :is="Component" :key="viewRoute.fullPath" />
      </template>
    </Suspense>
  </RouterView>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import RouteCacheOutlet from './components/RouteCacheOutlet.vue';
import DashboardLayout from './layouts/dashboard.vue';
import DefaultLayout from './layouts/default.vue';
import {
  loadSystemSettings,
  provideAppSystemSettings,
  resetSystemSettings,
} from './composables/useSystemSettings';
import { useRouteCache } from './composables/useRouteCache';

const route = useRoute();
const auth = useAuth();
const routeCache = useRouteCache();
provideAppSystemSettings();

watch(
  () => auth.user.value?.id ?? '',
  (userId, previousUserId) => {
    if (userId === previousUserId) return;
    if (!userId) {
      resetSystemSettings();
      return;
    }
    void loadSystemSettings(true).catch((error) => {
      console.warn('System settings reload failed.', error);
    });
  },
);

const dashboardKeepAliveMax = 8;
const accountCacheScope = computed(() =>
  `${auth.activeAccount.value?.account_id ?? 'public'}:${auth.accountEpoch.value}`
);
const layoutKey = computed(() =>
  route.meta.layout === 'dashboard' ? `dashboard:${accountCacheScope.value}` : String(route.meta.layout ?? 'default')
);
const routeCacheInvalidation = computed(() => {
  const request = routeCache.invalidation.value;
  if (!request) return null;

  return {
    id: request.id,
    cacheKey: buildRouteCacheKey(request.path, request.previousVersion),
  };
});

const layoutComponent = computed(() => {
  if (route.meta.layout === false) return null;
  if (route.meta.layout === 'dashboard') return DashboardLayout;
  return DefaultLayout;
});

function shouldKeepAliveRoute(viewRoute: RouteLocationNormalizedLoaded) {
  return viewRoute.meta.keepAlive === true;
}

function buildRouteCacheKey(path: string, version = routeCache.getVersion(path)) {
  return `${accountCacheScope.value}:${path}:v${version}`;
}

function resolveRouteCacheKey(viewRoute: RouteLocationNormalizedLoaded) {
  return buildRouteCacheKey(viewRoute.path);
}

function resolveRouteKey(viewRoute: RouteLocationNormalizedLoaded) {
  return `${accountCacheScope.value}:${viewRoute.fullPath}:v${routeCache.getVersion(viewRoute.path)}`;
}
</script>
