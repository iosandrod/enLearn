<template>
  <vxe-colgroup
    v-if="column.children?.length"
    :title="column.title"
    :visible="column.visible !== false"
    :width="column.width"
    :min-width="column.minWidth"
    :align="column.align"
    :header-align="column.headerAlign"
  >
    <LcArrayTableColumn
      v-for="(child, index) in column.children"
      :key="child.field || `${column.title}-${index}`"
      :column="child"
      :tree-node="treeNode && index === firstLeafIndex"
    >
      <template #default="slotProps">
        <slot v-bind="slotProps" />
      </template>
    </LcArrayTableColumn>
  </vxe-colgroup>

  <vxe-column
    v-else-if="column.type"
    :type="column.type"
    :visible="column.visible !== false"
    :field="column.field"
    :title="column.title"
    :width="column.width"
    :min-width="column.minWidth"
    :align="column.align"
    :header-align="column.headerAlign"
  />

  <vxe-column
    v-else
    :visible="column.visible !== false"
    :field="column.field"
    :title="column.title"
    :width="column.width"
    :min-width="column.minWidth || 100"
    :align="column.align"
    :header-align="column.headerAlign"
    :tree-node="treeNode"
  >
    <template #default="scope">
      <slot :column="column" :scope="scope" />
    </template>
  </vxe-column>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type ArrayTableColumnNode = {
  field: string;
  title: string;
  visible?: boolean;
  type?: string;
  width?: number | string;
  minWidth?: number | string;
  align?: 'left' | 'center' | 'right';
  headerAlign?: 'left' | 'center' | 'right';
  children?: ArrayTableColumnNode[];
};

defineOptions({ name: 'LcArrayTableColumn' });

const props = withDefaults(
  defineProps<{
    column: ArrayTableColumnNode;
    treeNode?: boolean;
  }>(),
  { treeNode: false },
);

const firstLeafIndex = computed(() => {
  const children = props.column.children ?? [];
  return children.findIndex(hasLeafDescendant);
});

function hasLeafDescendant(column: ArrayTableColumnNode) {
  if (column.visible === false) return false;
  return !column.children?.length || column.children.some(hasLeafDescendant);
}
</script>
