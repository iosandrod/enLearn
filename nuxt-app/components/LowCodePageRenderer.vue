<template>
  <component :is="PackageLowCodePageRendererView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodePageRenderer as PackageLowCodePageRenderer } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodePageRendererView = PackageLowCodePageRenderer as any;
</script>
