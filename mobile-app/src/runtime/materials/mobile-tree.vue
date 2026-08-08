<template>
  <div class="mobile-tree">
    <div v-if="block.title || block.description" class="tree-heading">
      <span v-if="block.title" class="tree-title">{{ block.title }}</span>
      <span v-if="block.description" class="tree-description">{{ block.description }}</span>
    </div>

    <div v-if="!visibleNodes.length" class="tree-empty">
      <span class="tree-empty-text">暂无树形数据</span>
    </div>

    <button
      v-for="item in visibleNodes"
      :key="item.key"
      :class="['tree-node', { 'is-selected': item.key === selectedKey }]"
      :style="nodeStyle(item.depth)"
      @click="handleNodeClick(item)"
    >
      <button
        v-if="item.children.length"
        class="tree-toggle"
        :aria-label="isExpanded(item.key) ? '收起' : '展开'"
        @click.stop="toggleNode(item.key)"
      >
        <span class="tree-toggle-text">{{ isExpanded(item.key) ? '−' : '+' }}</span>
      </button>
      <span v-else class="tree-leaf-mark">•</span>
      <span class="tree-node-title" :numberOfLines="1" ellipsizeMode="tail">
        {{ item.title }}
      </span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from '@vue/runtime-core';
import type { CSSProperties } from 'vue';

import type { MobileMaterialEmits, MobileMaterialProps } from '../types';

type TreeNode = {
  key: string;
  title: string;
  row: Record<string, unknown>;
  children: TreeNode[];
};

type VisibleTreeNode = TreeNode & { depth: number };

const props = defineProps<MobileMaterialProps>();
const emit = defineEmits<MobileMaterialEmits>();
const expanded = reactive<Record<string, boolean>>({});
const selectedKey = ref('');

const sourceRows = computed<Record<string, unknown>[]>(() => {
  const source = props.block.sourceKey
    ? props.resolvedData[props.block.sourceKey]
    : props.block.rows;
  if (Array.isArray(source)) return source.filter(isRecord);
  if (isRecord(source)) {
    const rows = source.rows ?? source.data ?? source.items;
    return Array.isArray(rows) ? rows.filter(isRecord) : [];
  }
  return [];
});
const treeNodes = computed(() => normalizeNodes(sourceRows.value));
const visibleNodes = computed(() => flattenVisible(treeNodes.value));

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNodes(rows: Record<string, unknown>[], parentPath = ''): TreeNode[] {
  const keyField = String(props.block.keyField ?? 'id');
  const titleField = String(props.block.titleField ?? 'title');
  const childrenField = String(props.block.childrenField ?? 'children');
  return rows.map((row, index) => {
    const key = String(row[keyField] ?? `${parentPath}${index}`);
    const children = Array.isArray(row[childrenField])
      ? (row[childrenField] as unknown[]).filter(isRecord)
      : [];
    return {
      key,
      title: String(row[titleField] ?? row.name ?? row.label ?? row.code ?? key),
      row,
      children: normalizeNodes(children, `${key}/`),
    };
  });
}

function flattenVisible(nodes: TreeNode[], depth = 0): VisibleTreeNode[] {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...(node.children.length && isExpanded(node.key)
      ? flattenVisible(node.children, depth + 1)
      : []),
  ]);
}

function isExpanded(key: string) {
  return expanded[key] !== false;
}

function toggleNode(key: string) {
  expanded[key] = !isExpanded(key);
}

function nodeStyle(depth: number): CSSProperties {
  return { paddingLeft: `${12 + depth * 20}px` };
}

function handleNodeClick(node: VisibleTreeNode) {
  selectedKey.value = node.key;
  emit('runtimeEvent', {
    name: props.block.eventName ?? 'tree.nodeClick',
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload: {
      row: node.row,
      node: node.row,
      key: node.key,
      directives: props.block.events?.nodeClick ?? [],
    },
  });
}
</script>

<style scoped>
.mobile-tree {
  width: 100%;
  min-width: 0;
  padding: 12px;
  display: flex;
  flex-direction: column;
  background-color: #ffffff;
  border-width: 1px;
  border-style: solid;
  border-color: #d8e0e5;
  border-radius: 6px;
}

.tree-heading {
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
}

.tree-title {
  color: #172b38;
  font-size: 15px;
  line-height: 22px;
  font-weight: bold;
}

.tree-description {
  margin-top: 2px;
  color: #71818b;
  font-size: 11px;
  line-height: 17px;
}

.tree-node {
  width: 100%;
  min-height: 42px;
  padding-right: 10px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: transparent;
  border-radius: 4px;
}

.tree-node.is-selected {
  background-color: #eaf3f7;
}

.tree-toggle {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  background-color: #edf2f4;
  border-radius: 3px;
}

.tree-toggle-text {
  color: #315f73;
  font-size: 16px;
  line-height: 20px;
}

.tree-leaf-mark {
  width: 26px;
  color: #83939c;
  font-size: 16px;
  line-height: 20px;
  text-align: center;
}

.tree-node-title {
  flex: 1;
  min-width: 0;
  margin-left: 7px;
  color: #334955;
  font-size: 13px;
  line-height: 19px;
  text-align: left;
}

.tree-empty {
  min-height: 72px;
  align-items: center;
  justify-content: center;
}

.tree-empty-text {
  color: #7b8991;
  font-size: 12px;
}
</style>
