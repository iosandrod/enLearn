<template>
  <div class="markdown" v-html="html" />
</template>

<script setup lang="ts">
defineProps<{
  html: string;
}>();
</script>
