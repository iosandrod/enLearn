<template>
  <component :is="PackageLowCodeBlockRendererView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeBlockRenderer as PackageLowCodeBlockRenderer } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeBlockRendererView = PackageLowCodeBlockRenderer as any;
</script>
