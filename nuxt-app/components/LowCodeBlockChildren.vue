<template>
  <component :is="PackageLowCodeBlockChildrenView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeBlockChildren as PackageLowCodeBlockChildren } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeBlockChildrenView = PackageLowCodeBlockChildren as any;
</script>
