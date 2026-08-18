<template>
  <li class="lc-category-tree-node">
    <div
      class="lc-category-tree-node__row"
      :class="{ 'is-selected': selectedId === nodeKey }"
    >
      <button
        v-if="children.length"
        type="button"
        class="lc-category-tree-node__toggle"
        :title="isExpanded ? '收起子类别' : '展开子类别'"
        :aria-label="isExpanded ? '收起子类别' : '展开子类别'"
        :aria-expanded="isExpanded"
        @click="emit('toggle', node)"
      >
        <i :class="isExpanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'" aria-hidden="true" />
      </button>
      <span v-else class="lc-category-tree-node__spacer" aria-hidden="true" />

      <button
        type="button"
        class="lc-category-tree-node__label"
        :title="node.label"
        @click="emit('select', node)"
      >
        <i
          :class="children.length && isExpanded ? 'ri-folder-open-line' : 'ri-folder-line'"
          aria-hidden="true"
        />
        <span>{{ node.label }}</span>
      </button>
    </div>

    <ul v-if="children.length && isExpanded" class="lc-category-tree-node__children">
      <LowCodeCategoryTreeNode
        v-for="child in children"
        :key="String(child.id)"
        :node="child"
        :expanded-ids="expandedIds"
        :selected-id="selectedId"
        @toggle="emit('toggle', $event)"
        @select="emit('select', $event)"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';

export type LowCodeCategoryTreeNodeData = {
  id: unknown;
  label: string;
  children?: LowCodeCategoryTreeNodeData[];
};

const props = defineProps<{
  node: LowCodeCategoryTreeNodeData;
  expandedIds: Set<string>;
  selectedId: string;
}>();

const emit = defineEmits<{
  toggle: [node: LowCodeCategoryTreeNodeData];
  select: [node: LowCodeCategoryTreeNodeData];
}>();

const nodeKey = computed(() => String(props.node.id ?? ''));
const children = computed(() => Array.isArray(props.node.children) ? props.node.children : []);
const isExpanded = computed(() => props.expandedIds.has(nodeKey.value));
</script>

<style scoped>
.lc-category-tree-node,
.lc-category-tree-node__children {
  list-style: none;
  margin: 0;
  padding: 0;
}

.lc-category-tree-node__children {
  padding-left: 18px;
}

.lc-category-tree-node__row {
  display: flex;
  align-items: center;
  min-width: 0;
  height: 30px;
  border-radius: 4px;
  color: #344054;
}

.lc-category-tree-node__row:hover {
  background: #f2f4f7;
}

.lc-category-tree-node__row.is-selected {
  background: #eaf2ff;
  color: #175cd3;
}

.lc-category-tree-node__toggle,
.lc-category-tree-node__label {
  border: 0;
  color: inherit;
  cursor: pointer;
}

.lc-category-tree-node__toggle {
  display: inline-grid;
  flex: 0 0 24px;
  place-items: center;
  width: 24px;
  height: 28px;
  padding: 0;
  background: transparent;
  font-size: 16px;
}

.lc-category-tree-node__spacer {
  flex: 0 0 24px;
  width: 24px;
}

.lc-category-tree-node__label {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
  height: 28px;
  padding: 0 8px 0 0;
  background: transparent;
  text-align: left;
}

.lc-category-tree-node__label i {
  flex: none;
  color: #667085;
  font-size: 15px;
}

.lc-category-tree-node__row.is-selected .lc-category-tree-node__label i {
  color: #2e6bd1;
}

.lc-category-tree-node__label span {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
