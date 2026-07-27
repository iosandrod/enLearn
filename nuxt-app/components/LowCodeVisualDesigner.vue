<template>
  <component :is="PackageLowCodeVisualDesignerView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeVisualDesigner as PackageLowCodeVisualDesigner } from '@enlearn/lowcode-framework/designer';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeVisualDesignerView = PackageLowCodeVisualDesigner as any;
</script>
