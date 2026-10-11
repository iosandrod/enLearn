<template>
  <article class="content-panel">
    <LowCodeGrid
      :key="block.gridDesignerUpdatedAt ?? 0"
      ref="gridRef"
      :schema="pageGridSchema"
      :rows="rows"
      :loading="isLoading"
      :fill="block.layout?.fillRemaining === true"
      :readonly="isReadonly"
      :executing="isMesCommandExecuting"
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
import type {
  LowCodeGridColumn,
  LowCodeGridRowAction,
  LowCodePageGridBlock,
} from '../../../types/lowcode';
import { lowCodeRuntimeBlockEditorKey } from '../../../runtime/block-editor';
import {
  lowCodeEditPageModeScopeKey,
  useLowCodePageRuntime,
} from '../../../runtime/page-runtime';
import { isLowCodeEditPageReadonly } from '../../../runtime/edit-page-mode';
import type { LowCodeBlockMaterialEmits, LowCodeBlockMaterialProps } from '../types';
import { createPageGridMenuConfig } from './page-grid-menu';
import { openRuntimeGridFieldEditor } from './runtime-grid-field-editor';
import { openRuntimeGridDesigner } from './runtime-grid-designer';

const props = defineProps<LowCodeBlockMaterialProps<LowCodePageGridBlock>>();
const emit = defineEmits<LowCodeBlockMaterialEmits>();
const runtimeBlockEditor = inject(lowCodeRuntimeBlockEditorKey, null);
const host = useLowCodeHost();
const pageRuntime = useLowCodePageRuntime(false);
const editPageModeScope = inject(lowCodeEditPageModeScopeKey, false);
const gridRef = ref<InstanceType<typeof LowCodeGrid>>();
let unregisterGridController: (() => void) | undefined;
const runtimeSources = computed(
  () => pageRuntime?.state.sources ?? props.resolvedData
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
const isReadonly = computed(() =>
  editPageModeScope &&
  runtimeBlockEditor?.getPageRecord?.().page_type === 'edit' &&
  isLowCodeEditPageReadonly(pageRuntime?.state.status.formMode)
);
const isMesCommandExecuting = computed(() =>
  pageRuntime?.state.status.mesCommandExecuting === true
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
    editRules: createRuntimeGridEditRules(),
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
  column?: Record<string, unknown> | null;
  columnIndex?: number;
  actionCode?: string;
  rawEvent: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readColumnFieldMetadata(column: LowCodeGridColumn) {
  const params = isRecord(column.params) ? column.params : {};
  return isRecord(params.lowcodeField) ? params.lowcodeField : {};
}

function createRuntimeGridEditRules() {
  const configuredRules = isRecord(props.block.schema.grid.editRules)
    ? props.block.schema.grid.editRules
    : {};
  const rules = Object.fromEntries(
    Object.entries(configuredRules).map(([field, value]) => [
      field,
      Array.isArray(value)
        ? value.filter(
            (rule) => !isRecord(rule) || rule.__lowcodeFieldValidation !== true,
          )
        : value,
    ]),
  );

  for (const column of props.block.schema.grid.columns ?? []) {
    if (!column.field) continue;
    const metadata = readColumnFieldMetadata(column);
    const validationScript = typeof metadata.validationScript === 'string'
      ? metadata.validationScript.trim()
      : '';
    if (!validationScript || !runtimeBlockEditor?.executeFieldScript) continue;

    const fieldRules = Array.isArray(rules[column.field])
      ? rules[column.field] as Record<string, unknown>[]
      : [];
    rules[column.field] = [
      ...fieldRules,
      {
        __lowcodeFieldValidation: true,
        validator: async ({ cellValue, row }: {
          cellValue: unknown;
          row: Record<string, unknown>;
        }) => {
          const result = await runtimeBlockEditor.executeFieldScript?.(
            validationScript,
            {
              name: 'grid.fieldValidate',
              blockId: props.block.id,
              blockKind: props.block.kind,
              timestamp: Date.now(),
              payload: {
                field: column.field,
                value: cellValue,
                row,
                values: row,
              },
            },
          );
          if (result === true || result === null || typeof result === 'undefined') return;
          const message = typeof result === 'string'
            ? result.trim()
            : isRecord(result) && typeof result.message === 'string'
              ? result.message.trim()
              : '';
          throw new Error(
            message ||
            (typeof metadata.validationMessage === 'string'
              ? metadata.validationMessage
              : `${column.title}校验不通过`),
          );
        },
      },
    ];
  }
  return rules;
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

function isMainGrid() {
  // Older list pages did not persist tableType; only an explicit detail grid
  // should stay out of the list-row edit flow.
  return props.block.tableType === 'main' || !props.block.tableType;
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
  if (isReadonly.value || isMesCommandExecuting.value) return;
  const action = props.block.schema.toolbar?.find((item) => item.code === code);

  emitRuntimeEvent(action?.eventName ?? 'grid.toolbarClick', {
    action,
    actionCode: code,
    script: action?.script ?? '',
    directives: action?.directives ?? [],
  });
}

function handleEdit(row: Record<string, unknown>) {
  if (isReadonly.value || isMesCommandExecuting.value) return;
  emitRuntimeEvent(getGridEventName('editClick', 'grid.editClick'), {
    row,
    actionCode: 'edit',
    directives: getGridEventDirectives('editClick'),
  });
  emit('gridEdit', { block: props.block, row });
}

function handleDelete(row: Record<string, unknown>) {
  if (isReadonly.value || isMesCommandExecuting.value) return;
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
  if (isReadonly.value || isMesCommandExecuting.value) return;
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
  const internalFieldEvent = payload.key === 'editClosed';
  const selectionEvent = [
    'rowCurrentChange',
    'radioChange',
    'checkboxChange',
    'checkboxAll',
    'cellClick',
    'cellDblclick',
    'cellMenu',
  ].includes(payload.key);
  if (!isMesCommandExecuting.value && (!isReadonly.value || selectionEvent)) {
    syncGridEvent(payload);
  }
  const mutationEventBlocked = (
    isReadonly.value || isMesCommandExecuting.value
  ) && (
    payload.key === 'toolbarButtonClick' ||
    payload.key === 'toolbarToolClick' ||
    payload.key === 'bodyMenuClick'
  );
  if (
    !internalFieldEvent &&
    !mutationEventBlocked &&
    shouldPublishDesignedGridEvent(payload.key)
  ) {
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

  if (payload.key === 'editClosed') {
    void executeGridFieldUpdateScript(payload);
  }

  if (
    payload.key === 'headerMenuClick' &&
    payload.actionCode === 'designCurrentField' &&
    runtimeBlockEditor
  ) {
    const columns = props.block.schema.grid.columns ?? [];
    const columnIndex = resolveMenuColumnIndex(payload, columns);
    const column = columnIndex >= 0 ? columns[columnIndex] : undefined;
    if (
      column &&
      typeof column.field === 'string' &&
      column.field.trim()
    ) {
      void openRuntimeGridFieldEditor(
        props.block,
        column,
        columnIndex,
        runtimeBlockEditor,
      );
    }
  }
  if (
    payload.key === 'bodyMenuClick' &&
    payload.actionCode === 'editCurrentRow' &&
    isMainGrid() &&
    payload.row &&
    !isReadonly.value &&
    !isMesCommandExecuting.value
  ) {
    emit('gridEdit', { block: props.block, row: payload.row });
  }
}

async function executeGridFieldUpdateScript(payload: GridRuntimeEventPayload) {
  if (!runtimeBlockEditor?.executeFieldScript || !payload.row) return;
  const field = resolveMenuColumnField(payload);
  if (!field) return;
  const column = (props.block.schema.grid.columns ?? []).find(
    (candidate) => candidate.field === field,
  );
  if (!column) return;
  const metadata = readColumnFieldMetadata(column);
  const updateScript = typeof metadata.updateScript === 'string'
    ? metadata.updateScript.trim()
    : '';
  if (!updateScript) return;

  try {
    await runtimeBlockEditor.executeFieldScript(updateScript, {
      name: 'grid.fieldChange',
      blockId: props.block.id,
      blockKind: props.block.kind,
      timestamp: Date.now(),
      payload: {
        field,
        value: payload.row[field],
        row: payload.row,
        values: payload.row,
      },
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
  }
}

function resolveMenuColumnField(payload: GridRuntimeEventPayload) {
  const menuColumn = payload.column ?? (
    isRecord(payload.rawEvent.column) ? payload.rawEvent.column : undefined
  );
  return menuColumn && typeof menuColumn.field === 'string'
    ? menuColumn.field
    : '';
}

function resolveMenuColumnIndex(
  payload: GridRuntimeEventPayload,
  columns: LowCodeGridColumn[],
) {
  const menuColumn = payload.column ?? (
    isRecord(payload.rawEvent.column) ? payload.rawEvent.column : undefined
  );
  const field = menuColumn && typeof menuColumn.field === 'string'
    ? menuColumn.field
    : '';
  if (field) {
    return columns.findIndex((column) => column.field === field);
  }

  if (
    typeof payload.columnIndex === 'number' &&
    payload.columnIndex >= 0 &&
    payload.columnIndex < columns.length
  ) return payload.columnIndex;

  if (!menuColumn) return -1;

  const type = typeof menuColumn.type === 'string' ? menuColumn.type : '';
  const title = typeof menuColumn.title === 'string' ? menuColumn.title : '';
  return columns.findIndex((column) => column.type === type && column.title === title);
}
</script>
