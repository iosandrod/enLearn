<template>
  <LowCodeVisualDesigner :key="pageCode" :code="pageCode" :service-api="serviceApi" />
</template>

<script setup lang="ts">
const route = useRoute();
const serviceApi = useServiceApi();
const pageCode = computed(() => String(route.params.code ?? ''));
</script>
