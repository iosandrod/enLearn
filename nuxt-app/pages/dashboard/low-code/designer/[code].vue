<template>
  <LowCodeVisualDesigner :key="pageCode" :code="pageCode" />
</template>

<script setup lang="ts">
const route = useRoute();
const pageCode = computed(() => String(route.params.code ?? ''));
</script>
