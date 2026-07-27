<template>
  <component :is="PackageLowCodeTreeItemView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeTreeItem as PackageLowCodeTreeItem } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeTreeItemView = PackageLowCodeTreeItem as any;
</script>
