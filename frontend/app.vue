<template>
  <component :is="layoutComponent" v-if="layoutComponent">
    <RouterView v-slot="{ Component, route: viewRoute }">
      <Suspense>
        <template #default>
          <KeepAlive v-if="shouldKeepAliveRoute(viewRoute)" :max="dashboardKeepAliveMax">
            <component :is="Component" :key="resolveRouteCacheKey(viewRoute)" />
          </KeepAlive>
          <component v-else :is="Component" :key="viewRoute.fullPath" />
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
