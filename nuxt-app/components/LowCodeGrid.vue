<template>
  <section class="lc-grid">
    <div v-if="schema.title || schema.toolbar?.length" class="lc-grid-toolbar">
      <strong v-if="schema.title">{{ schema.title }}</strong>
      <vxe-button
        v-for="action in schema.toolbar ?? []"
        :key="action.code"
        :status="action.status"
        @click="$emit('toolbar', action.code)"
      >
        {{ action.label }}
      </vxe-button>
    </div>

    <vxe-grid v-bind="gridConfig" :data="rows" :loading="loading">
      <template #actions="{ row }">
        <vxe-button
          v-if="schema.rowActions?.edit !== false"
          size="mini"
          status="primary"
          @click="$emit('edit', row)"
        >
          {{ schema.rowActions?.editLabel ?? 'Edit' }}
        </vxe-button>
        <vxe-button
          v-if="schema.rowActions?.delete !== false"
          size="mini"
          status="danger"
          @click="$emit('delete', row)"
        >
          {{ schema.rowActions?.deleteLabel ?? 'Delete' }}
        </vxe-button>
      </template>
    </vxe-grid>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { normalizeLowCodeGridColumns } from '~/utils/lowcode';
import type { LowCodeGridSchema } from '~/types/lowcode';

const props = defineProps<{
  schema: LowCodeGridSchema;
  rows: Record<string, unknown>[];
  loading?: boolean;
}>();

defineEmits<{
  toolbar: [code: string];
  edit: [row: Record<string, unknown>];
  delete: [row: Record<string, unknown>];
}>();

const gridConfig = computed(() => {
  const columns = props.schema.grid.columns;

  if (!columns?.length) {
    return props.schema.grid as Record<string, unknown>;
  }

  return {
    ...(props.schema.grid as Record<string, unknown>),
    columns: normalizeLowCodeGridColumns(columns) as unknown[]
  };
});
</script>
