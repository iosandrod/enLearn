<template>
  <LowCodePageRenderer :page="signInLowCodePage" />
</template>

<script setup lang="ts">
import { signInLowCodePage } from '~/schemas/auth';

definePageMeta({ middleware: 'guest', layout: false });
</script>
