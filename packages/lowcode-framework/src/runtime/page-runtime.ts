import {
  inject,
  provide,
  reactive,
  type InjectionKey,
} from 'vue';
import type {
  LowCodeEditPageMode,
  LowCodePageType,
  LowCodeRuntimeFunctionDefinition,
} from '../types/lowcode';

export type LowCodeRuntimeRecord = Record<string, unknown>;

export type LowCodePageRuntimeGridCell = {
  row: LowCodeRuntimeRecord;
  field?: string;
};

export type LowCodeGridChangeSet = {
  created: LowCodeRuntimeRecord[];
  updated: LowCodeRuntimeRecord[];
  deleted: LowCodeRuntimeRecord[];
};

export type LowCodeGridRowsOptions = {
  sourceKey?: string;
  rowKey?: string;
  resetBaseline?: boolean;
};

export type LowCodeSourceValueOptions = {
  resetGridBaseline?: boolean;
};

export type LowCodePageRuntimeGridState = {
  sourceKey?: string;
  rowKey: string;
  rows: LowCodeRuntimeRecord[];
  changes: LowCodeGridChangeSet;
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
  mesCommandExecuting: boolean;
  mesCommandActionKey: string;
  formMode: LowCodeEditPageMode;
  message: string;
  messageClass: string;
};

// export type LowCodePageRuntimeState = {
//   sources: Record<string, unknown>;
//   forms: Record<string, LowCodeRuntimeRecord>;
//   searches: Record<string, LowCodeRuntimeRecord>;
//   grids: Record<string, LowCodePageRuntimeGridState>;
//   status: LowCodePageRuntimeStatus;
// };
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
  preserveLocalGridRows?: boolean;
};

export type LowCodePageRuntimeFormController = {
  validate(): Promise<boolean>;
  clearValidation(): Promise<void> | void;
  commitPendingValues?(): Promise<void> | void;
  setValues?(values: LowCodeRuntimeRecord): Promise<void> | void;
};

export type LowCodePageRuntimeGridController = {
  validate(): Promise<boolean>;
  clearValidation(): Promise<void> | void;
  setCurrentRow(row: LowCodeRuntimeRecord | null): Promise<void> | void;
};

export type LowCodePageRuntimeContext = {
  state: LowCodePageRuntimeState;
  pageType?: LowCodePageType;
  runtimeFunctions?: LowCodeRuntimeFunctionDefinition[];
  registerFormController(
    blockId: string,
    controller: LowCodePageRuntimeFormController,
  ): () => void;
  getFormController(blockId: string): LowCodePageRuntimeFormController | undefined;
  registerGridController(
    blockId: string,
    controller: LowCodePageRuntimeGridController,
  ): () => void;
  getGridController(blockId: string): LowCodePageRuntimeGridController | undefined;
  isGridInitialized(blockId: string): boolean;
  resetData(options?: LowCodePageRuntimeResetOptions): void;
  reset(): void;
  setSource(key: string, value: unknown, options?: LowCodeSourceValueOptions): void;
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
    options?: LowCodeGridRowsOptions
  ): void;
  getGridChanges(blockId: string): LowCodeGridChangeSet;
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

/** Edit-page mode only governs controls rendered inside the business page surface. */
export const lowCodeEditPageModeScopeKey: InjectionKey<boolean> =
  Symbol('lowCodeEditPageModeScope');

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

function emptyGridChanges(): LowCodeGridChangeSet {
  return { created: [], updated: [], deleted: [] };
}

function gridRowIdentity(row: LowCodeRuntimeRecord, rowKey: string) {
  const value = row[rowKey];
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'object' || typeof value === 'function') return '';
  return `${typeof value}:${String(value)}`;
}

function normalizeComparableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeComparableValue);
  if (!isRecord(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => ![
        '_X_ROW_KEY',
        '__rowStatus',
        '__rowState',
      ].includes(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, normalizeComparableValue(nested)]),
  );
}

function gridRowsEqual(left: LowCodeRuntimeRecord, right: LowCodeRuntimeRecord) {
  try {
    return JSON.stringify(normalizeComparableValue(left)) ===
      JSON.stringify(normalizeComparableValue(right));
  } catch {
    return false;
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
      mesCommandExecuting: false,
      mesCommandActionKey: '',
      formMode: 'scan',
      message: '',
      messageClass: 'lc-help',
    },
  });
  const formControllers = new Map<string, LowCodePageRuntimeFormController>();
  const gridControllers = new Map<string, LowCodePageRuntimeGridController>();
  const initializedGridIds = new Set<string>();
  const gridBaselines = new Map<string, LowCodeRuntimeRecord[]>();

  function calculateGridChanges(blockId: string) {
    const grid = state.grids[blockId];
    const baselineRows = gridBaselines.get(blockId);
    if (!grid || !baselineRows) return emptyGridChanges();

    const sourceValue = grid.sourceKey ? state.sources[grid.sourceKey] : undefined;
    const currentRows = grid.sourceKey
      ? Array.isArray(sourceValue)
        ? sourceValue.filter(isRecord)
        : isRecord(sourceValue) && Array.isArray(sourceValue.rows)
          ? sourceValue.rows.filter(isRecord)
          : grid.rows
      : grid.rows;

    const baselineByKey = new Map<string, LowCodeRuntimeRecord>();
    for (const row of baselineRows) {
      const identity = gridRowIdentity(row, grid.rowKey);
      if (identity) baselineByKey.set(identity, row);
    }

    const currentKeys = new Set<string>();
    const created: LowCodeRuntimeRecord[] = [];
    const updated: LowCodeRuntimeRecord[] = [];
    for (const row of currentRows) {
      const identity = gridRowIdentity(row, grid.rowKey);
      const baseline = identity ? baselineByKey.get(identity) : undefined;
      if (!baseline) {
        created.push(cloneRuntimeValue(row));
        continue;
      }
      currentKeys.add(identity);
      if (!gridRowsEqual(row, baseline)) updated.push(cloneRuntimeValue(row));
    }

    const deleted = baselineRows
      .filter((row) => {
        const identity = gridRowIdentity(row, grid.rowKey);
        return Boolean(identity) && !currentKeys.has(identity);
      })
      .map((row) => cloneRuntimeValue(row));

    return { created, updated, deleted };
  }

  function refreshGridChanges(blockId: string) {
    const grid = state.grids[blockId];
    if (!grid) return emptyGridChanges();
    const changes = calculateGridChanges(blockId);
    grid.changes.created = changes.created;
    grid.changes.updated = changes.updated;
    grid.changes.deleted = changes.deleted;
    return changes;
  }

  function resetGridBaseline(blockId: string, rows: LowCodeRuntimeRecord[]) {
    gridBaselines.set(blockId, cloneRuntimeValue(rows));
    refreshGridChanges(blockId);
  }

  function registerFormController(
    blockId: string,
    controller: LowCodePageRuntimeFormController,
  ) {
    formControllers.set(blockId, controller);
    return () => {
      if (formControllers.get(blockId) === controller) {
        formControllers.delete(blockId);
      }
    };
  }

  function registerGridController(
    blockId: string,
    controller: LowCodePageRuntimeGridController,
  ) {
    gridControllers.set(blockId, controller);
    return () => {
      if (gridControllers.get(blockId) === controller) {
        gridControllers.delete(blockId);
      }
    };
  }

  function ensureGrid(
    blockId: string,
    options: { sourceKey?: string; rowKey?: string } = {}
  ) {
    const existing = state.grids[blockId];
    if (existing) {
      const previousSourceKey = existing.sourceKey;
      const previousRowKey = existing.rowKey;
      if ('sourceKey' in options) {
        if (options.sourceKey) existing.sourceKey = options.sourceKey;
        else delete existing.sourceKey;
      }
      if (options.rowKey) existing.rowKey = options.rowKey;
      if (
        existing.sourceKey !== previousSourceKey ||
        existing.rowKey !== previousRowKey
      ) {
        gridBaselines.delete(blockId);
      }
      return existing;
    }

    gridBaselines.delete(blockId);

    const grid = reactive<LowCodePageRuntimeGridState>({
      ...(options.sourceKey ? { sourceKey: options.sourceKey } : {}),
      rowKey: options.rowKey || 'id',
      rows: [],
      changes: emptyGridChanges(),
      currentRow: null,
      selectedRows: [],
      contextRow: null,
      currentCell: null,
    });
    state.grids[blockId] = grid;

    const sourceValue = options.sourceKey ? state.sources[options.sourceKey] : undefined;
    const sourceRows = Array.isArray(sourceValue)
      ? sourceValue
      : isRecord(sourceValue) && Array.isArray(sourceValue.rows)
        ? sourceValue.rows
        : undefined;
    if (sourceRows) {
      grid.rows = sourceRows.filter(isRecord);
      initializedGridIds.add(blockId);
      resetGridBaseline(blockId, grid.rows);
    }

    return grid;
  }

  function setGridRows(
    blockId: string,
    rows: LowCodeRuntimeRecord[],
    options: LowCodeGridRowsOptions = {}
  ) {
    const grid = ensureGrid(blockId, options);
    grid.rows = Array.isArray(rows) ? rows : [];
    initializedGridIds.add(blockId);
    if (options.resetBaseline || !gridBaselines.has(blockId)) {
      resetGridBaseline(blockId, grid.rows);
    } else {
      refreshGridChanges(blockId);
    }
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

 async  function applyGridEvent(blockId: string, event: LowCodeGridRuntimeEvent) {
    const rawEvent = isRecord(event.rawEvent) ? event.rawEvent : {};
    const row = readEventRow(event, rawEvent);
    const key = event.key;

    if (key === 'rowCurrentChange') {
      await setGridCurrentRow(blockId, row);//
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

    if (key === 'editClosed') refreshGridChanges(blockId);
  }

  function resetData(options: LowCodePageRuntimeResetOptions = {}) {
    clearRecord(state.sources);
    clearRecord(state.forms);
    clearRecord(state.searches);
    if (!options.preserveGrids) {
      clearRecord(state.grids);
      initializedGridIds.clear();
      gridBaselines.clear();
    } else if (!options.preserveLocalGridRows) {
      Object.keys(state.grids).forEach((blockId) => {
        initializedGridIds.delete(blockId);
        gridBaselines.delete(blockId);
        const grid = state.grids[blockId];
        if (grid) {
          grid.changes.created = [];
          grid.changes.updated = [];
          grid.changes.deleted = [];
        }
      });
    }
    state.status.loadingSourceKeys = [];
  }

  function reset() {
    resetData();
    state.status.loadingBlockId = '';
    state.status.loadingGridId = '';
    state.status.dataLoading = false;
    state.status.mesCommandExecuting = false;
    state.status.mesCommandActionKey = '';
    state.status.formMode = 'scan';
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
    pageType: undefined,
    runtimeFunctions: [],
    registerFormController,
    getFormController: (blockId) => formControllers.get(blockId),
    registerGridController,
    getGridController: (blockId) => gridControllers.get(blockId),
    isGridInitialized: (blockId) => initializedGridIds.has(blockId),
    resetData,
    reset,
    setSource(key, value, options = {}) {
      state.sources[key] = value;

      Object.entries(state.grids).forEach(([blockId, grid]) => {
        if (grid.sourceKey !== key) return;
        const rows = Array.isArray(value)
          ? value
          : isRecord(value) && Array.isArray(value.rows)
            ? value.rows
            : [];
        setGridRows(
          blockId,
          rows.filter(isRecord),
          {
            sourceKey: key,
            rowKey: grid.rowKey,
            resetBaseline: options.resetGridBaseline === true,
          }
        );
      });
    },
    replaceForm(blockId, values) {
      const current = state.forms[blockId];
      if (current) {
        clearRecord(current);
        Object.assign(current, values);
      } else {
        state.forms[blockId] = { ...values };
      }
    },
    patchForm(blockId, values) {
      if (state.forms[blockId]) Object.assign(state.forms[blockId], values);
      else state.forms[blockId] = { ...values };
    },
    replaceSearch(sourceKey, values) {
      state.searches[sourceKey] = { ...values };
    },
    patchSearch(sourceKey, values) {
      state.searches[sourceKey] = { ...(state.searches[sourceKey] ?? {}), ...values };
    },
    ensureGrid,
    setGridRows,
    getGridChanges(blockId) {
      return cloneRuntimeValue(refreshGridChanges(blockId));
    },
    setGridCurrentRow,
    setGridSelectedRows,
    setGridContextRow,
    setGridCurrentCell,
    applyGridEvent,
    setSourceLoading,
    snapshot() {
      Object.keys(state.grids).forEach(refreshGridChanges);
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
