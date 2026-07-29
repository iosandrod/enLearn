<template>
  <component :is="layoutComponent" v-if="layoutComponent">
    <RouterView v-slot="{ Component, route: viewRoute }">
      <KeepAlive v-if="isDashboardRoute(viewRoute.path)" :max="8">
        <component :is="Component" :key="viewRoute.fullPath" />
      </KeepAlive>
      <component :is="Component" v-else :key="viewRoute.fullPath" />
    </RouterView>
  </component>
  <RouterView v-else />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import DashboardLayout from './layouts/dashboard.vue';
import DefaultLayout from './layouts/default.vue';

const route = useRoute();

const layoutComponent = computed(() => {
  if (route.meta.layout === false) return null;
  if (route.meta.layout === 'dashboard') return DashboardLayout;
  return DefaultLayout;
});

function isDashboardRoute(path: string) {
  return path.startsWith('/dashboard');
}
</script>
