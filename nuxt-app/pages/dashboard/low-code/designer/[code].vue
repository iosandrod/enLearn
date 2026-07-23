<template>
  <LowCodeVisualDesigner :code="String(route.params.code ?? '')" />
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const route = useRoute();
</script>
