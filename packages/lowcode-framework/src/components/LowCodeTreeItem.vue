<template>
  <li class="lc-tree-item">
    <span>{{ row[titleField] ?? row.label ?? row.name ?? row.code ?? row.id }}</span>
    <ul v-if="children.length">
      <LowCodeTreeItem
        v-for="child in children"
        :key="String(child.id ?? child[titleField])"
        :row="child"
        :title-field="titleField"
        :children-field="childrenField"
      />
    </ul>
  </li>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  row: Record<string, unknown>;
  titleField: string;
  childrenField: string;
}>();

const children = computed(() =>
  Array.isArray(props.row[props.childrenField])
    ? (props.row[props.childrenField] as Record<string, unknown>[])
    : []
);
</script>
