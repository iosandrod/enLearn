<template>
  <component :is="PackageLowCodeFormLayoutView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeFormLayout as PackageLowCodeFormLayout } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeFormLayoutView = PackageLowCodeFormLayout as any;
</script>
