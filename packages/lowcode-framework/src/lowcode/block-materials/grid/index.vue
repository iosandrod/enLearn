<template>
  <article class="content-panel">
    <header v-if="block.title || block.description" class="lc-node-header">
      <h2 v-if="block.title">{{ block.title }}</h2>
      <p v-if="block.description">{{ block.description }}</p>
    </header>
    <LowCodeGrid
      :schema="block.schema"
      :rows="resolveGridRows(block, resolvedData, searchFilters)"
      :loading="loadingGridId === block.id"
      @edit="handleEdit"
      @delete="handleDelete"
      @toolbar="handleToolbar"
      @row-current-change="handleRowCurrentChange"
      @row-dblclick="handleRowDblclick"
      @cell-dblclick="handleCellDblclick"
      @grid-event="handleGridEvent"
    />
  </article>
</template>

<script setup lang="ts">
import LowCodeGrid from '../../../components/LowCodeGrid.vue';
import { resolveGridRows } from '../helpers';
import type { LowCodePageGridBlock } from '../../../types/lowcode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageGridBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();

type GridRuntimeEventPayload = {
  key: string;
  row?: Record<string, unknown>;
  actionCode?: string;
  rawEvent: Record<string, unknown>;
};

function emitRuntimeEvent(name: string, payload: Record<string, unknown>) {
  emit('runtimeEvent', {
    name,
    blockId: props.block.id,
    blockKind: props.block.kind,
    timestamp: Date.now(),
    payload,
  });
}

function getGridEventDirectives(key: string) {
  const events = props.block.schema.events ?? {};
  return (
    events[key] ??
    (key === 'rowCurrentChange' ? events.currentRowChange : undefined) ??
    []
  );
}

function getGridEventName(key: string, fallback: string) {
  return props.block.schema.eventNames?.[key] ?? fallback;
}

function hasGridEventConfig(key: string) {
  return Boolean(
    props.block.schema.events?.[key] ||
      props.block.schema.eventNames?.[key] ||
      (key === 'rowCurrentChange' && props.block.schema.events?.currentRowChange),
  );
}

function shouldPublishDesignedGridEvent(key: string) {
  if (!props.block.schema.events && !props.block.schema.eventNames) return true;
  return hasGridEventConfig(key);
}

function handleToolbar(code: string) {
  const action = props.block.schema.toolbar?.find((item) => item.code === code);

  emitRuntimeEvent(action?.eventName ?? 'grid.toolbarClick', {
    action,
    actionCode: code,
    directives: action?.directives ?? [],
  });
}

function handleEdit(row: Record<string, unknown>) {
  emitRuntimeEvent(getGridEventName('editClick', 'grid.editClick'), {
    row,
    actionCode: 'edit',
    directives: getGridEventDirectives('editClick'),
  });
  emit('gridEdit', { block: props.block, row });
}

function handleDelete(row: Record<string, unknown>) {
  emitRuntimeEvent(getGridEventName('deleteClick', 'grid.deleteClick'), {
    row,
    actionCode: 'delete',
    directives: getGridEventDirectives('deleteClick'),
  });
  emit('gridDelete', { block: props.block, row });
}

function handleRowCurrentChange(payload: {
  row: Record<string, unknown>;
  rawEvent: Record<string, unknown>;
}) {
  if (!shouldPublishDesignedGridEvent('rowCurrentChange')) return;

  emitRuntimeEvent(getGridEventName('rowCurrentChange', 'grid.rowCurrentChange'), {
    ...payload,
    directives: getGridEventDirectives('rowCurrentChange'),
  });
}

function handleRowDblclick(payload: {
  row: Record<string, unknown>;
  rawEvent: Record<string, unknown>;
}) {
  if (!shouldPublishDesignedGridEvent('rowDblclick')) return;

  emitRuntimeEvent(getGridEventName('rowDblclick', 'grid.rowDblclick'), {
    ...payload,
    directives: getGridEventDirectives('rowDblclick'),
  });
}

function handleCellDblclick(payload: {
  row: Record<string, unknown>;
  rawEvent: Record<string, unknown>;
}) {
  if (!shouldPublishDesignedGridEvent('cellDblclick')) return;

  emitRuntimeEvent(getGridEventName('cellDblclick', 'grid.cellDblclick'), {
    ...payload,
    directives: getGridEventDirectives('cellDblclick'),
  });
}

function handleGridEvent(payload: GridRuntimeEventPayload) {
  if (!hasGridEventConfig(payload.key)) return;

  emitRuntimeEvent(getGridEventName(payload.key, `grid.${payload.key}`), {
    ...payload,
    directives: getGridEventDirectives(payload.key),
  });
}
</script>
