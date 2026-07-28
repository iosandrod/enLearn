<template>
  <NuxtLayout>
    <NuxtPage :keepalive="pageKeepAlive" :page-key="getPageCacheKey" />
  </NuxtLayout>
</template>

<script setup lang="ts">
const route = useRoute();

const pageKeepAlive = computed(() =>
  route.path.startsWith('/dashboard') ? { max: 8 } : false
);

function getPageCacheKey(pageRoute: { fullPath: string }) {
  return pageRoute.fullPath;
}
</script>
