import { ref } from 'vue';
import LowCodePageRenderer from '../components/LowCodePageRenderer.vue';
import type {
  LowCodeHostRoute,
  LowCodeHostRouter,
  LowCodeHostServiceApi,
  LowCodeMessages,
  LowCodeTheme,
} from '../core/host';
import {
  getBuiltinLowCodePageByCode,
  getBuiltinLowCodePageByRoute,
} from '../lowcode/builtin-pages';
import { getLowCodePage } from './lowcode-pages';
import type {
  LowCodePageRecord,
  LowCodeRuntimeEvent,
} from '../types/lowcode';
import {
  openGlobalDialog,
  type GlobalDialogConfig,
  type GlobalDialogResult,
} from './global-dialog';

export type LowCodePageReferenceSelectEvent =
  | 'rowDblclick'
  | 'cellDblclick'
  | 'rowCurrentChange';

export type LowCodePageReferencePayload = {
  row: Record<string, unknown>;
  value?: unknown;
  label?: unknown;
  event: LowCodeRuntimeEvent;
  page: LowCodePageRecord;
  blockId?: string;
  blockKind?: string;
};

export type LowCodePageReferenceDialogConfig = {
  code?: string;
  pageCode?: string;
  pageRoute?: string;
  page?: LowCodePageRecord;
  title?: string;
  width?: string | number;
  height?: string | number;
  className?: unknown;
  props?: Record<string, unknown>;
  includeData?: boolean;
  serviceApi?: LowCodeHostServiceApi;
  router?: LowCodeHostRouter;
  route?: LowCodeHostRoute;
  locale?: string;
  messages?: LowCodeMessages;
  theme?: LowCodeTheme;
  selectOn?: LowCodePageReferenceSelectEvent | LowCodePageReferenceSelectEvent[];
  valueField?: string;
  labelField?: string;
  resultAction?: string;
  requireSelection?: boolean;
  dialog?: Omit<
    Partial<GlobalDialogConfig>,
    'actions' | 'body' | 'content' | 'footer' | 'form' | 'grid' | 'model' | 'onConfirm'
  >;
};

export type LowCodePageReferenceDialogResult =
  GlobalDialogResult<Record<string, unknown>> & {
    payload?: LowCodePageReferencePayload;
  };

export type LowCodePageConfirmSnapshot = {
  page: LowCodePageRecord;
  resolvedData: Record<string, unknown>;
  formModels: Record<string, Record<string, unknown>>;
  searchFilters: Record<string, Record<string, unknown>>;
};

export type LowCodePageConfirmPayload = {
  page: LowCodePageRecord;
  snapshot?: LowCodePageConfirmSnapshot;
  resolvedData: Record<string, unknown>;
  formModels: Record<string, Record<string, unknown>>;
  searchFilters: Record<string, Record<string, unknown>>;
  row?: Record<string, unknown>;
  currentRow?: Record<string, unknown>;
  selectedRow?: Record<string, unknown>;
  selectedRows: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  event?: LowCodeRuntimeEvent;
  lastEvent?: LowCodeRuntimeEvent;
  events: LowCodeRuntimeEvent[];
  blockId?: string;
  blockKind?: string;
};

export type LowCodePageConfirmDialogConfig = LowCodePageReferenceDialogConfig & {
  confirmLabel?: string;
  cancelLabel?: string;
  confirmAction?: string;
  includeEventHistory?: boolean;
  maxEventHistory?: number;
  onRuntimeEvent?: (
    event: LowCodeRuntimeEvent,
    payload: LowCodePageConfirmPayload,
  ) => Promise<void> | void;
};

export type LowCodePageConfirmDialogResult =
  GlobalDialogResult<Record<string, unknown>> & {
    payload?: LowCodePageConfirmPayload;
  };

type LowCodePageRendererExpose = {
  getSnapshot: () => LowCodePageConfirmSnapshot;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function getDefaultServiceApi() {
  if (typeof useServiceApi === 'function') {
    return useServiceApi();
  }

  return undefined;
}

function isMissingLowCodePageError(error: unknown) {
  const fetchError = error as {
    status?: number;
    statusCode?: number;
    statusMessage?: string;
    message?: string;
    data?: { message?: string; statusMessage?: string };
  };
  const statusCode = fetchError.statusCode ?? fetchError.status;
  const message = [
    fetchError.statusMessage,
    fetchError.message,
    fetchError.data?.message,
    fetchError.data?.statusMessage,
  ]
    .filter(Boolean)
    .join(' ');

  return statusCode === 404 || message.includes('Low-code page not found');
}

function getBuiltinReferencePage(code: string, route: string) {
  return (
    (code ? getBuiltinLowCodePageByCode(code) : null) ??
    (route ? getBuiltinLowCodePageByRoute(route) : null)
  );
}

async function resolveReferencePage(config: LowCodePageReferenceDialogConfig) {
  if (config.page) return config.page;

  const code = readString(config.pageCode ?? config.code);
  const route = readString(config.pageRoute);
  const builtinPage = getBuiltinReferencePage(code, route);
  const serviceApi = config.serviceApi ?? getDefaultServiceApi();

  if (!serviceApi) {
    if (builtinPage) return builtinPage;
    throw new Error('Low-code serviceApi is not configured.');
  }

  try {
    return await getLowCodePage(serviceApi, {
      code,
      route,
      includeData: config.includeData !== false,
    });
  } catch (error) {
    if (builtinPage && isMissingLowCodePageError(error)) {
      return builtinPage;
    }

    throw error;
  }
}

function normalizeSelectEvents(
  selectOn: LowCodePageReferenceDialogConfig['selectOn'],
) {
  const events = Array.isArray(selectOn) ? selectOn : [selectOn ?? 'rowDblclick'];
  return new Set<string>(events.filter(Boolean));
}

function readEventKey(event: LowCodeRuntimeEvent) {
  const payloadKey = event.payload?.key;
  if (typeof payloadKey === 'string' && payloadKey.trim()) {
    return payloadKey.trim();
  }

  if (event.name === 'grid.rowDblclick') return 'rowDblclick';
  if (event.name === 'grid.cellDblclick') return 'cellDblclick';
  if (event.name === 'grid.rowCurrentChange') return 'rowCurrentChange';
  return '';
}

function readEventRow(event: LowCodeRuntimeEvent) {
  return isRecord(event.payload?.row) ? event.payload.row : null;
}

function readEventRows(event: LowCodeRuntimeEvent) {
  const payload = event.payload ?? {};
  const rawEvent = isRecord(payload.rawEvent) ? payload.rawEvent : {};
  const candidates = [
    payload.rows,
    payload.records,
    payload.selection,
    payload.checkedRows,
    payload.checkedRecords,
    rawEvent.rows,
    rawEvent.records,
    rawEvent.selection,
    rawEvent.checkedRows,
    rawEvent.checkedRecords,
  ];

  const rows = candidates.find(
    (value): value is Record<string, unknown>[] =>
      Array.isArray(value) && value.every(isRecord),
  );

  return rows ? rows.map((row) => ({ ...row })) : [];
}

function cloneRecord(value: Record<string, unknown> | undefined | null) {
  return value ? { ...value } : undefined;
}

function cloneRows(value: Record<string, unknown>[]) {
  return value.map((row) => ({ ...row }));
}

function createReferencePayload(
  row: Record<string, unknown>,
  event: LowCodeRuntimeEvent,
  page: LowCodePageRecord,
  config: LowCodePageReferenceDialogConfig,
): LowCodePageReferencePayload {
  const valueField = readString(config.valueField);
  const labelField = readString(config.labelField);

  return {
    row,
    ...(valueField ? { value: row[valueField] } : {}),
    ...(labelField ? { label: row[labelField] } : {}),
    event,
    page,
    blockId: event.blockId,
    blockKind: event.blockKind,
  };
}

function mergeDialogClassName(value: unknown) {
  return typeof value === 'string' && value.trim()
    ? `lowcode-reference-dialog ${value.trim()}`
    : 'lowcode-reference-dialog';
}

export async function openLowCodePageReferenceDialog(
  config: LowCodePageReferenceDialogConfig,
): Promise<LowCodePageReferenceDialogResult> {
  const page = await resolveReferencePage(config);
  const selectEvents = normalizeSelectEvents(config.selectOn);
  const resultAction = readString(config.resultAction, 'select');
  const requireSelection = config.requireSelection !== false;
  let selectedPayload: LowCodePageReferencePayload | undefined;
  let closing = false;

  const result = await openGlobalDialog({
    ...(config.dialog ?? {}),
    title: config.title ?? page.title,
    width: config.width ?? 'min(1360px, calc(100vw - 40px))',
    height: config.height,
    className: mergeDialogClassName(config.className ?? config.dialog?.className),
    props: {
      top: '4vh',
      destroyOnClose: true,
      ...(config.dialog?.props ?? {}),
      ...(config.props ?? {}),
    },
    showFooter: true,
    actions: [
      {
        code: 'cancel',
        label: '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: '确定',
        role: 'custom',
        status: 'primary',
        onClick: () => {
          if (!selectedPayload && requireSelection) return false;
          return {
            close: true,
            action: selectedPayload ? resultAction : 'confirm',
            payload: selectedPayload,
          };
        },
      },
    ],
    content: {
      type: 'render',
      render: (context) =>
        (
          <div class="lc-global-dialog__page-reference">
            <LowCodePageRenderer
              page={page}
              serviceApi={config.serviceApi}
              router={config.router}
              route={config.route}
              locale={config.locale}
              messages={config.messages}
              theme={config.theme}
              showGlobalDialogHost={false}
              onRuntimeEvent={async (event: LowCodeRuntimeEvent) => {
                const row = readEventRow(event);
                if (!row) return;

                const payload = createReferencePayload(row, event, page, config);
                const eventKey = readEventKey(event);
                if (eventKey === 'rowCurrentChange') {
                  selectedPayload = payload;
                }

                if (!selectEvents.has(eventKey) || closing) return;

                closing = true;
                selectedPayload = payload;
                await context.close({
                  action: resultAction,
                  payload,
                });
              }}
            />
          </div>
        ),
    },
  });

  return result as LowCodePageReferenceDialogResult;
}

export async function openLowCodePageConfirmDialog(
  config: LowCodePageConfirmDialogConfig,
): Promise<LowCodePageConfirmDialogResult> {
  const page = await resolveReferencePage(config);
  const resultAction = readString(config.confirmAction ?? config.resultAction, 'confirm');
  const requireSelection = config.requireSelection === true;
  const includeEventHistory = config.includeEventHistory !== false;
  const maxEventHistory = Math.max(1, Number(config.maxEventHistory ?? 50));
  const rendererRef = ref<LowCodePageRendererExpose | null>(null);
  let currentRow: Record<string, unknown> | undefined;
  let selectedRow: Record<string, unknown> | undefined;
  let selectedRows: Record<string, unknown>[] = [];
  let lastEvent: LowCodeRuntimeEvent | undefined;
  const events: LowCodeRuntimeEvent[] = [];

  const createPayload = (): LowCodePageConfirmPayload => {
    const snapshot = rendererRef.value?.getSnapshot();
    const row = selectedRow ?? currentRow;
    const rows = selectedRows.length ? selectedRows : row ? [row] : [];

    return {
      page,
      ...(snapshot ? { snapshot } : {}),
      resolvedData: snapshot?.resolvedData ?? {},
      formModels: snapshot?.formModels ?? {},
      searchFilters: snapshot?.searchFilters ?? {},
      ...(row ? { row } : {}),
      ...(currentRow ? { currentRow } : {}),
      ...(selectedRow ? { selectedRow } : {}),
      selectedRows: cloneRows(rows),
      rows: cloneRows(rows),
      ...(lastEvent ? { event: lastEvent, lastEvent } : {}),
      events: [...events],
      ...(lastEvent?.blockId ? { blockId: lastEvent.blockId } : {}),
      ...(lastEvent?.blockKind ? { blockKind: lastEvent.blockKind } : {}),
    };
  };

  const updateSelection = async (event: LowCodeRuntimeEvent) => {
    lastEvent = event;
    if (includeEventHistory) {
      events.push(event);
      if (events.length > maxEventHistory) {
        events.splice(0, events.length - maxEventHistory);
      }
    }

    const row = readEventRow(event);
    const rows = readEventRows(event);
    const eventKey = readEventKey(event);

    if (eventKey === 'rowCurrentChange' && row) {
      currentRow = cloneRecord(row);
      selectedRow = cloneRecord(row);
      selectedRows = [cloneRecord(row)].filter(isRecord);
    } else if (row) {
      selectedRow = cloneRecord(row);
      currentRow = cloneRecord(row);
      if (!selectedRows.length) {
        selectedRows = [cloneRecord(row)].filter(isRecord);
      }
    }

    if (rows.length) {
      selectedRows = rows;
      selectedRow = cloneRecord(rows[0]) ?? selectedRow;
    }

    await config.onRuntimeEvent?.(event, createPayload());
  };

  const result = await openGlobalDialog({
    ...(config.dialog ?? {}),
    title: config.title ?? page.title,
    width: config.width ?? 'min(1360px, calc(100vw - 40px))',
    height: config.height,
    className: mergeDialogClassName(config.className ?? config.dialog?.className),
    props: {
      top: '4vh',
      destroyOnClose: true,
      ...(config.dialog?.props ?? {}),
      ...(config.props ?? {}),
    },
    showFooter: true,
    actions: [
      {
        code: 'cancel',
        label: config.cancelLabel ?? '取消',
        role: 'cancel',
      },
      {
        code: 'confirm',
        label: config.confirmLabel ?? '确定',
        role: 'custom',
        status: 'primary',
        onClick: () => {
          const payload = createPayload();
          if (requireSelection && !payload.row && !payload.selectedRows.length) return false;

          return {
            close: true,
            action: resultAction,
            payload,
          };
        },
      },
    ],
    content: {
      type: 'render',
      render: () =>
        (
          <div class="lc-global-dialog__page-reference">
            <LowCodePageRenderer
              ref={rendererRef}
              page={page}
              serviceApi={config.serviceApi}
              router={config.router}
              route={config.route}
              locale={config.locale}
              messages={config.messages}
              theme={config.theme}
              showGlobalDialogHost={false}
              onRuntimeEvent={updateSelection}
            />
          </div>
        ),
    },
  });

  return result as LowCodePageConfirmDialogResult;
}
