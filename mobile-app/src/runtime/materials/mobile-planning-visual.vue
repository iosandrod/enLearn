<template>
  <div class="planning-visual">
    <div v-if="block.title || block.description" class="planning-header">
      <span v-if="block.title" class="planning-title">{{ block.title }}</span>
      <span v-if="block.description" class="planning-description">{{ block.description }}</span>
    </div>

    <div v-if="block.kind === 'planningFlow'" class="flow-list">
      <button
        v-for="(node, index) in flowNodes"
        :key="rowKey(node, index)"
        class="flow-node"
        @click="emitSelection('planningFlow.nodeSelect', node)"
      >
        <span class="flow-sequence">{{ index + 1 }}</span>
        <div class="flow-copy">
          <span class="flow-label">{{ rowLabel(node, index) }}</span>
          <span class="flow-meta">{{ flowMeta(node) }}</span>
        </div>
      </button>
      <span v-if="!flowNodes.length" class="empty-copy">暂无工艺路线数据</span>
    </div>

    <div v-else-if="block.kind === 'planningGantt'" class="gantt-list">
      <button
        v-for="(row, index) in ganttRows"
        :key="rowKey(row, index)"
        class="gantt-row"
        @click="emitSelection('planningGantt.taskSelect', row)"
      >
        <div class="gantt-heading">
          <span class="gantt-label">{{ ganttLabel(row, index) }}</span>
          <span class="gantt-status">{{ readString(row[block.statusField ?? 'status'], '--') }}</span>
        </div>
        <span class="gantt-resource">{{ readString(row[block.rowLabelField ?? 'resource_name'], '未分配资源') }}</span>
        <span class="gantt-time">{{ ganttTime(row) }}</span>
      </button>
      <span v-if="!ganttRows.length" class="empty-copy">暂无排产计划数据</span>
    </div>

    <div v-else class="bom-list">
      <button
        v-for="(node, index) in bomRows"
        :key="rowKey(node, index)"
        class="bom-node"
        :style="bomIndent(node)"
        @click="emitSelection('planningBom.nodeSelect', node)"
      >
        <span class="bom-type">{{ bomType(node) }}</span>
        <div class="bom-copy">
          <span class="bom-label">{{ rowLabel(node, index) }}</span>
          <span v-if="bomMeta(node)" class="bom-meta">{{ bomMeta(node) }}</span>
        </div>
      </button>
      <span v-if="!bomRows.length" class="empty-copy">暂无 BOM 数据</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from '@vue/runtime-core';

import type { MobileMaterialEmits, MobileMaterialProps } from '../types';

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function sourceValue() {
  return props.block.sourceKey
    ? props.resolvedData[props.block.sourceKey]
    : props.block.rows;
}

function records(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

const flowNodes = computed(() => {
  const value = sourceValue();
  return isRecord(value) ? records(value.nodes) : records(value);
});

const ganttRows = computed(() => records(sourceValue()));

function flattenBom(value: unknown, depth = 0): Array<Record<string, unknown>> {
  return records(value).flatMap((row) => [
    { ...row, __mobileDepth: depth },
    ...flattenBom(row[props.block.childrenField ?? 'children'], depth + 1),
  ]);
}

const bomRows = computed(() => flattenBom(sourceValue()));

function rowKey(row: Record<string, unknown>, index: number) {
  return readString(row[props.block.keyField ?? 'id'], `${props.block.id}-${index}`);
}

function rowLabel(row: Record<string, unknown>, index: number) {
  const field = props.block.titleField ?? 'label';
  return readString(row[field], readString(row.name, `节点 ${index + 1}`));
}

function flowMeta(row: Record<string, unknown>) {
  return [row.type, row.locationName ?? row.location_name, row.itemName ?? row.item_name]
    .map((value) => readString(value))
    .filter(Boolean)
    .join(' · ') || '工序';
}

function ganttLabel(row: Record<string, unknown>, index: number) {
  return readString(
    row[props.block.labelField ?? 'reference'],
    readString(row.name, `计划 ${index + 1}`),
  );
}

function displayDate(value: unknown) {
  const date = new Date(readString(value));
  if (!Number.isFinite(date.getTime())) return '--';
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function ganttTime(row: Record<string, unknown>) {
  return `${displayDate(row[props.block.startField ?? 'startdate'])} - ${displayDate(row[props.block.endField ?? 'enddate'])}`;
}

function bomType(row: Record<string, unknown>) {
  const value = readString(row.nodeType ?? row.node_type ?? row.type, 'item').toLowerCase();
  if (value.includes('routing')) return '路线';
  if (value.includes('operation')) return '工序';
  if (value.includes('product')) return '产品';
  return '物料';
}

function bomMeta(row: Record<string, unknown>) {
  const quantity = row.quantity ?? row.qty;
  if (quantity === undefined || quantity === null || quantity === '') return '';
  return `${String(quantity)} ${readString(row.uom)}`.trim();
}

function bomIndent(row: Record<string, unknown>) {
  return { marginLeft: `${Math.min(Number(row.__mobileDepth ?? 0), 8) * 14}px` };
}

function emitSelection(name: string, row: Record<string, unknown>) {
  emit('runtimeEvent', {
    name,
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: { row, record: row, node: row, task: row },
  });
}
</script>

<style scoped>
.planning-visual {
  padding: 14px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-radius: 6px;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
}

.planning-header,
.flow-list,
.gantt-list,
.bom-list,
.flow-copy,
.bom-copy {
  display: flex;
  flex-direction: column;
}

.planning-header {
  margin-bottom: 10px;
}

.planning-title,
.flow-label,
.gantt-label,
.bom-label {
  color: #17212b;
  font-weight: bold;
}

.planning-title {
  font-size: 16px;
  line-height: 24px;
}

.planning-description,
.flow-meta,
.gantt-resource,
.gantt-time,
.bom-meta,
.empty-copy {
  color: #68737d;
  font-size: 12px;
  line-height: 18px;
}

.flow-node,
.gantt-row,
.bom-node {
  margin-top: 8px;
  padding: 10px;
  display: flex;
  background-color: #f7f9fa;
  border-width: 1px;
  border-style: solid;
  border-color: #dfe4e8;
  border-radius: 5px;
}

.flow-node,
.bom-node {
  flex-direction: row;
  align-items: center;
}

.gantt-row {
  flex-direction: column;
}

.flow-sequence,
.bom-type,
.gantt-status {
  color: #176b4d;
  background-color: #e5f2ec;
  font-size: 11px;
  font-weight: bold;
  border-radius: 4px;
}

.flow-sequence,
.bom-type {
  margin-right: 10px;
  padding: 4px 7px;
}

.flow-copy,
.bom-copy {
  flex: 1;
}

.flow-label,
.gantt-label,
.bom-label {
  font-size: 13px;
  line-height: 20px;
}

.gantt-heading {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.gantt-status {
  margin-left: 8px;
  padding: 3px 6px;
}

.gantt-resource,
.gantt-time {
  margin-top: 3px;
}

.empty-copy {
  padding: 16px 0;
  text-align: center;
}
</style>
