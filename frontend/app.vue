<template>
  <component :is="layoutComponent" v-if="layoutComponent">
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Suspense>
        <template #default>
          <RouteCacheOutlet
            :route-component="Component"
            :keep-alive="shouldKeepAliveRoute(viewRoute)"
            :cache-key="resolveRouteCacheKey(viewRoute)"
            :route-key="viewRoute.fullPath"
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
import { computed } from 'vue';
import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router';
import RouteCacheOutlet from './components/RouteCacheOutlet.vue';
import DashboardLayout from './layouts/dashboard.vue';
import DefaultLayout from './layouts/default.vue';

const route = useRoute();
const dashboardKeepAliveMax = 8;

const layoutComponent = computed(() => {
  if (route.meta.layout === false) return null;
  if (route.meta.layout === 'dashboard') return DashboardLayout;
  return DefaultLayout;
});

function shouldKeepAliveRoute(viewRoute: RouteLocationNormalizedLoaded) {
  return viewRoute.meta.keepAlive === true;
}

function resolveRouteCacheKey(viewRoute: RouteLocationNormalizedLoaded) {
  return viewRoute.path;
}
</script>
