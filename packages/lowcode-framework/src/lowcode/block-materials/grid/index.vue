<template>
  <article class="content-panel">
    <LowCodeGrid
      ref="gridRef"
      :schema="pageGridSchema"
      :rows="rows"
      :loading="isLoading"
      :fill="block.layout?.fillRemaining === true"
      @edit="handleEdit"
      @delete="handleDelete"
      @row-action="handleRowAction"
      @toolbar="handleToolbar"
      @row-current-change="handleRowCurrentChange"
      @row-dblclick="handleRowDblclick"
      @cell-dblclick="handleCellDblclick"
      @grid-event="handleGridEvent"
    />
  </article>
</template>

<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import LowCodeGrid from '../../../components/LowCodeGrid.vue';
import { useLowCodeHost } from '../../../core/host';
import { resolveGridRows } from '../helpers';
import type { LowCodeGridRowAction, LowCodePageGridBlock } from '../../../types/lowcode';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import { useLowCodePageRuntime } from '../../../runtime/page-runtime';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import { createPageGridMenuConfig } from './page-grid-menu';
import { openRuntimeGridDesigner } from './runtime-grid-designer';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageGridBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtimeBlockEditor = inject(lowCodeRuntimeBlockEditorKey, null);
const host = useLowCodeHost();
const pageRuntime = useLowCodePageRuntime(false);
const gridRef = ref<InstanceType<typeof LowCodeGrid>>();
let unregisterGridController: (() => void) | undefined;
const runtimeSources = computed(
  () =>{let obj= pageRuntime?.state.sources ?? props.resolvedData
    return obj//
  }
);
const runtimeSearches = computed(
  () => pageRuntime?.state.searches ?? props.searchFilters
);
const rows = computed(() => {
  if (!props.block.sourceKey) {
    const runtimeGrid = pageRuntime?.state.grids[props.block.id];
    if (runtimeGrid) return runtimeGrid.rows;
  }

  return resolveGridRows(props.block, runtimeSources.value, runtimeSearches.value);
});
const isLoading = computed(
  () =>
    (pageRuntime?.state.status.loadingGridId ?? props.loadingGridId) === props.block.id ||
    Boolean(
      props.block.sourceKey &&
      pageRuntime?.state.status.loadingSourceKeys.includes(props.block.sourceKey)
    )
);
const rowKey = computed(() => {
  const rowConfig = isRecord(props.block.schema.grid.rowConfig)
    ? props.block.schema.grid.rowConfig
    : {};
  const keyField = rowConfig.keyField;
  return typeof keyField === 'string' && keyField.trim() ? keyField.trim() : 'id';
});

const pageGridSchema = computed(() => ({
  ...props.block.schema,
  grid: {
    ...props.block.schema.grid,
    menuConfig: createPageGridMenuConfig(props.block.schema.grid.menuConfig),
  },
}));

onMounted(() => {
  if (!pageRuntime || !gridRef.value) return;
  unregisterGridController = pageRuntime.registerGridController(props.block.id, {
    validate: () => gridRef.value?.validate() ?? Promise.resolve(false),
    clearValidation: () => gridRef.value?.clearValidation(),
    setCurrentRow: (row) => gridRef.value?.setCurrentRow(row),
  });
});

onBeforeUnmount(() => unregisterGridController?.());

type GridRuntimeEventPayload = {
  key: string;
  row?: Record<string, unknown> | null;
  actionCode?: string;
  rawEvent: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function syncGridRows() {
  if (!props.block.sourceKey && pageRuntime?.state.grids[props.block.id]) return;
  pageRuntime?.setGridRows(props.block.id, rows.value, {
    sourceKey: props.block.sourceKey,
    rowKey: rowKey.value,
  });
}

function syncGridEvent(payload: GridRuntimeEventPayload) {
  if (!pageRuntime) return;
  syncGridRows();
  pageRuntime.applyGridEvent(props.block.id, payload);
}

watch(
  [rows, rowKey, () => props.block.sourceKey],
  syncGridRows,
  { immediate: true }
);

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
  if (
    [
      'rowCurrentChange',
      'rowDblclick',
      'cellDblclick',
      'cellClick',
      'radioChange',
      'checkboxChange',
      'checkboxAll',
      'headerMenuClick',
      'bodyMenuClick',
      'footerMenuClick',
      'menuClick',
    ].includes(key)
  ) return true;
  if (!props.block.schema.events && !props.block.schema.eventNames) return true;
  return hasGridEventConfig(key);
}

function handleToolbar(code: string) {
  const action = props.block.schema.toolbar?.find((item) => item.code === code);

  emitRuntimeEvent(action?.eventName ?? 'grid.toolbarClick', {
    action,
    actionCode: code,
    script: action?.script ?? '',
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

function handleRowAction(payload: {
  action: LowCodeGridRowAction;
  row: Record<string, unknown>;
}) {
  emitRuntimeEvent(payload.action.eventName ?? 'grid.rowAction', {
    row: payload.row,
    action: payload.action,
    actionCode: payload.action.code,
    script: payload.action.script ?? '',
    directives: payload.action.directives ?? [],
  });
}

function handleRowCurrentChange(payload: {
  row: Record<string, unknown> | null;
  rawEvent: Record<string, unknown>;
}) {
  syncGridEvent({ key: 'rowCurrentChange', ...payload });
  if (!shouldPublishDesignedGridEvent('rowCurrentChange')) return;

  emitRuntimeEvent(getGridEventName('rowCurrentChange', 'grid.rowCurrentChange'), {
    key: 'rowCurrentChange',
    ...payload,
    directives: getGridEventDirectives('rowCurrentChange'),
  });
}

function handleRowDblclick(payload: {
  row: Record<string, unknown>;
  rawEvent: Record<string, unknown>;
}) {
  syncGridEvent({ key: 'rowDblclick', ...payload });
  if (!shouldPublishDesignedGridEvent('rowDblclick')) return;

  emitRuntimeEvent(getGridEventName('rowDblclick', 'grid.rowDblclick'), {
    key: 'rowDblclick',
    ...payload,
    directives: getGridEventDirectives('rowDblclick'),
  });
}

function handleCellDblclick(payload: {
  row: Record<string, unknown>;
  rawEvent: Record<string, unknown>;
}) {
  syncGridEvent({ key: 'cellDblclick', ...payload });
  if (!shouldPublishDesignedGridEvent('cellDblclick')) return;

  emitRuntimeEvent(getGridEventName('cellDblclick', 'grid.cellDblclick'), {
    key: 'cellDblclick',
    ...payload,
    directives: getGridEventDirectives('cellDblclick'),
  });
}

function handleGridEvent(payload: GridRuntimeEventPayload) {
  syncGridEvent(payload);
  if (shouldPublishDesignedGridEvent(payload.key)) {
    emitRuntimeEvent(getGridEventName(payload.key, `grid.${payload.key}`), {
      ...payload,
      directives: getGridEventDirectives(payload.key),
    });
  }

  if (
    payload.key === 'headerMenuClick' &&
    payload.actionCode === 'tableInfoDesign' &&
    runtimeBlockEditor
  ) {
    let serviceApi;
    try {
      serviceApi = host.getServiceApi();
    } catch {
      serviceApi = undefined;
    }
    void openRuntimeGridDesigner(props.block, runtimeBlockEditor, serviceApi);
  }

  if (
    payload.key === 'bodyMenuClick' &&
    payload.actionCode === 'editCurrentRow' &&
    payload.row
  ) {
    emit('gridEdit', { block: props.block, row: payload.row });
  }
}
</script>
