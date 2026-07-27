<template>
  <component :is="PackageLowCodeGridView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeGrid as PackageLowCodeGrid } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeGridView = PackageLowCodeGrid as any;
</script>
