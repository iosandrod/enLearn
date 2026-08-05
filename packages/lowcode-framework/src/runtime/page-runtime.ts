import {
  inject,
  provide,
  reactive,
  type InjectionKey,
} from 'vue';

export type LowCodeRuntimeRecord = Record<string, unknown>;

export type LowCodePageRuntimeGridCell = {
  row: LowCodeRuntimeRecord;
  field?: string;
};

export type LowCodePageRuntimeGridState = {
  sourceKey?: string;
  rowKey: string;
  rows: LowCodeRuntimeRecord[];
  currentRow: LowCodeRuntimeRecord | null;
  selectedRows: LowCodeRuntimeRecord[];
  contextRow: LowCodeRuntimeRecord | null;
  currentCell: LowCodePageRuntimeGridCell | null;
};

export type LowCodePageRuntimeStatus = {
  loadingSourceKeys: string[];
  loadingBlockId: string;
  loadingGridId: string;
  dataLoading: boolean;
  message: string;
  messageClass: string;
};

export type LowCodePageRuntimeState = {
  sources: Record<string, unknown>;
  forms: Record<string, LowCodeRuntimeRecord>;
  searches: Record<string, LowCodeRuntimeRecord>;
  grids: Record<string, LowCodePageRuntimeGridState>;
  status: LowCodePageRuntimeStatus;
};

export type LowCodeGridRuntimeEvent = {
  key: string;
  row?: LowCodeRuntimeRecord | null;
  rawEvent?: LowCodeRuntimeRecord;
};

export type LowCodePageRuntimeResetOptions = {
  preserveGrids?: boolean;
};

export type LowCodePageRuntimeContext = {
  state: LowCodePageRuntimeState;
  resetData(options?: LowCodePageRuntimeResetOptions): void;
  reset(): void;
  setSource(key: string, value: unknown): void;
  replaceForm(blockId: string, values: LowCodeRuntimeRecord): void;
  patchForm(blockId: string, values: LowCodeRuntimeRecord): void;
  replaceSearch(sourceKey: string, values: LowCodeRuntimeRecord): void;
  patchSearch(sourceKey: string, values: LowCodeRuntimeRecord): void;
  ensureGrid(
    blockId: string,
    options?: { sourceKey?: string; rowKey?: string }
  ): LowCodePageRuntimeGridState;
  setGridRows(
    blockId: string,
    rows: LowCodeRuntimeRecord[],
    options?: { sourceKey?: string; rowKey?: string }
  ): void;
  setGridCurrentRow(blockId: string, row: LowCodeRuntimeRecord | null): void;
  setGridSelectedRows(blockId: string, rows: LowCodeRuntimeRecord[]): void;
  setGridContextRow(blockId: string, row: LowCodeRuntimeRecord | null): void;
  setGridCurrentCell(blockId: string, cell: LowCodePageRuntimeGridCell | null): void;
  applyGridEvent(blockId: string, event: LowCodeGridRuntimeEvent): void;
  setSourceLoading(key: string, loading: boolean): void;
  snapshot(): LowCodePageRuntimeState;
};

export const lowCodePageRuntimeKey: InjectionKey<LowCodePageRuntimeContext> =
  Symbol('lowCodePageRuntime');

function isRecord(value: unknown): value is LowCodeRuntimeRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clearRecord(target: LowCodeRuntimeRecord) {
  Object.keys(target).forEach((key) => delete target[key]);
}

function cloneRuntimeValue<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readEventRows(rawEvent: LowCodeRuntimeRecord) {
  for (const key of ['records', 'checkboxRecords', 'selectedRows', 'rows']) {
    const candidate = rawEvent[key];
    let value = candidate;

    if (typeof candidate === 'function') {
      try {
        value = candidate();
      } catch {
        value = undefined;
      }
    }

    if (Array.isArray(value)) return value.filter(isRecord);
  }
  return undefined;
}

function readEventRow(event: LowCodeGridRuntimeEvent, rawEvent: LowCodeRuntimeRecord) {
  if (event.key === 'rowCurrentChange' || event.key === 'radioChange') {
    if ('newValue' in rawEvent) {
      return isRecord(rawEvent.newValue) ? rawEvent.newValue : null;
    }
  }

  return isRecord(event.row) ? event.row : null;
}

function readEventField(rawEvent: LowCodeRuntimeRecord) {
  const column = isRecord(rawEvent.column) ? rawEvent.column : {};
  return readString(column.field ?? rawEvent.field);
}

function findRuntimeRow(
  rows: LowCodeRuntimeRecord[],
  candidate: LowCodeRuntimeRecord | null,
  rowKey: string
) {
  if (!candidate) return null;
  const keyValue = candidate[rowKey];
  if (typeof keyValue === 'undefined' || keyValue === null) {
    return rows.includes(candidate) ? candidate : null;
  }
  return rows.find((row) => Object.is(row[rowKey], keyValue)) ?? null;
}

function reconcileGridRows(grid: LowCodePageRuntimeGridState) {
  grid.currentRow = findRuntimeRow(grid.rows, grid.currentRow, grid.rowKey);
  grid.contextRow = findRuntimeRow(grid.rows, grid.contextRow, grid.rowKey);
  grid.selectedRows = grid.selectedRows
    .map((row) => findRuntimeRow(grid.rows, row, grid.rowKey))
    .filter(isRecord);

  if (grid.currentCell) {
    const row = findRuntimeRow(grid.rows, grid.currentCell.row, grid.rowKey);
    grid.currentCell = row
      ? { row, ...(grid.currentCell.field ? { field: grid.currentCell.field } : {}) }
      : null;
  }
}

export function createLowCodePageRuntime(): LowCodePageRuntimeContext {
  const state = reactive<LowCodePageRuntimeState>({
    sources: {},
    forms: {},
    searches: {},
    grids: {},
    status: {
      loadingSourceKeys: [],
      loadingBlockId: '',
      loadingGridId: '',
      dataLoading: false,
      message: '',
      messageClass: 'lc-help',
    },
  });

  function ensureGrid(
    blockId: string,
    options: { sourceKey?: string; rowKey?: string } = {}
  ) {
    const existing = state.grids[blockId];
    if (existing) {
      if ('sourceKey' in options) {
        if (options.sourceKey) existing.sourceKey = options.sourceKey;
        else delete existing.sourceKey;
      }
      if (options.rowKey) existing.rowKey = options.rowKey;
      return existing;
    }

    const grid = reactive<LowCodePageRuntimeGridState>({
      ...(options.sourceKey ? { sourceKey: options.sourceKey } : {}),
      rowKey: options.rowKey || 'id',
      rows: [],
      currentRow: null,
      selectedRows: [],
      contextRow: null,
      currentCell: null,
    });
    state.grids[blockId] = grid;

    const sourceRows = options.sourceKey ? state.sources[options.sourceKey] : undefined;
    if (Array.isArray(sourceRows)) {
      grid.rows = sourceRows.filter(isRecord);
    }

    return grid;
  }

  function setGridRows(
    blockId: string,
    rows: LowCodeRuntimeRecord[],
    options: { sourceKey?: string; rowKey?: string } = {}
  ) {
    const grid = ensureGrid(blockId, options);
    grid.rows = Array.isArray(rows) ? rows : [];
    reconcileGridRows(grid);
  }

  function setGridCurrentRow(blockId: string, row: LowCodeRuntimeRecord | null) {
    const grid = ensureGrid(blockId);
    grid.currentRow = findRuntimeRow(grid.rows, row, grid.rowKey);
  }

  function setGridSelectedRows(blockId: string, rows: LowCodeRuntimeRecord[]) {
    const grid = ensureGrid(blockId);
    grid.selectedRows = (Array.isArray(rows) ? rows : [])
      .map((row) => findRuntimeRow(grid.rows, row, grid.rowKey))
      .filter(isRecord);
  }

  function setGridContextRow(blockId: string, row: LowCodeRuntimeRecord | null) {
    const grid = ensureGrid(blockId);
    grid.contextRow = findRuntimeRow(grid.rows, row, grid.rowKey);
  }

  function setGridCurrentCell(blockId: string, cell: LowCodePageRuntimeGridCell | null) {
    const grid = ensureGrid(blockId);
    const row = cell ? findRuntimeRow(grid.rows, cell.row, grid.rowKey) : null;
    grid.currentCell = row
      ? { row, ...(cell?.field ? { field: cell.field } : {}) }
      : null;
  }

  function applyGridEvent(blockId: string, event: LowCodeGridRuntimeEvent) {
    const rawEvent = isRecord(event.rawEvent) ? event.rawEvent : {};
    const row = readEventRow(event, rawEvent);
    const key = event.key;

    if (key === 'rowCurrentChange') {
      setGridCurrentRow(blockId, row);
    }

    if (key === 'radioChange') {
      setGridSelectedRows(blockId, row ? [row] : []);
    }

    if (key === 'checkboxChange' || key === 'checkboxAll') {
      const rows = readEventRows(rawEvent);
      if (rows) setGridSelectedRows(blockId, rows);
    }

    if (
      key === 'cellMenu' ||
      key === 'bodyMenuClick' ||
      key === 'bodyMenuVisible' ||
      (key === 'menuClick' && rawEvent.type === 'body')
    ) {
      setGridContextRow(blockId, row);
    }

    if (key === 'cellClick' || key === 'cellDblclick' || key === 'cellMenu') {
      const field = readEventField(rawEvent);
      setGridCurrentCell(
        blockId,
        row ? { row, ...(field ? { field } : {}) } : null
      );
    }
  }

  function resetData(options: LowCodePageRuntimeResetOptions = {}) {
    clearRecord(state.sources);
    clearRecord(state.forms);
    clearRecord(state.searches);
    if (!options.preserveGrids) clearRecord(state.grids);
    state.status.loadingSourceKeys = [];
  }

  function reset() {
    resetData();
    state.status.loadingBlockId = '';
    state.status.loadingGridId = '';
    state.status.dataLoading = false;
    state.status.message = '';
    state.status.messageClass = 'lc-help';
  }

  function setSourceLoading(key: string, loading: boolean) {
    const keys = new Set(state.status.loadingSourceKeys);
    if (loading) keys.add(key);
    else keys.delete(key);
    state.status.loadingSourceKeys = [...keys];
  }

  return {
    state,
    resetData,
    reset,
    setSource(key, value) {
      state.sources[key] = value;

      Object.entries(state.grids).forEach(([blockId, grid]) => {
        if (grid.sourceKey !== key) return;
        setGridRows(
          blockId,
          Array.isArray(value) ? value.filter(isRecord) : [],
          { sourceKey: key, rowKey: grid.rowKey }
        );
      });
    },
    replaceForm(blockId, values) {
      state.forms[blockId] = { ...values };
    },
    patchForm(blockId, values) {
      state.forms[blockId] = { ...(state.forms[blockId] ?? {}), ...values };
    },
    replaceSearch(sourceKey, values) {
      state.searches[sourceKey] = { ...values };
    },
    patchSearch(sourceKey, values) {
      state.searches[sourceKey] = { ...(state.searches[sourceKey] ?? {}), ...values };
    },
    ensureGrid,
    setGridRows,
    setGridCurrentRow,
    setGridSelectedRows,
    setGridContextRow,
    setGridCurrentCell,
    applyGridEvent,
    setSourceLoading,
    snapshot() {
      return cloneRuntimeValue(state);
    },
  };
}

export function provideLowCodePageRuntime(runtime: LowCodePageRuntimeContext) {
  provide(lowCodePageRuntimeKey, runtime);
  return runtime;
}

export function useLowCodePageRuntime(): LowCodePageRuntimeContext;
export function useLowCodePageRuntime(required: true): LowCodePageRuntimeContext;
export function useLowCodePageRuntime(required: false): LowCodePageRuntimeContext | null;
export function useLowCodePageRuntime(required = true) {
  const runtime = inject(lowCodePageRuntimeKey, null);
  if (!runtime && required) {
    throw new Error('Low-code page runtime context is unavailable.');
  }
  return runtime;
}
