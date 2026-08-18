<template>
  <div class="mobile-stat-card">
    <span v-if="block.title" class="stat-title">{{ block.title }}</span>
    <div class="stat-grid">
      <div v-for="item in block.items ?? []" :key="item.label" class="stat-item">
        <span class="stat-value">{{ readValue(item) }}</span>
        <span class="stat-label">{{ item.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();

function readValue(item: { value?: unknown; field?: string; suffix?: string }) {
  const source = props.block.sourceKey ? props.resolvedData[props.block.sourceKey] : undefined;
  const record = source && typeof source === 'object' && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {};
  const value = item.field ? record[item.field] : item.value;
  return `${value ?? '--'}${item.suffix ?? ''}`;
}
</script>

<style scoped>
.mobile-stat-card {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.stat-title {
  margin-bottom: 12px;
  color: #17212b;
  font-size: 15px;
  line-height: 22px;
  font-weight: bold;
}

.stat-grid {
  display: flex;
  flex-direction: row;
}

.stat-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.stat-item + .stat-item {
  padding-left: 12px;
  border-left-width: 1px;
  border-left-style: solid;
  border-left-color: #e7ebee;
}

.stat-value {
  color: #17212b;
  font-size: 19px;
  line-height: 27px;
  font-weight: bold;
}

.stat-label {
  margin-top: 2px;
  color: #68737d;
  font-size: 11px;
  line-height: 17px;
}
</style>
