<template>
  <div class="mobile-detail">
    <span v-if="block.title" class="detail-title">{{ block.title }}</span>
    <div v-for="field in block.fields ?? []" :key="field.field" class="detail-row">
      <span class="detail-label">{{ field.label }}</span>
      <span class="detail-value">{{ readField(field.field) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();

function readRecord() {
  const source = props.block.sourceKey ? props.resolvedData[props.block.sourceKey] : props.block.record;
  if (Array.isArray(source)) return source[0] ?? {};
  return source && typeof source === 'object' ? source as Record<string, unknown> : {};
}

function readField(field: string) {
  return String(readRecord()[field] ?? '--');
}
</script>

<style scoped>
.mobile-detail {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.detail-title {
  margin-bottom: 8px;
  color: #17212b;
  font-size: 16px;
  line-height: 24px;
  font-weight: bold;
}

.detail-row {
  min-height: 42px;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  border-bottom-width: 1px;
  border-bottom-style: solid;
  border-bottom-color: #edf0f2;
}

.detail-label {
  color: #68737d;
  font-size: 12px;
}

.detail-value {
  margin-left: 16px;
  color: #17212b;
  font-size: 13px;
  text-align: right;
}
</style>
