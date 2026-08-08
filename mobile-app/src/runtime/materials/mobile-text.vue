<template>
  <div :class="['mobile-text-block', `is-${block.tone ?? 'default'}`]" :style="blockStyle">
    <span v-if="block.title" class="block-title">{{ block.title }}</span>
    <span class="block-copy">{{ block.content }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from '@vue/runtime-core';
import { resolveMobileBlockStyle } from '../block-style';
import type { MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();
const blockStyle = computed(() => resolveMobileBlockStyle(props.block.style));
</script>

<style scoped>
.mobile-text-block {
  padding-top: 18px;
  padding-right: 16px;
  padding-bottom: 18px;
  padding-left: 16px;
  display: flex;
  flex-direction: column;
  background-color: #17212b;
  border-radius: 6px;
}

.mobile-text-block.is-muted {
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.mobile-text-block.is-success {
  background-color: #0b644b;
}

.mobile-text-block.is-warning {
  background-color: #815700;
}

.block-title {
  color: #ffffff;
  font-size: 20px;
  line-height: 28px;
  font-weight: bold;
}

.block-copy {
  margin-top: 6px;
  color: #dfe6ec;
  font-size: 13px;
  line-height: 21px;
}

.mobile-text-block.is-muted .block-title,
.mobile-text-block.is-muted .block-copy {
  color: #17212b;
}
</style>
