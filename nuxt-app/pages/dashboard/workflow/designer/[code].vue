<template>
  <WorkflowDesignerRoute />
</template>

<script setup lang="ts">
import WorkflowDesignerRoute from '../designer.vue';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});
</script>
