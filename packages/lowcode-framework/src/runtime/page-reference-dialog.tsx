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
  LowCodePageBlock,
  LowCodePageFormBlock,
  LowCodePageRecord,
  LowCodeFormSchema,
  LowCodeRuntimeEvent,
} from '../types/lowcode';
import {
  openGlobalDialog,
  type GlobalDialogConfig,
  type GlobalDialogResult,
} from './global-dialog-core';
import type {
  LowCodePageRuntimeGridState,
  LowCodePageRuntimeState,
} from './page-runtime';

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
  runtime: LowCodePageRuntimeState;
  resolvedData: Record<string, unknown>;
  formModels: Record<string, Record<string, unknown>>;
  searchFilters: Record<string, Record<string, unknown>>;
  gridStates: Record<string, LowCodePageRuntimeGridState>;
};

export type LowCodePageConfirmPayload = {
  page: LowCodePageRecord;
  snapshot?: LowCodePageConfirmSnapshot;
  runtime?: LowCodePageRuntimeState;
  resolvedData: Record<string, unknown>;
  formModels: Record<string, Record<string, unknown>>;
  searchFilters: Record<string, Record<string, unknown>>;
  gridStates: Record<string, LowCodePageRuntimeGridState>;
  row?: Record<string, unknown>;
  currentRow?: Record<string, unknown>;
  selectedRow?: Record<string, unknown>;
  selectedRows: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  event?: LowCodeRuntimeEvent;
  lastEvent?: LowCodeRuntimeEvent;
  events: LowCodeRuntimeEvent[];
  savedRecord?: Record<string, unknown>;
  blockId?: string;
  blockKind?: string;
};

export type LowCodePageConfirmDialogConfig = LowCodePageReferenceDialogConfig & {
  /** Open a database-backed form definition directly instead of a page. */
  formCode?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmAction?: string;
  submitOnConfirm?: boolean;
  formInitialValues?: Record<string, Record<string, unknown>>;
  /** Explicit filters for form data sources. These replace page-internal filters. */
  filters?: Record<string, unknown>;
  disableFormAutoLoad?: boolean;
  disablePageAutoLoad?: boolean;
  includeEventHistory?: boolean;
  maxEventHistory?: number;
  onRuntimeEvent?: (
    event: LowCodeRuntimeEvent,
    payload: LowCodePageConfirmPayload,
  ) => Promise<void> | void;
};

async function resolveFormDefinitionPage(config: LowCodePageConfirmDialogConfig) {
  const formCode = readString(config.formCode);
  if (!formCode) return undefined;

  const serviceApi = config.serviceApi ?? getDefaultServiceApi();
  if (!serviceApi) throw new Error('Low-code serviceApi is not configured.');
  const rows = await serviceApi.invoke<Array<Record<string, unknown>>>('lowcode', 'listItems', {
    resource: 'lowcode_form_definitions',
    filters: { code: formCode, enabled: true },
    limit: 1,
  });
  const definition = Array.isArray(rows) && isRecord(rows[0]) ? rows[0] : undefined;
  const schema = definition?.schema;
  if (!isRecord(schema) || !Array.isArray(schema.fields) || !Array.isArray(schema.actions)) {
    throw new Error(`数据源表单“${formCode}”不存在或配置无效。`);
  }

  const formSchema = createImportFormSchema(schema as Record<string, unknown>);
  const formId = `confirm-form-${formCode.replace(/[^a-zA-Z0-9_-]+/g, '-')}`;
  const initialValues = config.formInitialValues?.[formId]
    ?? config.formInitialValues?.[formCode]
    ?? {};
  return {
    id: `confirm-form-page-${formCode}`,
    code: formCode,
    route: '',
    title: readString(definition.name, readString(formSchema.title, formCode)),
    description: typeof definition.description === 'string' ? definition.description : null,
    layout: 'blank',
    status: 'published',
    keep_alive: false,
    page_type: 'custom',
    edit_page_id: null,
    view_name: null,
    table_name: typeof definition.table_name === 'string' ? definition.table_name : null,
    relate_config: {},
    schema: {
      code: formCode,
      route: '',
      title: readString(formSchema.title, formCode),
      blocks: [{
        id: formId,
        kind: 'form',
        formType: 'default',
        title: readString(formSchema.title, '数据源'),
        schema: formSchema,
        initialValues: isRecord(initialValues) ? cloneValue(initialValues) : {},
      } satisfies LowCodePageFormBlock],
      overlays: [],
      dataSources: {},
      apis: {},
      functions: [],
      scriptPolicy: { capabilities: [] },
    },
    node_actions: [],
    runtime_functions: [],
    version: 1,
    published_at: null,
    created_at: '',
    updated_at: '',
  } as LowCodePageRecord;
}

function createImportFormSchema(rawSchema: Record<string, unknown>): LowCodeFormSchema {
  const fields = Array.isArray(rawSchema.fields)
    ? rawSchema.fields.filter(isRecord).map((field) => cloneValue(field))
    : [];
  const detailFields = new Map<string, Record<string, unknown>>();

  fields.forEach((field) => {
    if (field.component === 'lc-array-table' || field.field === 'detail') {
      const fieldName = readString(field.field);
      if (fieldName) detailFields.set(fieldName, field);
    }
  });

  const printDetail = Array.isArray(rawSchema.printDetail) ? rawSchema.printDetail : [];
  const legacyPrintFields = printDetail.length > 0 && printDetail.every((item) =>
    isRecord(item) && typeof item.field === 'string' && typeof item.component === 'string' && !Array.isArray(item.columns),
  );
  if (legacyPrintFields) {
    detailFields.set('detail', { field: 'detail', label: '明细', columns: printDetail });
  } else {
    printDetail.forEach((item, index) => {
      if (isRecord(item) && typeof item.field === 'string') {
        const fieldName = readString(item.field, `detail_${index + 1}`);
        const existing = detailFields.get(fieldName) ?? {};
        detailFields.set(fieldName, { ...existing, ...cloneValue(item), field: fieldName });
      } else if (isRecord(item)) {
        const fieldName = `detail_${index + 1}`;
        detailFields.set(fieldName, { field: fieldName, label: `明细${index + 1}`, columns: [item] });
      }
    });
  }

  if (!detailFields.size) return rawSchema as unknown as LowCodeFormSchema;

  const normalizedDetailFields = [...detailFields.values()].map((field, index) => {
    const fieldName = readString(field.field, `detail_${index + 1}`);
    const existingProps = isRecord(field.props) ? field.props : {};
    const rawColumns = Array.isArray(field.columns)
      ? field.columns
      : Array.isArray(existingProps.columns)
        ? existingProps.columns
        : [];
    const columns = rawColumns.filter(isRecord).map((column): Record<string, unknown> => ({
      ...cloneValue(column),
      field: readString(column.field),
      title: readString(column.title, readString(column.field)),
      component: column.component ?? 'vxe-input',
    })).filter((column) => column.field);
    const defaultRow = isRecord(existingProps.defaultRow)
      ? cloneValue(existingProps.defaultRow)
      : Object.fromEntries(columns.map((column) => [column.field, column.defaultValue ?? '']));
    return {
      field: fieldName,
      label: readString(field.label, `明细${index + 1}`),
      component: 'lc-array-table',
      showTitle: false,
      props: {
        ...cloneValue(existingProps),
        columns,
        defaultRow,
        rowKey: readString(existingProps.rowKey, '_rowId'),
        showSeq: existingProps.showSeq !== false,
        fillAvailableHeight: existingProps.fillAvailableHeight !== false,
        copyable: existingProps.copyable !== false,
        removable: existingProps.removable !== false,
        toolbarButtons: [
          { code: 'add', label: '新增行', command: 'add', status: 'primary' },
          {
            code: 'import',
            label: '导入',
            command: 'import',
            status: 'info',
            execute: ({ rows }: {
              rows: Record<string, unknown>[];
            }) => {
              if (typeof window === 'undefined') return;
              window.dispatchEvent(new CustomEvent('enlearn:print-data-source-import', {
                detail: {
                  field: fieldName,
                  onImported: (
                    importedRows: Record<string, unknown>[],
                    mode: 'append' | 'replace',
                  ) => {
                    if (mode === 'replace') {
                      rows.splice(0, rows.length, ...importedRows);
                    } else {
                      rows.push(...importedRows);
                    }
                  },
                },
              }));
            },
          },
          {
            code: 'clear',
            label: '清空',
            command: 'clear',
            status: 'warning',
            execute: ({ rows }: { rows: Record<string, unknown>[] }) => {
              rows.splice(0, rows.length);
            },
          },
        ],
      },
    };
  });

  const detailNames = new Set(normalizedDetailFields.map((field) => field.field));
  const headerFields = fields.filter((field) => !detailNames.has(readString(field.field)));
  const headerLayout = headerFields.map((field) => ({
    kind: 'field' as const,
    field: readString(field.field),
  }));
  const detailLayout = normalizedDetailFields.map((field) => ({
    kind: 'field' as const,
    field: field.field,
  }));

  return {
    title: readString(rawSchema.title, '数据源'),
    columns: 1,
    fields: [...headerFields, ...normalizedDetailFields] as LowCodeFormSchema['fields'],
    layout: [...headerLayout, ...detailLayout],
    actions: Array.isArray(rawSchema.actions) ? cloneValue(rawSchema.actions) : [],
  };
}

export type LowCodePageConfirmDialogResult =
  GlobalDialogResult<Record<string, unknown>> & {
    payload?: LowCodePageConfirmPayload;
  };

type LowCodePageRendererExpose = {
  getSnapshot: () => LowCodePageConfirmSnapshot;
  submitForms: (options?: { reload?: boolean }) => Promise<boolean>;
  getLastSavedFormRecord: () => Record<string, unknown> | undefined;
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
  const formPage = await resolveFormDefinitionPage(config as LowCodePageConfirmDialogConfig);
  if (formPage) return formPage;
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

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function prepareConfirmPage(
  page: LowCodePageRecord,
  config: LowCodePageConfirmDialogConfig,
) {
  const initialValues = config.formInitialValues ?? {};
  const hasFilterOverride = isRecord(config.filters);
  if (!Object.keys(initialValues).length && !config.disableFormAutoLoad && !hasFilterOverride) return page;
  const formSourceKeys = new Set<string>();

  const prepareBlocks = (blocks: LowCodePageBlock[]): LowCodePageBlock[] => blocks.map((block) => {
    if (block.kind === 'form') {
      formSourceKeys.add(block.id);
      const sourceKey = (block as LowCodePageFormBlock & { sourceKey?: string }).sourceKey;
      if (sourceKey) formSourceKeys.add(sourceKey);
      const values = initialValues[block.id];
      const dataSource = block.dataSource
        ? {
          ...block.dataSource,
          ...(hasFilterOverride
            ? {
              postData: {
                ...(block.dataSource.postData ?? {}),
                filters: cloneValue(config.filters),
              },
            }
            : {}),
        }
        : undefined;
      return {
        ...block,
        ...(values
          ? {
            initialValues: {
              ...(block.initialValues ?? {}),
              ...cloneValue(values),
            },
          }
          : {}),
        ...(dataSource
          ? { dataSource }
          : {}),
        ...(config.disableFormAutoLoad && dataSource
          ? {
            dataSource: { ...dataSource, autoLoad: false },
          }
          : {}),
      } satisfies LowCodePageFormBlock;
    }
    if (block.kind === 'tabs') {
      return {
        ...block,
        tabs: block.tabs.map((tab) => ({ ...tab, blocks: prepareBlocks(tab.blocks) })),
      };
    }
    if (block.kind === 'section' || block.kind === 'container') {
      return { ...block, blocks: prepareBlocks(block.blocks) };
    }
    if (block.kind === 'modal' || block.kind === 'drawer') {
      return { ...block, blocks: prepareBlocks(block.blocks) };
    }
    return block;
  });

  const preparedBlocks = prepareBlocks(page.schema.blocks);
  const preparedDataSources = page.schema.dataSources
    ? Object.fromEntries(Object.entries(page.schema.dataSources).map(([key, source]) => {
      const nextSource = config.disableFormAutoLoad
        ? { ...source, autoLoad: false }
        : { ...source };
      if (hasFilterOverride && formSourceKeys.has(key)) {
        nextSource.postData = {
          ...(nextSource.postData ?? {}),
          filters: cloneValue(config.filters),
        };
      }
      return [key, nextSource];
    }))
    : page.schema.dataSources;

  return {
    ...page,
    schema: {
      ...page.schema,
      dataSources: preparedDataSources,
      blocks: preparedBlocks,
    },
  };
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
  return new Promise(async (resolve, reject) => {
    const page = prepareConfirmPage(await resolveReferencePage(config), config);
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
        ...(snapshot?.runtime ? { runtime: snapshot.runtime } : {}),
        resolvedData: snapshot?.resolvedData ?? {},
        formModels: snapshot?.formModels ?? {},
        searchFilters: snapshot?.searchFilters ?? {},
        gridStates: snapshot?.gridStates ?? {},
        ...(row ? { row } : {}),
        ...(currentRow ? { currentRow } : {}),
        ...(selectedRow ? { selectedRow } : {}),
        selectedRows: cloneRows(rows),
        rows: cloneRows(rows),
        ...(lastEvent ? { event: lastEvent, lastEvent } : {}),
        events: [...events],
        ...(rendererRef.value?.getLastSavedFormRecord()
          ? { savedRecord: cloneRecord(rendererRef.value.getLastSavedFormRecord()) }
          : {}),
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
      const gridState = event.blockId
        ? rendererRef.value?.getSnapshot().gridStates[event.blockId]
        : undefined;

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

      if (gridState) {
        currentRow = cloneRecord(gridState.currentRow);
        if (gridState.selectedRows.length) {
          selectedRows = cloneRows(gridState.selectedRows);
          selectedRow = cloneRecord(gridState.selectedRows[0]) ?? selectedRow;
        } else if (
          (eventKey === 'rowCurrentChange' && !gridState.currentRow) ||
          eventKey === 'radioChange' ||
          eventKey === 'checkboxChange' ||
          eventKey === 'checkboxAll'
        ) {
          selectedRows = [];
          selectedRow = undefined;
        }
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
          role: 'confirm',
          status: 'primary',
          onClick: async () => {
            let payload = createPayload();
            if (requireSelection && !payload.row && !payload.selectedRows.length) return false;

            if (config.submitOnConfirm) {
              if (!rendererRef.value) {
                throw new Error('模板编辑页尚未加载完成，请稍后再试。');
              }
              // The dialog is destroyed immediately after confirmation. Avoid
              // waiting for a post-save page reload, which can be blocked by a
              // dialog-only data source or a stale route and leave the caller's
              // confirmLowCodePage promise pending forever.
              const submitted = await rendererRef.value.submitForms({ reload: false });
              if (!submitted) {
                throw new Error('模板保存失败，请检查模板名称和表单内容。');
              }
              payload = createPayload();
            }

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
              disablePageAutoLoad={config.disablePageAutoLoad}
              showGlobalDialogHost={false}
              onRuntimeEvent={updateSelection}
            />
          </div>
        ),
      },
    });
    resolve(result as LowCodePageConfirmDialogResult)
  })

}
