<template>
  <LowCodeVisualDesigner :service-api="serviceApi" />
</template>

<script setup lang="ts">
const serviceApi = useServiceApi();
</script>
