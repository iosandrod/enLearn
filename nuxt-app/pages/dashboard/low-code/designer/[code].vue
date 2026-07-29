<template>
  <LowCodeVisualDesigner :key="pageCode" :code="pageCode" />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const route = useRoute();
const pageCode = computed(() => String(route.params.code ?? ''));
</script>
