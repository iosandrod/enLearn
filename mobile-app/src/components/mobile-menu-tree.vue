<template>
  <div class="menu-tree">
    <div v-for="node in nodes" :key="node.id" class="menu-node">
      <button
        v-if="node.children.length"
        :class="['menu-group', { 'is-active': branchIsActive(node) }]"
        @click="toggleNode(node.code)"
      >
        <span class="menu-symbol">{{ node.title.slice(0, 1) }}</span>
        <span class="menu-label">{{ node.title }}</span>
        <span class="menu-chevron">{{ isExpanded(node.code) ? '−' : '+' }}</span>
      </button>

      <button
        v-else-if="node.page_code"
        :class="['menu-item', { 'is-active': node.page_code === activePageCode }]"
        @click="openNode(node)"
      >
        <span class="menu-symbol">{{ node.title.slice(0, 1) }}</span>
        <span class="menu-label">{{ node.title }}</span>
        <span class="menu-arrow">›</span>
      </button>

      <MobileMenuTree
        v-if="node.children.length && isExpanded(node.code)"
        class="menu-children"
        :nodes="node.children"
        :active-page-code="activePageCode"
        :force-expanded="forceExpanded"
        @select="(selected) => emit('select', selected)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, watch } from '@vue/runtime-core';

import type { MobileNavigationNode } from '../runtime/navigation-model';

defineOptions({ name: 'MobileMenuTree' });

const props = withDefaults(defineProps<{
  nodes: MobileNavigationNode[];
  activePageCode?: string;
  forceExpanded?: boolean;
}>(), {
  activePageCode: '',
  forceExpanded: false,
});
const emit = defineEmits<{
  select: [node: MobileNavigationNode];
}>();
const expanded = reactive<Record<string, boolean>>({});

function branchIsActive(node: MobileNavigationNode): boolean {
  return node.page_code === props.activePageCode
    || node.children.some((child) => branchIsActive(child));
}

function isExpanded(code: string) {
  return props.forceExpanded || expanded[code] !== false;
}

function toggleNode(code: string) {
  if (props.forceExpanded) return;
  expanded[code] = !isExpanded(code);
}

function openNode(node: MobileNavigationNode) {
  emit('select', node);
}

watch(
  () => props.activePageCode,
  () => {
    props.nodes.forEach((node) => {
      if (branchIsActive(node)) expanded[node.code] = true;
    });
  },
  { immediate: true },
);
</script>

<style scoped>
.menu-tree,
.menu-node {
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.menu-group,
.menu-item {
  width: 100%;
  min-height: 48px;
  padding-right: 12px;
  padding-left: 12px;
  display: flex;
  flex-direction: row;
  align-items: center;
  background-color: transparent;
  border-radius: 5px;
}

.menu-group.is-active,
.menu-item.is-active {
  background-color: #e8f2f6;
}

.menu-symbol {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: #ffffff;
  font-size: 12px;
  line-height: 28px;
  text-align: center;
  background-color: #2d6176;
  border-radius: 4px;
}

.menu-label {
  flex: 1;
  min-width: 0;
  margin-left: 10px;
  color: #243541;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
}

.menu-item.is-active .menu-label,
.menu-group.is-active .menu-label {
  color: #135c78;
  font-weight: bold;
}

.menu-chevron,
.menu-arrow {
  margin-left: 8px;
  color: #6d7e89;
  font-size: 18px;
  line-height: 22px;
}

.menu-children {
  padding-left: 18px;
}

.menu-children .menu-symbol {
  background-color: #718894;
}
</style>

