<template>
  <component :is="PackageLowCodeFormFieldView" v-bind="$attrs" />
</template>

<script setup lang="ts">
import { LowCodeFormField as PackageLowCodeFormField } from '@enlearn/lowcode-framework/runtime';

defineOptions({
  inheritAttrs: false
});

const PackageLowCodeFormFieldView = PackageLowCodeFormField as any;
</script>
