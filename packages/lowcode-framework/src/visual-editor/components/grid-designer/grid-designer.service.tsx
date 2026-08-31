import {
  createApp,
  defineComponent,
  getCurrentInstance,
  nextTick,
  onMounted,
  PropType,
  reactive,
} from 'vue';
import DesignerUI, {
  ElMessage,
} from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import {
  closeGlobalDialog,
  confirmLowCodePage,
  findGlobalDialog,
  openGlobalDialog,
  type GlobalDialogContentNode,
} from '../../../runtime/global-dialog';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodeOption,
  LowCodePageBlock,
  LowCodePageDataSource,
  LowCodePageGridBlock,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
} from '../../../types/lowcode';
import {
  createSubFormField,
  isLowCodeFormSchema,
} from '../../../lowcode/form-schema';
import { defer } from '../../utils/defer';
import { generateNanoid } from '../../utils';
import type { LowCodeHostServiceApi } from '../../../core/host';

export type GridDesignerColumn = {
  __id?: string;
  field?: string;
  title?: string;
  editType?: string;
  type?: string;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  fixed?: string;
  align?: string;
  headerAlign?: string;
  footerAlign?: string;
  sortable?: boolean;
  resizable?: boolean;
  visible?: boolean;
  showOverflow?: string | boolean;
  showHeaderOverflow?: string | boolean;
  showFooterOverflow?: string | boolean;
  formatter?: unknown;
  filters?: unknown[];
  cellRender?: Record<string, unknown>;
  editRender?: Record<string, unknown>;
  params?: Record<string, unknown>;
  [key: string]: unknown;
};

type GridDesignerSelectionColumnType = '' | 'checkbox' | 'radio';

type GridDesignerFormSettings = {
  selectionColumnType: GridDesignerSelectionColumnType;
  selectionColumnWidth: string | number;
  selectionColumnFixed: '' | 'left' | 'right';
};

export type GridDesignerTableType = 'main' | 'detail' | 'default';
export type GridDesignerSourceType = 'custom' | 'table' | 'view';

export type GridDesignerBusinessInfo = {
  blockId: string;
  title: string;
  tableType: GridDesignerTableType;
  sourceType: GridDesignerSourceType;
  tableName: string;
  viewName: string;
  categoryField: string;
  sourceKey: string;
  serviceName: string;
  serviceMethod: string;
  saveMethod: string;
  deleteMethod: string;
  postDataJson: string;
  showRowActions: boolean;
};

export type GridDesignerDetailConfig = {
  enabled: boolean;
  parentSourceKey: string;
  resource: string;
  foreignKey: string;
  parentKey: string;
  inheritFields: string[];
  updateMode: 'replace' | 'changes';
  defaults: Record<string, unknown>;
  stripCreatedKey: boolean;
};

export type GridDesignerEvent = {
  key: string;
  vxeName: string;
  nativeName: string;
  label: string;
  enabled: boolean;
  eventName?: string;
  directivesJson?: string;
  directives?: LowCodeRuntimeDirective[];
};

export type GridDesignerResult = {
  business: GridDesignerBusinessInfo;
  detailConfig: GridDesignerDetailConfig;
  columns: GridDesignerColumn[];
  gridOptions: Record<string, unknown>;
  gridEvents: GridDesignerEvent[];
};

interface GridDesignerServiceOption {
  title?: string;
  business?: Partial<GridDesignerBusinessInfo> | null;
  detailConfig?: Partial<GridDesignerDetailConfig> | null;
  dataSources?: Record<string, LowCodePageDataSource>;
  columns?: GridDesignerColumn[];
  gridOptions?: Record<string, unknown> | null;
  gridEvents?: GridDesignerEvent[] | null;
  serviceApi?: LowCodeHostServiceApi;
  onConfirm?: (value: GridDesignerResult) => Promise<void> | void;
}

type GridDesignerSourceKind = 'entity' | 'view';

type GridDesignerSourceOption = {
  id: string;
  code: string;
  title: string;
  fullName: string;
  primaryKey?: string;
  status?: string;
  columns: GridDesignerSourceColumn[];
};

type GridDesignerSourceColumn = {
  field: string;
  title: string;
  dataType: string;
  primaryKey?: boolean;
};

type GridDesignerFieldOptionColumn = {
  field?: unknown;
  title?: unknown;
  label?: unknown;
};

function createGridDesignerTableFieldOptions(
  columns: readonly GridDesignerFieldOptionColumn[],
): LowCodeOption[] {
  const options = new Map<string, LowCodeOption>();

  columns.forEach((column) => {
    const field = readString(column.field);
    if (!field) return;

    const title = readString(column.title, readString(column.label, field));
    options.set(field, {
      label: title === field ? field : `${title} (${field})`,
      value: field,
    });
  });

  return [...options.values()];
}

const gridDesignerFormCode = 'grid-designer';

const gridDesignerFormCodes = {
  columns: 'grid-designer-columns',
  businessInfo: 'grid-designer-business-info',
  detailConfig: 'grid-designer-detail-config',
  gridOptions: 'grid-designer-grid-options',
  formSettings: 'grid-designer-form-settings',
  rowConfig: 'grid-designer-row-config',
  columnConfig: 'grid-designer-column-config',
  events: 'grid-designer-events',
  extraProps: 'grid-designer-extra-props',
} as const;

const gridDesignerSourcePageCodes: Record<GridDesignerSourceKind, string> = {
  entity: 'admin-system-entities',
  view: 'entity-views',
};

const gridDesignerFieldOptionSourceKeys = {
  source: 'grid-designer-source-fields',
  detail: 'grid-designer-detail-fields',
  parent: 'grid-designer-parent-fields',
  pageSources: 'grid-designer-page-sources',
} as const;

declare const useServiceApi: undefined | (() => LowCodeHostServiceApi);

type JsonParseResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      message: string;
    };

type JsonParseSuccess = Extract<JsonParseResult, { ok: true }>;

function assertJsonParsed(result: JsonParseResult): asserts result is JsonParseSuccess {
  if (result.ok === false) {
    throw new Error(result.message);
  }
}

type AdvancedGridConfigDefinition = {
  code: string;
  field: string;
  label: string;
};

const advancedGridConfigDefinitions: AdvancedGridConfigDefinition[] = [
  { code: 'grid-designer-pager-config', field: 'pagerConfigJson', label: '分页配置' },
  { code: 'grid-designer-toolbar-config', field: 'toolbarConfigJson', label: '工具栏配置' },
  { code: 'grid-designer-proxy-config', field: 'proxyConfigJson', label: '数据代理配置' },
  { code: 'grid-designer-edit-config', field: 'editConfigJson', label: '编辑配置' },
  { code: 'grid-designer-checkbox-config', field: 'checkboxConfigJson', label: '复选配置' },
  { code: 'grid-designer-radio-config', field: 'radioConfigJson', label: '单选配置' },
  { code: 'grid-designer-sort-config', field: 'sortConfigJson', label: '排序配置' },
  { code: 'grid-designer-filter-config', field: 'filterConfigJson', label: '筛选配置' },
  { code: 'grid-designer-tree-config', field: 'treeConfigJson', label: '树形配置' },
  { code: 'grid-designer-expand-config', field: 'expandConfigJson', label: '展开配置' },
];

const columnAdvancedFormSections: Array<{ code: string; title: string }> = [
  { code: 'grid-designer-column-size-align', title: '尺寸与对齐' },
  { code: 'grid-designer-column-display', title: '显示行为' },
  { code: 'grid-designer-column-filters', title: '筛选项' },
  { code: 'grid-designer-column-renderers', title: '渲染配置' },
];

const eventDefinitions: Omit<
  GridDesignerEvent,
  'enabled' | 'eventName' | 'directivesJson' | 'directives'
>[] = [
  {
    key: 'rowCurrentChange',
    vxeName: 'currentRowChange',
    nativeName: 'current-row-change',
    label: '当前行变化',
  },
  {
    key: 'cellClick',
    vxeName: 'cellClick',
    nativeName: 'cell-click',
    label: '单元格点击',
  },
  {
    key: 'cellDblclick',
    vxeName: 'cellDblclick',
    nativeName: 'cell-dblclick',
    label: '单元格双击',
  },
  {
    key: 'rowDblclick',
    vxeName: 'rowDblclick',
    nativeName: 'row-dblclick',
    label: '行双击',
  },
  {
    key: 'radioChange',
    vxeName: 'radioChange',
    nativeName: 'radio-change',
    label: '单选变化',
  },
  {
    key: 'checkboxChange',
    vxeName: 'checkboxChange',
    nativeName: 'checkbox-change',
    label: '复选变化',
  },
  {
    key: 'checkboxAll',
    vxeName: 'checkboxAll',
    nativeName: 'checkbox-all',
    label: '全选变化',
  },
  {
    key: 'sortChange',
    vxeName: 'sortChange',
    nativeName: 'sort-change',
    label: '排序变化',
  },
  {
    key: 'filterChange',
    vxeName: 'filterChange',
    nativeName: 'filter-change',
    label: '筛选变化',
  },
  {
    key: 'pageChange',
    vxeName: 'pageChange',
    nativeName: 'page-change',
    label: '分页变化',
  },
  {
    key: 'toolbarButtonClick',
    vxeName: 'toolbarButtonClick',
    nativeName: 'toolbar-button-click',
    label: '工具栏按钮',
  },
  {
    key: 'toolbarToolClick',
    vxeName: 'toolbarToolClick',
    nativeName: 'toolbar-tool-click',
    label: '工具栏工具',
  },
  {
    key: 'proxyQuery',
    vxeName: 'proxyQuery',
    nativeName: 'proxy-query',
    label: '代理查询',
  },
  {
    key: 'proxyDelete',
    vxeName: 'proxyDelete',
    nativeName: 'proxy-delete',
    label: '代理删除',
  },
  {
    key: 'proxySave',
    vxeName: 'proxySave',
    nativeName: 'proxy-save',
    label: '代理保存',
  },
  {
    key: 'formSubmit',
    vxeName: 'formSubmit',
    nativeName: 'form-submit',
    label: '内置表单提交',
  },
  {
    key: 'formReset',
    vxeName: 'formReset',
    nativeName: 'form-reset',
    label: '内置表单重置',
  },
  {
    key: 'zoom',
    vxeName: 'zoom',
    nativeName: 'zoom',
    label: '最大化切换',
  },
];

const commonGridOptionKeys = new Set([
  'id',
  'size',
  'height',
  'mobileDisplay',
  'rowHeight',
  'headerHeight',
  'overscanRowCount',
  'overscanColumnCount',
  'minHeight',
  'maxHeight',
  'border',
  'stripe',
  'round',
  'showHeader',
  'showFooter',
  'showOverflow',
  'showHeaderOverflow',
  'showFooterOverflow',
  'align',
  'headerAlign',
  'footerAlign',
  'autoResize',
  'keepSource',
  'rowConfig',
  'columnConfig',
  'pagerConfig',
  'toolbarConfig',
  'proxyConfig',
  'editConfig',
  'checkboxConfig',
  'radioConfig',
  'sortConfig',
  'filterConfig',
  'treeConfig',
  'expandConfig',
]);

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback = '') {
  if (Array.isArray(value)) return readString(value[value.length - 1], fallback);
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function resolveGridDesignerDataSourceTableName(source?: LowCodePageDataSource) {
  const postData = source?.postData ?? {};
  return readString(
    source?.tableName ??
      source?.table_name ??
      source?.viewName ??
      postData.tableName ??
      postData.table_name ??
      postData.resource,
  );
}

function createGridDesignerPageSourceOptions(
  dataSources?: Record<string, LowCodePageDataSource>,
  excludedSourceKey = '',
): LowCodeOption[] {
  if (!dataSources) return [];

  return Object.entries(dataSources).flatMap(([key, source]) => {
    const sourceKey = readString(source?.key, key);
    if (
      !sourceKey ||
      sourceKey === excludedSourceKey ||
      !resolveGridDesignerDataSourceTableName(source)
    ) return [];

    const label = readString(source?.label, sourceKey);
    return [{
      label: label === sourceKey ? sourceKey : `${label} (${sourceKey})`,
      value: sourceKey,
    }];
  });
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return fallback;
}

function readDimension(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim();
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && String(numeric) === trimmed ? numeric : trimmed;
  }
  return '';
}

function stringifyJson(value: unknown, fallback: unknown) {
  const target = typeof value === 'undefined' ? fallback : value;
  return JSON.stringify(target, null, 2);
}

function parseJson(value: string, label: string): JsonParseResult {
  if (!value.trim()) {
    return { ok: true, value: undefined };
  }

  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false, message: `${label} JSON 格式不正确` };
  }
}

function parseJsonObject(value: string, label: string): JsonParseResult {
  const parsed = parseJson(value, label);
  if (!parsed.ok || typeof parsed.value === 'undefined') return parsed;
  return isPlainRecord(parsed.value)
    ? parsed
    : { ok: false, message: `${label} 必须是 JSON 对象` };
}

function parseJsonArray(value: string, label: string): JsonParseResult {
  const parsed = parseJson(value, label);
  if (!parsed.ok || typeof parsed.value === 'undefined') return parsed;
  return Array.isArray(parsed.value)
    ? parsed
    : { ok: false, message: `${label} 必须是 JSON 数组` };
}

function readJsonArrayValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return cloneDeep(value);
  if (typeof value !== 'string' || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonValueOrString(value: unknown, label: string): JsonParseResult {
  const text = readString(value);
  if (!text) return { ok: true, value: undefined };
  if (!/^[\[{]/.test(text)) return { ok: true, value: text };
  return parseJson(text, label);
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.entries(value).reduce<Record<string, unknown>>((result, [key, item]) => {
    if (typeof item === 'undefined' || item === null || item === '') return result;
    if (Array.isArray(item) && item.length === 0) return result;

    if (isPlainRecord(item)) {
      const child = compactObject(item);
      if (Object.keys(child).length) result[key] = child;
      return result;
    }

    result[key] = item;
    return result;
  }, {});
}

function createDefaultColumn(index = 0): GridDesignerColumn {
  return {
    __id: `column_${generateNanoid()}`,
    field: `field_${index + 1}`,
    title: `列${index + 1}`,
    editType: '',
    type: '',
    width: '',
    minWidth: 120,
    maxWidth: '',
    fixed: '',
    align: '',
    headerAlign: '',
    footerAlign: '',
    sortable: false,
    resizable: true,
    visible: true,
    showOverflow: '',
    showHeaderOverflow: '',
    showFooterOverflow: '',
    formatter: '',
    filters: [],
    cellRender: {},
    editRender: {},
    params: {},
  };
}

function normalizeColumn(column: unknown, index: number): GridDesignerColumn {
  const row = isPlainRecord(column) ? column : {};
  const fallback = createDefaultColumn(index);
  const type = readString(row.type);
  const isFieldlessSelectionColumn = type === 'checkbox' || type === 'radio';
  const sourceEditRender = isPlainRecord(row.editRender) ? cloneDeep(row.editRender) : {};
  const currentEditType = readString(sourceEditRender.name);
  const editType = Object.prototype.hasOwnProperty.call(row, 'editType')
    ? readString(row.editType)
    : currentEditType;
  const editRender = editType === currentEditType
    ? sourceEditRender
    : editType
      ? { ...sourceEditRender, name: editType }
      : {};

  return {
    ...fallback,
    __id: readString(row.__id, fallback.__id),
    field: isFieldlessSelectionColumn ? readString(row.field) : readString(row.field, fallback.field),
    title: isFieldlessSelectionColumn
      ? readString(row.title)
      : readString(row.title, readString(row.field, fallback.title)),
    editType,
    type,
    width: readDimension(row.width),
    minWidth: readDimension(row.minWidth),
    maxWidth: readDimension(row.maxWidth),
    fixed: readString(row.fixed),
    align: readString(row.align),
    headerAlign: readString(row.headerAlign),
    footerAlign: readString(row.footerAlign),
    sortable: readBoolean(row.sortable),
    resizable: readBoolean(row.resizable, true),
    visible: row.visible === undefined ? true : readBoolean(row.visible, true),
    showOverflow: row.showOverflow === undefined ? '' : (row.showOverflow as string | boolean),
    showHeaderOverflow:
      row.showHeaderOverflow === undefined ? '' : (row.showHeaderOverflow as string | boolean),
    showFooterOverflow:
      row.showFooterOverflow === undefined ? '' : (row.showFooterOverflow as string | boolean),
    formatter: isPlainRecord(row.formatter) ? cloneDeep(row.formatter) : readString(row.formatter),
    filters: Array.isArray(row.filters) ? cloneDeep(row.filters) : [],
    cellRender: isPlainRecord(row.cellRender) ? cloneDeep(row.cellRender) : {},
    editRender,
    params: isPlainRecord(row.params) ? cloneDeep(row.params) : {},
  };
}

function isSelectionColumn(column: GridDesignerColumn) {
  return column.type === 'checkbox' || column.type === 'radio';
}

function normalizeSelectionColumnType(value: unknown): GridDesignerSelectionColumnType {
  const type = readString(value);
  return type === 'checkbox' || type === 'radio' ? type : '';
}

function createFormSettings(columns: GridDesignerColumn[]): GridDesignerFormSettings {
  const selectionColumn = columns.find(isSelectionColumn);
  const fixed = readString(selectionColumn?.fixed);

  return {
    selectionColumnType: normalizeSelectionColumnType(selectionColumn?.type),
    selectionColumnWidth: readDimension(selectionColumn?.width) || 48,
    selectionColumnFixed: fixed === 'right' ? 'right' : fixed === '' ? '' : 'left',
  };
}

function applyFormSettingsToColumns(
  columns: GridDesignerColumn[],
  settings: GridDesignerFormSettings,
) {
  const selectionColumn = columns.find(isSelectionColumn);
  const dataColumns = columns.filter((column) => !isSelectionColumn(column));
  const selectionColumnType = normalizeSelectionColumnType(settings.selectionColumnType);
  if (!selectionColumnType) return dataColumns.length ? dataColumns : [createDefaultColumn()];

  const fixed = readString(settings.selectionColumnFixed);
  const nextSelectionColumn: GridDesignerColumn = {
    ...(selectionColumn ?? {}),
    __id: readString(selectionColumn?.__id, `column_${generateNanoid()}`),
    type: selectionColumnType,
    field: '',
    title: '',
    width: readDimension(settings.selectionColumnWidth) || 48,
    minWidth: '',
    maxWidth: '',
    fixed: fixed === 'right' ? 'right' : fixed === '' ? '' : 'left',
    align: 'center',
    headerAlign: 'center',
    sortable: false,
    visible: true,
  };

  return nextSelectionColumn.fixed === 'right'
    ? [...dataColumns, nextSelectionColumn]
    : [nextSelectionColumn, ...dataColumns];
}

function normalizeColumns(columns: unknown) {
  const rows = Array.isArray(columns) ? columns : [];
  const normalized = rows.map((column, index) => normalizeColumn(column, index));
  return normalized.length ? normalized : [createDefaultColumn()];
}

function humanizeIdentifier(value: unknown) {
  const text = readString(value);
  if (!text) return '';
  return text
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function parseColumnCommentOverrides(
  comment: unknown,
): Partial<Pick<GridDesignerColumn, 'title' | 'type'>> | null {
  const rawComment = readString(comment);
  if (!rawComment) return null;

  try {
    const metadata: unknown = JSON.parse(rawComment);
    if (!isPlainRecord(metadata)) return null;

    const title = readString(metadata.title);
    const type = readString(metadata.type);
    if (!title && !type) return null;

    return {
      ...(title ? { title } : {}),
      ...(type ? { type } : {}),
    };
  } catch {
    return null;
  }
}

function createColumnsFromSource(columns: GridDesignerSourceColumn[]) {
  return columns.map<GridDesignerColumn>((column, index) => {
    const field = readString(column.field, `field_${index + 1}`);
    const dataType = readString(column.dataType).toLowerCase();
    const isBoolean = dataType.includes('bool');
    const isTemporal = dataType.includes('date') || dataType.includes('time');

    return {
      ...createDefaultColumn(index),
      field,
      title: readString(column.title, humanizeIdentifier(field)),
      align: isBoolean ? 'center' : '',
      width: column.primaryKey ? 230 : '',
      minWidth: column.primaryKey ? '' : isTemporal ? 180 : isBoolean ? 90 : 150,
      fixed: column.primaryKey ? 'left' : '',
      formatter: isTemporal
        ? { type: dataType.includes('time') ? 'datetime' : 'date', emptyText: '-' }
        : '',
    };
  });
}

function mergeColumnsFromSource(
  currentColumns: GridDesignerColumn[],
  sourceColumns: GridDesignerSourceColumn[],
) {
  const importedColumns = createColumnsFromSource(sourceColumns);
  const importedByField = new Map(
    importedColumns.map((column) => [readString(column.field), column]),
  );

  return [
    ...currentColumns.map((column) => {
      const field = readString(column.field);
      const importedColumn = importedByField.get(field);
      return importedColumn
        ? {
            ...column,
            ...importedColumn,
            __id: readString(column.__id, readString(importedColumn.__id)),
          }
        : column;
    }),
    ...importedColumns.filter(
      (column) =>
        !currentColumns.some(
          (current) => readString(current.field) === readString(column.field),
        ),
    ),
  ];
}

function clearSourceTargetAliases(
  value: Record<string, unknown>,
  clearResource = false,
) {
  const nextValue = cloneDeep(value);
  delete nextValue.tableName;
  delete nextValue.table_name;
  delete nextValue.entityCode;
  delete nextValue.entity_code;
  delete nextValue.viewName;
  delete nextValue.view_name;
  if (clearResource) delete nextValue.resource;
  return nextValue;
}

function readPostDataObject(value: unknown) {
  if (isPlainRecord(value)) return cloneDeep(value);
  if (typeof value !== 'string') return {};

  const parsed = parseJsonObject(value, 'postDataJson');
  return parsed.ok && isPlainRecord(parsed.value) ? cloneDeep(parsed.value) : {};
}

function createSourcePostData(
  currentValue: unknown,
  sourceTarget = '',
  clearResource = Boolean(sourceTarget),
  clearTargetAliases = Boolean(sourceTarget),
) {
  const currentPostData = readPostDataObject(currentValue);
  const postData = clearTargetAliases
    ? clearSourceTargetAliases(currentPostData, clearResource)
    : currentPostData;
  if (sourceTarget) postData.tableName = sourceTarget;
  return postData;
}

function createSourceKey(source: GridDesignerSourceOption) {
  const sourceName = readString(source.code, source.fullName.split('.').pop() ?? 'records');
  const normalized = sourceName
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .split('_')
    .filter(Boolean)
    .map((part, index) =>
      index === 0
        ? part.toLowerCase()
        : `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}`,
    )
    .join('');

  return `${normalized || 'records'}Records`;
}

function readSourceRowFromConfirmPayload(payload: unknown) {
  if (!isPlainRecord(payload)) return null;

  return [
    payload.row,
    payload.selectedRow,
    payload.currentRow,
    Array.isArray(payload.selectedRows) ? payload.selectedRows[0] : undefined,
    Array.isArray(payload.rows) ? payload.rows[0] : undefined,
  ].find(isPlainRecord) ?? null;
}

function createDefaultBusiness(): GridDesignerBusinessInfo {
  return {
    blockId: 'records-grid',
    title: '数据列表',
    tableType: 'default',
    sourceType: 'table',
    tableName: 'profiles',
    viewName: '',
    categoryField: '',
    sourceKey: 'records',
    serviceName: 'admin',
    serviceMethod: 'listItems',
    saveMethod: '',
    deleteMethod: '',
    postDataJson: '{\n  "tableName": "profiles"\n}',
    showRowActions: true,
  };
}

function normalizeBusiness(value: unknown): GridDesignerBusinessInfo {
  const row = isPlainRecord(value) ? value : {};
  const fallback = createDefaultBusiness();
  const postDataJson = readString(row.postDataJson, fallback.postDataJson);
  const parsedPostData = parseJsonObject(postDataJson, 'postDataJson');
  const postData = parsedPostData.ok && isPlainRecord(parsedPostData.value)
    ? parsedPostData.value
    : {};
  const postDataTarget = readString(postData.tableName, readString(postData.table_name));
  const explicitTableName = readString(row.tableName);
  const explicitViewName = readString(row.viewName);
  const requestedTableType = readString(row.tableType);
  const tableType: GridDesignerTableType = requestedTableType === 'main'
    ? 'main'
    : requestedTableType === 'detail'
      ? 'detail'
      : 'default';
  const requestedSourceType = readString(row.sourceType);
  const legacySourceType = requestedTableType === 'custom' ||
    requestedTableType === 'table' ||
    requestedTableType === 'view'
    ? requestedTableType
    : '';
  const sourceType: GridDesignerSourceType = requestedSourceType === 'custom'
    ? 'custom'
    : explicitViewName
      ? 'view'
      : requestedSourceType === 'table' || requestedSourceType === 'view'
        ? requestedSourceType
        : legacySourceType || (explicitTableName || postDataTarget ? 'table' : 'custom');
  const viewName = explicitViewName || (sourceType === 'view' ? postDataTarget : '');
  // Older view-only configurations stored the view name in both fields.
  const tableName = sourceType === 'view' && explicitTableName === viewName
    ? ''
    : explicitTableName || (sourceType === 'table' ? postDataTarget : '');
  const normalizedPostDataJson = parsedPostData.ok && (
    typeof parsedPostData.value === 'undefined' || isPlainRecord(parsedPostData.value)
  )
      ? JSON.stringify(
        createSourcePostData(
          postData,
          sourceType === 'custom' ? '' : viewName || tableName,
          sourceType !== 'custom',
          sourceType !== 'custom',
        ),
        null,
        2,
      )
    : postDataJson;

  return {
    blockId: readString(row.blockId, fallback.blockId),
    title: readString(row.title, fallback.title),
    tableType,
    sourceType,
    tableName,
    viewName,
    categoryField: readString(row.categoryField),
    sourceKey: readString(row.sourceKey, fallback.sourceKey),
    serviceName: readString(row.serviceName, fallback.serviceName),
    serviceMethod: readString(row.serviceMethod, fallback.serviceMethod),
    saveMethod: readString(row.saveMethod),
    deleteMethod: readString(row.deleteMethod),
    postDataJson: normalizedPostDataJson,
    showRowActions: readBoolean(row.showRowActions, fallback.showRowActions),
  };
}

function createDefaultDetailConfig(): GridDesignerDetailConfig {
  return {
    enabled: false,
    parentSourceKey: '',
    resource: '',
    foreignKey: '',
    parentKey: 'id',
    inheritFields: [],
    updateMode: 'changes',
    defaults: {},
    stripCreatedKey: true,
  };
}

function normalizeDetailConfig(value: unknown): GridDesignerDetailConfig {
  const row = isPlainRecord(value) ? value : {};
  const fallback = createDefaultDetailConfig();
  const rawInheritFields = row.inheritFields ?? row.inherit_fields;
  const updateMode = readString(row.updateMode ?? row.update_mode) === 'replace'
    ? 'replace'
    : 'changes';
  return {
    enabled: readBoolean(row.enabled, fallback.enabled),
    parentSourceKey: readString(row.parentSourceKey ?? row.parent_source_key),
    resource: readString(row.resource),
    foreignKey: readString(row.foreignKey ?? row.foreign_key),
    parentKey: readString(row.parentKey ?? row.parent_key, fallback.parentKey),
    inheritFields: Array.isArray(rawInheritFields)
      ? [...new Set(rawInheritFields
        .map((item: unknown) => readString(item))
        .filter(Boolean))]
      : [],
    updateMode,
    defaults: isPlainRecord(row.defaults) ? cloneDeep(row.defaults) : fallback.defaults,
    stripCreatedKey: readBoolean(row.stripCreatedKey, fallback.stripCreatedKey),
  };
}

function createDefaultGridOptions(): Record<string, unknown> {
  return {
    id: '',
    size: '',
    height: '',
    minHeight: '',
    maxHeight: '',
    border: true,
    stripe: true,
    round: false,
    showHeader: true,
    showFooter: false,
    showOverflow: true,
    showHeaderOverflow: '',
    showFooterOverflow: '',
    align: '',
    headerAlign: '',
    footerAlign: '',
    autoResize: true,
    keepSource: false,
    rowConfig: {
      keyField: 'id',
      useKey: true,
      isCurrent: false,
      isHover: true,
      resizable: false,
      drag: false,
    },
    columnConfig: {
      useKey: true,
      resizable: true,
      isCurrent: false,
      isHover: false,
      drag: false,
      width: '',
      minWidth: '',
      maxWidth: '',
    },
  };
}

function normalizeGridOptions(value: unknown) {
  const gridOptions = isPlainRecord(value) ? cloneDeep(value) : {};
  const defaults = createDefaultGridOptions();
  const rowConfig = isPlainRecord(gridOptions.rowConfig) ? gridOptions.rowConfig : {};
  const columnConfig = isPlainRecord(gridOptions.columnConfig) ? gridOptions.columnConfig : {};
  const extraProps = Object.fromEntries(
    Object.entries(gridOptions).filter(([key]) => !commonGridOptionKeys.has(key)),
  );

  return {
    options: {
      ...defaults,
      ...gridOptions,
      rowConfig: {
        ...(defaults.rowConfig as Record<string, unknown>),
        ...rowConfig,
      },
      columnConfig: {
        ...(defaults.columnConfig as Record<string, unknown>),
        ...columnConfig,
      },
    },
    advanced: {
      pagerConfigJson: stringifyJson(gridOptions.pagerConfig, { enabled: false }),
      toolbarConfigJson: stringifyJson(gridOptions.toolbarConfig, { enabled: false }),
      proxyConfigJson: stringifyJson(gridOptions.proxyConfig, { enabled: false }),
      editConfigJson: stringifyJson(gridOptions.editConfig, {}),
      checkboxConfigJson: stringifyJson(gridOptions.checkboxConfig, {}),
      radioConfigJson: stringifyJson(gridOptions.radioConfig, {}),
      sortConfigJson: stringifyJson(gridOptions.sortConfig, {}),
      filterConfigJson: stringifyJson(gridOptions.filterConfig, {}),
      treeConfigJson: stringifyJson(gridOptions.treeConfig, {}),
      expandConfigJson: stringifyJson(gridOptions.expandConfig, {}),
      extraPropsJson: stringifyJson(extraProps, {}),
    },
  };
}

function readAdvancedConfigObject(
  advanced: Record<string, unknown>,
  field: string,
  label: string,
) {
  const parsed = parseJsonObject(readString(advanced[field]), label);
  return parsed.ok && isPlainRecord(parsed.value) ? cloneDeep(parsed.value) : {};
}

function createAdvancedFormModels(advanced: Record<string, unknown>) {
  return {
    ...advancedGridConfigDefinitions.reduce<Record<string, Record<string, unknown>>>(
      (models, config) => {
        models[config.field] = readAdvancedConfigObject(advanced, config.field, config.label);
        return models;
      },
      {},
    ),
    extraPropsJson: readAdvancedConfigObject(advanced, 'extraPropsJson', 'extraProps'),
  };
}

function normalizeEvents(value: unknown) {
  const rows = Array.isArray(value) ? value.filter(isPlainRecord) : [];
  const rowMap = new Map(rows.map((row) => [readString(row.key), row]));

  return eventDefinitions.map<GridDesignerEvent>((definition) => {
    const row = rowMap.get(definition.key) ?? {};
    const directives = normalizeRuntimeDirectives(
      Array.isArray(row.directives)
        ? row.directives
        : readJsonArrayValue(row.directivesJson),
    );

    return {
      ...definition,
      enabled: readBoolean(row.enabled, false),
      eventName: readString(row.eventName),
      directives,
      directivesJson: JSON.stringify(directives, null, 2),
    };
  });
}

function resetReactiveObject(target: Record<string, unknown>, source: Record<string, unknown>) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, source);
}

function validateColumnJson(_column: GridDesignerColumn, _index: number) {
  return { ok: true, value: undefined } as JsonParseResult;
}

function parseFormatterValue(value: unknown, label: string): JsonParseResult {
  if (isPlainRecord(value)) {
    return { ok: true, value: compactObject(cloneDeep(value)) };
  }

  return parseJsonValueOrString(value, label);
}

function normalizeObjectConfig(value: unknown) {
  if (!isPlainRecord(value)) return undefined;
  return compactObject(cloneDeep(value));
}

function inferObjectFields(value: Record<string, unknown>): LowCodeField[] {
  return Object.keys(value).map((field) => {
    const currentValue = value[field];

    if (typeof currentValue === 'boolean') {
      return { field, label: field, component: 'vxe-switch' };
    }

    if (typeof currentValue === 'number') {
      return { field, label: field, component: 'lc-number-input' };
    }

    if (isPlainRecord(currentValue)) {
      return createSubFormField({
        field,
        label: field,
        fields: inferObjectFields(currentValue),
      });
    }

    if (Array.isArray(currentValue)) {
      const columns = inferArrayColumns(currentValue);
      return {
        field,
        label: field,
        component: 'lc-array-table',
        props: {
          toolbarButtons: [{ code: 'add', label: '新增', command: 'add', status: 'primary' }],
          rowKey: '__rowKey',
          columns,
          defaultRow: createArrayDefaultRow(columns),
        },
      };
    }

    return { field, label: field, component: 'vxe-input' };
  });
}

function createObjectSchema(value: Record<string, unknown>, fields?: LowCodeField[]): LowCodeFormSchema {
  return {
    fields: fields?.length ? fields : inferObjectFields(value),
    actions: [],
  };
}

type ArrayEditorColumn = {
  field: string;
  title: string;
  component?: LowCodeField['component'];
  width?: number | string;
  minWidth?: number | string;
  defaultValue?: unknown;
  props?: Record<string, unknown>;
  options?: Array<{ label: string; value: unknown; rawValue?: unknown; disabled?: boolean }>;
  optionsCode?: string;
  readonly?: boolean;
};

const directiveArrayColumns: ArrayEditorColumn[] = [
  { field: 'type', title: '指令类型', minWidth: 130, defaultValue: 'setDataSource' },
  { field: 'sourceKey', title: '数据源标识', minWidth: 150 },
  { field: 'targetKey', title: '目标标识', minWidth: 150 },
  { field: 'value', title: '值', minWidth: 180 },
];

function inferArrayColumns(value: unknown[]): ArrayEditorColumn[] {
  const keys = new Set<string>();

  value.filter(isPlainRecord).forEach((item) => {
    Object.keys(item).forEach((key) => keys.add(key));
  });

  const orderedKeys = [
    ...['type', 'label', 'value', 'field', 'sourceKey', 'targetKey'].filter((key) => keys.delete(key)),
    ...Array.from(keys),
  ].slice(0, 8);
  const finalKeys = orderedKeys.length ? orderedKeys : ['label', 'value'];

  return finalKeys.map((field) => ({
    field,
    title: field,
    minWidth: field === 'value' ? 160 : 120,
    component: field === 'checked' || field === 'enabled' ? 'vxe-switch' : undefined,
  }));
}

function createArrayDefaultRow(columns: ArrayEditorColumn[]) {
  return columns.reduce<Record<string, unknown>>((row, column) => {
    if (Object.prototype.hasOwnProperty.call(column, 'defaultValue')) {
      row[column.field] = cloneDeep(column.defaultValue);
      return row;
    }

    row[column.field] = column.component === 'vxe-switch' ? false : '';
    return row;
  }, {});
}

function createArraySchema(
  value: unknown[],
  columns?: ArrayEditorColumn[],
): LowCodeFormSchema {
  const resolvedColumns = columns?.length ? columns : inferArrayColumns(value);

  return {
    fields: [
      {
        field: 'items',
        label: '列表',
        component: 'lc-array-table',
        props: {
          toolbarButtons: [{ code: 'add', label: '新增', command: 'add', status: 'primary' }],
          rowKey: '__rowKey',
          columns: resolvedColumns,
          defaultRow: createArrayDefaultRow(resolvedColumns),
        },
      },
    ],
    actions: [],
  };
}

function normalizeColumnForResult(column: GridDesignerColumn, index: number): GridDesignerColumn {
  const field = readString(column.field);
  const type = readString(column.type);
  const title = type === 'checkbox' || type === 'radio'
    ? readString(column.title)
    : readString(column.title, field || `列${index + 1}`);
  const formatter = parseFormatterValue(column.formatter, `第 ${index + 1} 列 formatter`);

  if (formatter.ok === false) {
    throw new Error(formatter.message);
  }

  return compactObject({
    field,
    title,
    type,
    width: readDimension(column.width),
    minWidth: readDimension(column.minWidth),
    maxWidth: readDimension(column.maxWidth),
    fixed: readString(column.fixed),
    align: readString(column.align),
    headerAlign: readString(column.headerAlign),
    footerAlign: readString(column.footerAlign),
    sortable: Boolean(column.sortable),
    resizable: Boolean(column.resizable),
    visible: column.visible !== false,
    showOverflow: column.showOverflow,
    showHeaderOverflow: column.showHeaderOverflow,
    showFooterOverflow: column.showFooterOverflow,
    formatter: formatter.value,
    filters: Array.isArray(column.filters) ? cloneDeep(column.filters) : [],
    cellRender: normalizeObjectConfig(column.cellRender),
    editRender: normalizeObjectConfig(column.editRender),
    params: normalizeObjectConfig(column.params),
  }) as GridDesignerColumn;
}

function normalizeRuntimeDirectives(value: unknown): LowCodeRuntimeDirective[] {
  return Array.isArray(value)
    ? (value.filter(
        (item): item is LowCodeRuntimeDirective =>
          isPlainRecord(item) && typeof item.type === 'string' && item.type.trim().length > 0,
      ) as LowCodeRuntimeDirective[])
    : [];
}

function buildGridOptions(
  options: Record<string, unknown>,
  advanced: Record<string, string>,
) {
  const rowConfig = isPlainRecord(options.rowConfig) ? options.rowConfig : {};
  const columnConfig = isPlainRecord(options.columnConfig) ? options.columnConfig : {};
  const baseOptions = compactObject({
    id: readString(options.id),
    size: readString(options.size),
    height: readDimension(options.height),
    minHeight: readDimension(options.minHeight),
    maxHeight: readDimension(options.maxHeight),
    border: options.border,
    stripe: Boolean(options.stripe),
    round: Boolean(options.round),
    showHeader: options.showHeader !== false,
    showFooter: Boolean(options.showFooter),
    showOverflow: options.showOverflow,
    showHeaderOverflow: options.showHeaderOverflow,
    showFooterOverflow: options.showFooterOverflow,
    align: readString(options.align),
    headerAlign: readString(options.headerAlign),
    footerAlign: readString(options.footerAlign),
    autoResize: options.autoResize !== false,
    keepSource: Boolean(options.keepSource),
    rowConfig: compactObject({
      keyField: readString(rowConfig.keyField, 'id'),
      useKey: rowConfig.useKey !== false,
      isCurrent: Boolean(rowConfig.isCurrent),
      isHover: rowConfig.isHover !== false,
      resizable: Boolean(rowConfig.resizable),
      drag: Boolean(rowConfig.drag),
    }),
    columnConfig: compactObject({
      useKey: columnConfig.useKey !== false,
      resizable: columnConfig.resizable !== false,
      isCurrent: Boolean(columnConfig.isCurrent),
      isHover: Boolean(columnConfig.isHover),
      drag: Boolean(columnConfig.drag),
      width: readDimension(columnConfig.width),
      minWidth: readDimension(columnConfig.minWidth),
      maxWidth: readDimension(columnConfig.maxWidth),
    }),
  });

  const advancedFieldMap = {
    pagerConfigJson: 'pagerConfig',
    toolbarConfigJson: 'toolbarConfig',
    proxyConfigJson: 'proxyConfig',
    editConfigJson: 'editConfig',
    checkboxConfigJson: 'checkboxConfig',
    radioConfigJson: 'radioConfig',
    sortConfigJson: 'sortConfig',
    filterConfigJson: 'filterConfig',
    treeConfigJson: 'treeConfig',
    expandConfigJson: 'expandConfig',
  };

  for (const [field, optionKey] of Object.entries(advancedFieldMap)) {
    const parsed = parseJsonObject(readString(advanced[field]), optionKey);
    assertJsonParsed(parsed);
    if (isPlainRecord(parsed.value) && Object.keys(parsed.value).length) {
      baseOptions[optionKey] = parsed.value;
    }
  }

  const extraProps = parseJsonObject(readString(advanced.extraPropsJson), 'extraProps');
  assertJsonParsed(extraProps);

  return {
    ...baseOptions,
    ...(isPlainRecord(extraProps.value) ? extraProps.value : {}),
  };
}

function buildEvents(events: GridDesignerEvent[]) {
  return events.map((event) => {
    const directives = normalizeRuntimeDirectives(event.directives);

    if (!event.enabled) {
      return {
        ...event,
        directives,
        directivesJson: JSON.stringify(directives, null, 2),
      };
    }

    return {
      ...event,
      eventName: readString(event.eventName),
      directives,
      directivesJson: JSON.stringify(directives, null, 2),
    };
  });
}

const ServiceComponent = defineComponent({
  props: {
    option: { type: Object as PropType<GridDesignerServiceOption>, required: true },
  },
  setup(props) {
    const ctx = getCurrentInstance()!;
    const normalized = normalizeGridOptions(props.option.gridOptions);
    const initialColumns = normalizeColumns(props.option.columns);

    const state = reactive({
      option: props.option,
      activeDialogId: '',
      business: normalizeBusiness(props.option.business),
      detailConfig: normalizeDetailConfig(props.option.detailConfig),
      columns: initialColumns,
      formSettings: createFormSettings(initialColumns),
      selectedColumnId: readString(initialColumns[0]?.__id),
      gridOptions: normalized.options,
      advanced: normalized.advanced,
      advancedModels: createAdvancedFormModels(normalized.advanced),
      gridEvents: normalizeEvents(props.option.gridEvents),
      mounted: (() => {
        const dfd = defer();
        onMounted(() => setTimeout(() => dfd.resolve(), 0));
        return dfd.promise;
      })(),
    });
    const designerFormModels = reactive<Record<string, Record<string, unknown>>>({});
    const gridDesignerFieldOptionSources = reactive<Record<string, LowCodeOption[]>>({
      [gridDesignerFieldOptionSourceKeys.source]: [],
      [gridDesignerFieldOptionSourceKeys.detail]: [],
      [gridDesignerFieldOptionSourceKeys.parent]: [],
      [gridDesignerFieldOptionSourceKeys.pageSources]: [],
    });
    const syncGridDesignerTableFieldOptions = (
      sourceKey: string,
      columns: readonly GridDesignerFieldOptionColumn[],
    ) => {
      gridDesignerFieldOptionSources[sourceKey] = createGridDesignerTableFieldOptions(columns);
    };
    const syncGridDesignerCurrentTableFieldOptions = (
      columns: readonly GridDesignerFieldOptionColumn[],
    ) => {
      syncGridDesignerTableFieldOptions(gridDesignerFieldOptionSourceKeys.source, columns);
      if (state.business.tableType === 'detail') {
        syncGridDesignerTableFieldOptions(gridDesignerFieldOptionSourceKeys.detail, columns);
      }
    };
    const refreshGridDesignerPageSourceOptions = () => {
      const excludedSourceKey = state.business.tableType === 'detail'
        ? readString(state.business.sourceKey)
        : '';
      gridDesignerFieldOptionSources[gridDesignerFieldOptionSourceKeys.pageSources] =
        createGridDesignerPageSourceOptions(state.option.dataSources, excludedSourceKey);
    };
    let databaseFormSchema: LowCodeFormSchema | undefined;
    const getServiceApi = () => {
      if (state.option.serviceApi) return state.option.serviceApi;
      try {
        return typeof useServiceApi === 'function' ? useServiceApi() : undefined;
      } catch {
        return undefined;
      }
    };
    const resolveGridDesignerFormSchema = (code: string) => {
      const sectionField = databaseFormSchema?.fields.find((field) => field.field === code);
      const sectionSchema = isPlainRecord(sectionField?.props)
        ? sectionField.props.schema
        : undefined;
      if (!isLowCodeFormSchema(sectionSchema)) {
        throw new Error(`数据表格设计表单缺少有效区段：${code}`);
      }
      return cloneDeep(sectionSchema);
    };
    const loadGridDesignerFormSchemas = async () => {
      const serviceApi = getServiceApi();
      if (!serviceApi) {
        throw new Error('数据表格设计器无法连接低代码服务。');
      }

      const rows = await serviceApi.invoke<Array<{ schema?: unknown }>>('lowcode', 'listItems', {
        resource: 'lowcode_form_definitions',
        filters: {
          code: gridDesignerFormCode,
          enabled: true,
        },
        limit: 1,
      });
      const schema = Array.isArray(rows) ? rows[0]?.schema : undefined;
      if (!isLowCodeFormSchema(schema)) {
        throw new Error(`低代码表单“${gridDesignerFormCode}”不存在、已停用或 schema 无效。`);
      }
      databaseFormSchema = cloneDeep(schema);
    };
    const methods = {
      service: async (option: GridDesignerServiceOption) => {
        const nextGridOptions = normalizeGridOptions(option.gridOptions);
        state.option = option;
        resetReactiveObject(state.business, normalizeBusiness(option.business));
        resetReactiveObject(state.detailConfig, normalizeDetailConfig(option.detailConfig));
        refreshGridDesignerPageSourceOptions();
        state.columns = normalizeColumns(option.columns);
        syncGridDesignerTableFieldOptions(
          gridDesignerFieldOptionSourceKeys.source,
          state.columns,
        );
        resetReactiveObject(state.formSettings, createFormSettings(state.columns));
        state.selectedColumnId = readString(state.columns[0]?.__id);
        resetReactiveObject(state.gridOptions, nextGridOptions.options);
        resetReactiveObject(state.advanced, nextGridOptions.advanced);
        resetReactiveObject(state.advancedModels, createAdvancedFormModels(nextGridOptions.advanced));
        state.gridEvents = normalizeEvents(option.gridEvents);
        await methods.show();
      },
      show: async () => {
        await state.mounted;
        await loadGridDesignerFormSchemas();
        await refreshCurrentTableFieldOptions();
        await refreshDetailTableFieldOptions();
        await refreshParentTableFieldOptions();
        syncActiveDesignerDialogModel();
        await nextTick();
        const dialogId = `grid-designer-${generateNanoid()}`;
        state.activeDialogId = dialogId;

        void openGlobalDialog({
          id: dialogId,
          title: state.option.title || '表格设计',
          width: 'min(1360px, calc(100vw - 40px))',
          className: 'grid-designer-dialog form-workbench-dialog',
          props: {
            top: '4vh',
            destroyOnClose: true,
          },
          showFooter: true,
          content: createGridDesignerDialogSchema(),
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
              onClick: async () =>
                (await handler.onConfirm())
                  ? {
                      close: true,
                      action: 'confirm',
                    }
                  : false,
            },
          ],
          onCancel: handler.onCancel,
          onClose: () => {
            if (state.activeDialogId === dialogId) {
              state.activeDialogId = '';
            }
          },
        });
      },
      hide: () => {
        const dialogId = state.activeDialogId;
        state.activeDialogId = '';
        if (dialogId) {
          void closeGlobalDialog(dialogId, { action: 'close' });
        }
      },
    };
    const selectColumn = (column: GridDesignerColumn) => {
      state.selectedColumnId = readString(column.__id);
    };

    const syncColumnsFromFormSettings = () => {
      state.columns = applyFormSettingsToColumns(state.columns, state.formSettings);
      const selectedId = state.selectedColumnId;
      if (!state.columns.some((column) => column.__id === selectedId)) {
        selectColumn(state.columns[0]);
      }
    };

    const syncActiveDesignerDialogModel = () => {
      const formModels = createGridDesignerFormModels();
      Object.entries(formModels).forEach(([blockId, model]) => {
        const currentModel = designerFormModels[blockId];
        if (isPlainRecord(currentModel)) {
          resetReactiveObject(currentModel, model);
        } else {
          designerFormModels[blockId] = model;
        }
      });
      Object.keys(designerFormModels).forEach((blockId) => {
        if (!Object.prototype.hasOwnProperty.call(formModels, blockId)) {
          delete designerFormModels[blockId];
        }
      });
    };

    const applySource = (
      source: GridDesignerSourceOption,
      kind: GridDesignerSourceKind,
    ) => {
      const columns = mergeColumnsFromSource(state.columns, source.columns);
      if (!columns.length) {
        ElMessage.warning('该数据源暂无可用字段');
        return false;
      }

      state.columns = columns;
      selectColumn(columns[0]);
      state.business.title = `${source.title}列表`;
      const sourceTarget = readString(source.fullName, source.code);
      if (kind === 'entity') state.business.tableName = sourceTarget;
      if (kind === 'view') state.business.viewName = sourceTarget;
      state.business.sourceType = state.business.viewName ? 'view' : 'table';
      if (!readString(state.business.sourceKey)) {
        state.business.sourceKey = createSourceKey(source);
      }
      state.business.serviceName = 'admin';
      state.business.serviceMethod = 'listItems';
      state.business.saveMethod = '';
      state.business.deleteMethod = '';
      state.business.postDataJson = JSON.stringify(
        createSourcePostData(
          state.business.postDataJson,
          readString(state.business.viewName, state.business.tableName),
          true,
        ),
        null,
        2,
      );
      const assignedDetailResource = !readString(state.detailConfig.resource);
      if (assignedDetailResource) {
        state.detailConfig.resource = readString(source.code, sourceTarget.split('.').at(-1));
      }
      state.business.showRowActions = false;
      state.gridOptions.rowConfig = {
        ...(isPlainRecord(state.gridOptions.rowConfig) ? state.gridOptions.rowConfig : {}),
        keyField: readString(
          source.columns.find((column) => column.primaryKey)?.field,
          readString(source.primaryKey, readString(source.columns[0]?.field, 'id')),
        ),
      };
      syncGridDesignerCurrentTableFieldOptions(source.columns);
      if (assignedDetailResource && state.business.tableType !== 'detail') {
        syncGridDesignerTableFieldOptions(
          gridDesignerFieldOptionSourceKeys.detail,
          source.columns,
        );
      }
      return true;
    };

    const loadPhysicalTableSource = async (
      row: Record<string, unknown>,
    ): Promise<GridDesignerSourceOption> => {
      const serviceApi = getServiceApi();
      if (!serviceApi) {
        throw new Error('当前页面未提供数据服务，无法读取真实表字段');
      }

      const fullName = readString(
        row.fullName ?? row.full_name ?? row.value,
        [
          readString(row.schemaName ?? row.schema_name, 'public'),
          readString(row.tableName ?? row.table_name),
        ]
          .filter(Boolean)
          .join('.'),
      );
      if (!fullName) {
        throw new Error('未找到所选真实表');
      }

      const columnRows = await serviceApi.invoke<unknown[]>('lowcode', 'listTableColumns', {
        tableName: fullName,
      });
      const columns = Array.isArray(columnRows) ? columnRows.filter(isPlainRecord) : [];

      return {
        id: fullName,
        code: readString(
          row.tableName ?? row.table_name,
          fullName.split('.').pop() ?? fullName,
        ),
        title: readString(row.title, readString(row.label, fullName)),
        fullName,
        primaryKey: readString(row.primaryKey),
        columns: columns.map((column) => ({
          field: readString(column.name, readString(column.column_name)),
          title: readString(
            column.title,
            readString(
              column.comment,
              humanizeIdentifier(column.name ?? column.column_name),
            ),
          ),
          dataType: readString(column.dataType, readString(column.data_type)),
          primaryKey: readBoolean(column.isPrimaryKey, readBoolean(column.is_primary_key)),
        })),
      };
    };

    const refreshCurrentTableFieldOptions = async () => {
      const sourceTarget = readString(
        state.business.viewName,
        state.business.tableName,
      );
      if (!sourceTarget) {
        syncGridDesignerCurrentTableFieldOptions(state.columns);
        return;
      }

      try {
        const source = await loadPhysicalTableSource({ value: sourceTarget });
        syncGridDesignerCurrentTableFieldOptions(source.columns);
      } catch {
        // A custom view can be configured without table-column metadata. Keep usable grid fields.
        syncGridDesignerCurrentTableFieldOptions(state.columns);
      }
    };

    const refreshDetailTableFieldOptions = async () => {
      if (state.business.tableType === 'detail') {
        gridDesignerFieldOptionSources[gridDesignerFieldOptionSourceKeys.detail] = [
          ...gridDesignerFieldOptionSources[gridDesignerFieldOptionSourceKeys.source],
        ];
        return;
      }

      const resource = readString(state.detailConfig.resource);
      if (!resource) {
        syncGridDesignerTableFieldOptions(gridDesignerFieldOptionSourceKeys.detail, []);
        return;
      }

      try {
        const source = await loadPhysicalTableSource({ value: resource });
        syncGridDesignerTableFieldOptions(
          gridDesignerFieldOptionSourceKeys.detail,
          source.columns,
        );
      } catch {
        syncGridDesignerTableFieldOptions(gridDesignerFieldOptionSourceKeys.detail, []);
      }
    };

    const refreshParentTableFieldOptions = async () => {
      const parentSourceKey = readString(state.detailConfig.parentSourceKey);
      const parentSource = parentSourceKey
        ? state.option.dataSources?.[parentSourceKey]
        : undefined;
      const parentTableName = resolveGridDesignerDataSourceTableName(parentSource);
      if (!parentTableName) {
        syncGridDesignerTableFieldOptions(gridDesignerFieldOptionSourceKeys.parent, []);
        return;
      }

      try {
        const source = await loadPhysicalTableSource({ value: parentTableName });
        syncGridDesignerTableFieldOptions(
          gridDesignerFieldOptionSourceKeys.parent,
          source.columns,
        );
      } catch {
        syncGridDesignerTableFieldOptions(gridDesignerFieldOptionSourceKeys.parent, []);
      }
    };

    const applyAssociationOption = async (
      kind: 'table' | 'view',
      value: unknown,
    ) => {
      const target = readString(value);
      if (!target) return;
      const preserveCustomService = state.business.sourceType === 'custom' && (
        readString(state.business.serviceName) !== 'admin' ||
        readString(state.business.serviceMethod) !== 'listItems'
      );
      const row = {
        label: target,
        value: target,
      };

      if (kind === 'table') state.business.tableName = target;
      if (kind === 'view') state.business.viewName = target;
      if (!preserveCustomService) {
        state.business.sourceType = state.business.viewName ? 'view' : 'table';
      }
      syncBusinessSourceTarget();
      syncActiveDesignerDialogModel();

      if (preserveCustomService) {
        await refreshCurrentTableFieldOptions();
        return;
      }

      try {
        const source = await loadPhysicalTableSource(row);
        if (applySource(source, kind === 'table' ? 'entity' : 'view')) {
          syncActiveDesignerDialogModel();
        }
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '关联数据源加载失败');
      }
    };

    let syncingTableComments = false;
    const syncColumnsFromTableComments = async () => {
      if (syncingTableComments) return;

      const tableName = readString(state.business.tableName);
      if (!tableName) {
        ElMessage.warning('请先关联真实表');
        return;
      }

      const serviceApi = getServiceApi();
      if (!serviceApi) {
        ElMessage.error('当前页面未提供数据服务，无法读取真实表字段');
        return;
      }

      syncingTableComments = true;
      try {
        const columnRows = await serviceApi.invoke<unknown[]>('lowcode', 'listTableColumns', {
          tableName,
        });
        const overridesByField = new Map<
          string,
          Partial<Pick<GridDesignerColumn, 'title' | 'type'>>
        >();

        if (Array.isArray(columnRows)) {
          columnRows.filter(isPlainRecord).forEach((column) => {
            const field = readString(column.name, readString(column.column_name));
            const overrides = parseColumnCommentOverrides(column.comment);
            if (field && overrides) overridesByField.set(field, overrides);
          });
        }

        let syncedCount = 0;
        state.columns = state.columns.map((column) => {
          const overrides = overridesByField.get(readString(column.field));
          if (!overrides) return column;

          syncedCount += 1;
          return {
            ...column,
            ...overrides,
          };
        });
        syncActiveDesignerDialogModel();

        if (syncedCount) {
          ElMessage.success(`已从真实表同步 ${syncedCount} 列的标题和类型`);
        } else {
          ElMessage.warning('真实表中没有可同步的 JSON 列注释');
        }
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '真实表字段同步失败');
      } finally {
        syncingTableComments = false;
      }
    };

    const loadSelectedSource = async (
      kind: GridDesignerSourceKind,
      row: Record<string, unknown>,
    ): Promise<GridDesignerSourceOption> => {
      const serviceApi = getServiceApi();
      if (!serviceApi) {
        throw new Error('当前页面未提供数据服务，无法读取关联字段');
      }

      if (kind === 'entity') {
        const graph = await serviceApi.invoke<Record<string, unknown>>(
          'entityDesign',
          'listDesign',
          {},
        );
        const tables = Array.isArray(graph?.tables) ? graph.tables.filter(isPlainRecord) : [];
        const rowId = readString(row.id);
        const rowCode = readString(row.code);
        const rowTableName = readString(row.table_name, readString(row.tableName));
        const table = tables.find(
          (item) =>
            (rowId && readString(item.id) === rowId) ||
            (rowCode && readString(item.code) === rowCode) ||
            (rowTableName && readString(item.table_name) === rowTableName),
        );
        if (!table) {
          throw new Error('未找到所选实体的字段定义');
        }

        return {
          id: readString(table.id, rowId),
          code: readString(table.code, readString(table.table_name, rowCode)),
          title: readString(
            table.title,
            readString(row.title, readString(table.code, readString(table.table_name))),
          ),
          fullName: readString(
            table.full_name,
            [readString(table.schema_name), readString(table.table_name)].filter(Boolean).join('.'),
          ),
          primaryKey: readString(table.primary_key),
          columns: (Array.isArray(table.columns) ? table.columns.filter(isPlainRecord) : [])
            .filter((column) => readString(column.storage_kind, 'physical') !== 'virtual')
            .map((column) => ({
              field: readString(column.column_name),
              title: readString(column.label, humanizeIdentifier(column.column_name)),
              dataType: readString(column.data_type),
              primaryKey:
                readBoolean(column.is_primary_key) ||
                readString(column.column_name) === readString(table.primary_key),
            })),
        };
      }

      const viewRows = await serviceApi.invoke<unknown[]>('entityDesign', 'listViews', {
        id: readString(row.id),
      });
      const view = Array.isArray(viewRows) ? viewRows.find(isPlainRecord) : undefined;
      if (!view) {
        throw new Error('未找到所选视图');
      }
      if (readString(view.status) !== 'published') {
        throw new Error('只能关联已发布的视图');
      }
      const columnRows = await serviceApi.invoke<unknown[]>('entityDesign', 'listViewColumns', {
        id: readString(view.id),
      });
      const columns = Array.isArray(columnRows) ? columnRows.filter(isPlainRecord) : [];

      return {
        id: readString(view.id),
        code: readString(view.code, readString(view.view_name)),
        title: readString(view.title, readString(view.code, readString(view.view_name))),
        fullName: readString(
          view.full_name,
          [readString(view.schema_name), readString(view.view_name)].filter(Boolean).join('.'),
        ),
        status: readString(view.status),
        columns: columns.map((column) => ({
          field: readString(column.column_name),
          title: readString(
            column.label,
            readString(column.title, humanizeIdentifier(column.column_name)),
          ),
          dataType: readString(column.data_type),
          primaryKey: readString(column.column_name) === 'id',
        })),
      };
    };

    const openSourcePicker = async (kind: GridDesignerSourceKind) => {
      const dialogId = `grid-designer-${kind}-picker`;
      if (findGlobalDialog(dialogId)) return;

      const kindLabel = kind === 'entity' ? '实体' : '视图';

      try {
        const result = await confirmLowCodePage({
          pageCode: gridDesignerSourcePageCodes[kind],
          includeData: true,
          serviceApi: getServiceApi(),
          locale: 'zh-CN',
          title: `关联${kindLabel}`,
          width: 'min(980px, calc(100vw - 48px))',
          height: 'min(640px, calc(100vh - 80px))',
          confirmLabel: '确定',
          cancelLabel: '取消',
          requireSelection: true,
          dialog: { id: dialogId },
        });
        if (result.action === 'cancel' || result.action === 'close') return;

        const row = readSourceRowFromConfirmPayload(result.payload);
        if (!row) {
          ElMessage.warning(`请选择要关联的${kindLabel}`);
          return;
        }
        const source = await loadSelectedSource(kind, row);
        if (!applySource(source, kind)) return;
        syncActiveDesignerDialogModel();
        ElMessage.success(`已关联${kindLabel}，新增或覆盖 ${source.columns.length} 个字段`);
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : `${kindLabel}加载失败`);
      }
    };

    const handler = {
      onConfirm: async () => {
        try {
          const postData = parseJsonObject(state.business.postDataJson, 'postDataJson');
          assertJsonParsed(postData);

          if (state.detailConfig.enabled && (
            !readString(state.detailConfig.parentSourceKey) ||
            !readString(state.detailConfig.resource) ||
            !readString(state.detailConfig.foreignKey)
          )) {
            ElMessage.error('子表配置需要填写主表数据源、子表资源和关联外键');
            return false;
          }

          const invalidColumn = state.columns.find(
            (column) => !readString(column.field) && !readString(column.title) && !readString(column.type),
          );
          if (invalidColumn) {
            ElMessage.error('列设计中 field、title、type 至少填写一个');
            return false;
          }

          for (let index = 0; index < state.columns.length; index += 1) {
            const parsed = validateColumnJson(state.columns[index], index);
            assertJsonParsed(parsed);
          }

          await state.option.onConfirm?.({
            business: cloneDeep(state.business),
            detailConfig: cloneDeep(state.detailConfig),
            columns: state.columns.map((column, index) => normalizeColumnForResult(column, index)),
            gridOptions: buildGridOptions(state.gridOptions, state.advanced),
            gridEvents: buildEvents(state.gridEvents),
          });
          return true;
        } catch (error) {
          ElMessage.error(error instanceof Error ? error.message : '表格配置格式不正确');
          return false;
        }
      },
      onCancel: () => {
        state.activeDialogId = '';
      },
    };

    Object.assign(ctx.proxy!, methods);

    const openSchemaDialog = <TValues extends Record<string, unknown>>(
      config: {
        id: string;
        title: string;
        model: TValues;
        width?: string | number;
        height?: string | number;
        className?: unknown;
        schema?: LowCodeFormSchema;
        content?: GlobalDialogContentNode<TValues> | GlobalDialogContentNode<TValues>[];
        onConfirm: (value: TValues) => void;
      },
    ) => {
      if (findGlobalDialog(config.id)) return;

      void openGlobalDialog<TValues>({
        id: config.id,
        title: config.title,
        width: config.width,
        height: config.height,
        className: config.className,
        showFooter: true,
        model: config.model,
        actions: [
          {
            code: 'cancel',
            label: '取消',
            role: 'cancel',
          },
          {
            code: 'confirm',
            label: '确定',
            role: 'confirm',
            status: 'primary',
          },
        ],
        ...(config.content
          ? { content: config.content }
          : { form: { schema: config.schema ?? createObjectSchema({}) } }),
        onConfirm: ({ model }) => {
          config.onConfirm(cloneDeep(model));
        },
      });
    };

    const createColumnAdvancedDialogContent = (
      column: GridDesignerColumn,
    ): GlobalDialogContentNode => ({
      type: 'lowcodeBlocks',
      className: 'grid-designer-column-dialog__content',
      style: {
        display: 'grid',
        gap: '12px',
        maxHeight: 'calc(80vh - 160px)',
        overflow: 'auto',
        paddingRight: '4px',
      },
      lowcode: {
        blocks: columnAdvancedFormSections.map((section, index) => ({
          id: `${readString(column.__id, 'column')}-section-${index}`,
          kind: 'form',
          title: section.title,
          className: 'grid-designer-column-dialog__section grid-designer-schema-form-block',
          schema: resolveGridDesignerFormSchema(section.code),
        })),
      },
    });

    const openColumnAdvancedDialog = (
      column: GridDesignerColumn,
      onApply?: (nextColumn: GridDesignerColumn) => void,
    ) => {
      const dialogId = `grid-designer-column-${readString(column.__id, generateNanoid())}`;
      if (findGlobalDialog(dialogId)) return;

      const columnIndex = state.columns.findIndex((item) => item.__id === column.__id);
      const columnTitle = readString(
        column.title,
        readString(column.field, columnIndex >= 0 ? `Column ${columnIndex + 1}` : 'Column'),
      );

      openSchemaDialog({
        id: dialogId,
        title: `${columnTitle} 列配置`,
        width: 'min(960px, calc(100vw - 48px))',
        height: 'min(80vh, calc(100vh - 64px))',
        className: 'grid-designer-column-dialog',
        model: cloneDeep(column),
        content: createColumnAdvancedDialogContent(column),
        onConfirm: (nextValue) => {
          Object.assign(column, nextValue);
          column.editType = readString(
            isPlainRecord(column.editRender) ? column.editRender.name : '',
          );
          onApply?.(column);
          selectColumn(column);
        },
      });
    };

    const openColumnFieldEditor = async (
      column: GridDesignerColumn,
      rows: GridDesignerColumn[],
    ) => {
      const columnIndex = rows.indexOf(column);
      if (columnIndex < 0 || !readString(column.field)) return;

      try {
        const gridOptions = buildGridOptions(state.gridOptions, state.advanced);
        const draftBlock: LowCodePageGridBlock = {
          id: readString(state.business.blockId, 'grid-designer'),
          kind: 'grid',
          title: readString(state.business.title, '数据表格'),
          schema: {
            title: readString(state.business.title, '数据表格'),
            grid: {
              ...cloneDeep(gridOptions),
              columns: cloneDeep(rows),
            },
          },
        };
        let updatedBlock: LowCodePageGridBlock | undefined;
        const { openRuntimeGridFieldEditor } = await import(
          '../../../lowcode/block-materials/grid/runtime-grid-field-editor'
        );

        await openRuntimeGridFieldEditor(
          draftBlock,
          draftBlock.schema.grid.columns[columnIndex],
          columnIndex,
          {
            getServiceApi,
            updateBlock: async ({ changes }) => {
              updatedBlock = {
                ...draftBlock,
                ...cloneDeep(changes),
              } as LowCodePageGridBlock;
              return updatedBlock;
            },
          },
        );

        if (!updatedBlock) return;
        const updatedGrid = updatedBlock.schema.grid;
        const updatedColumn = updatedGrid.columns?.[columnIndex];
        if (!updatedColumn) return;

        Object.assign(column, normalizeColumn({
          ...column,
          ...updatedColumn,
          __id: column.__id,
        }, columnIndex));
        const {
          columns: _columns,
          data: _data,
          menuConfig: _menuConfig,
          ...updatedGridOptions
        } = updatedGrid;
        const normalizedGridOptions = normalizeGridOptions(updatedGridOptions);
        resetReactiveObject(state.gridOptions, normalizedGridOptions.options);
        resetReactiveObject(state.advanced, normalizedGridOptions.advanced);
        resetReactiveObject(
          state.advancedModels,
          createAdvancedFormModels(normalizedGridOptions.advanced),
        );
        syncColumnsFromRows(rows);
        selectColumn(
          state.columns.find((item) => item.__id === column.__id) ?? state.columns[columnIndex],
        );
        syncActiveDesignerDialogModel();
      } catch (error) {
        ElMessage.error(error instanceof Error ? error.message : '高级列设计打开失败');
      }
    };

    const syncAdvancedConfigModel = (
      field: string,
      value: Record<string, unknown>,
    ) => {
      const nextValue = isPlainRecord(value) ? cloneDeep(value) : {};
      (state.advancedModels as Record<string, Record<string, unknown>>)[field] = nextValue;
      state.advanced[field] = JSON.stringify(compactObject(cloneDeep(nextValue)), null, 2);
    };

    const gridDesignerFormBlockId = 'grid-designer-form';

    const readGridDesignerFormModel = () => {
      const model = designerFormModels[gridDesignerFormBlockId];
      return isPlainRecord(model) ? model : undefined;
    };

    const readGridDesignerSectionModel = (code: string) => {
      const section = readGridDesignerFormModel()?.[code];
      return isPlainRecord(section) ? section : undefined;
    };

    const syncColumnsFromRows = (rows: unknown) => {
      const selectedId = state.selectedColumnId;
      state.columns = normalizeColumns(rows);
      resetReactiveObject(state.formSettings, createFormSettings(state.columns));

      const formSettingsModel = readGridDesignerSectionModel(
        gridDesignerFormCodes.formSettings,
      );
      if (isPlainRecord(formSettingsModel)) {
        resetReactiveObject(
          formSettingsModel,
          createSchemaModel(
            resolveGridDesignerFormSchema(gridDesignerFormCodes.formSettings),
            state.formSettings as unknown as Record<string, unknown>,
          ),
        );
      }

      if (!state.columns.some((column) => column.__id === selectedId)) {
        selectColumn(state.columns[0]);
      }
    };

    const syncEventsFromRows = (rows: unknown) => {
      state.gridEvents = normalizeEvents(rows);
    };

    const createColumnDesignerSchema = (): LowCodeFormSchema => {
      const schema = resolveGridDesignerFormSchema(gridDesignerFormCodes.columns);
      const columnsField = schema.fields.find((field) => field.field === 'columns');
      if (!columnsField) {
        throw new Error('数据表格设计表单的列设计区段缺少 columns 字段。');
      }

      const fieldProps = isPlainRecord(columnsField.props) ? columnsField.props : {};
      const toolbarButtons = Array.isArray(fieldProps.toolbarButtons)
        ? fieldProps.toolbarButtons.filter(isPlainRecord).map((button) => {
            const code = readString(button.code);
            if (code === 'associate-entity') {
              return { ...button, execute: async () => openSourcePicker('entity') };
            }
            if (code === 'associate-view') {
              return { ...button, execute: async () => openSourcePicker('view') };
            }
            if (code === 'sync-table-comments') {
              return { ...button, execute: async () => syncColumnsFromTableComments() };
            }
            return button;
          })
        : [];

      columnsField.props = {
        ...fieldProps,
        toolbarButtons,
        rowActions: [
          {
            code: 'advanced-column-design',
            title: '高级列设计',
            icon: 'ri-settings-3-line',
            status: 'primary',
            disabled: ({ row }: { row?: GridDesignerColumn }) => !readString(row?.field),
          },
        ],
        actionWidth: Math.max(
          Number(fieldProps.actionWidth) || 0,
          108,
        ),
        onRowAction: ({
          action,
          row,
          rows,
        }: {
          action: { code?: string };
          row: GridDesignerColumn;
          rows: GridDesignerColumn[];
        }) => {
          if (readString(action?.code) !== 'advanced-column-design') return;
          const rowIndex = rows.indexOf(row);
          Object.assign(row, normalizeColumn(row, rowIndex >= 0 ? rowIndex : 0));
          selectColumn(row);
          void openColumnFieldEditor(row, rows);
        },
        onRowMove: ({ rows }: { rows: unknown }) => {
          syncColumnsFromRows(rows);
          const columnModel = readGridDesignerSectionModel(gridDesignerFormCodes.columns);
          if (isPlainRecord(columnModel)) {
            columnModel.columns = state.columns as unknown as Record<string, unknown>[];
          }
        },
        onRowClick: ({ row }: { row: GridDesignerColumn }) => selectColumn(row),
        onRowDblclick: ({
          row,
          rows,
        }: {
          row: GridDesignerColumn;
          rows: GridDesignerColumn[];
        }) => {
          const rowIndex = rows.indexOf(row);
          Object.assign(row, normalizeColumn(row, rowIndex >= 0 ? rowIndex : 0));
          selectColumn(row);
          openColumnAdvancedDialog(row, () => syncColumnsFromRows(rows));
        },
      };
      return schema;
    };

    const createGridDesignerSchema = (): LowCodeFormSchema => {
      if (!databaseFormSchema) {
        throw new Error('数据表格设计表单尚未加载。');
      }

      const schema = cloneDeep(databaseFormSchema);
      const columnsSection = schema.fields.find(
        (field) => field.field === gridDesignerFormCodes.columns,
      );
      if (!columnsSection || !isPlainRecord(columnsSection.props)) {
        throw new Error('数据表格设计表单缺少列设计区段。');
      }
      columnsSection.props = {
        ...columnsSection.props,
        schema: createColumnDesignerSchema(),
      };
      return schema;
    };

    const normalizePostDataJsonField = (value: unknown) => {
      if (typeof value === 'string') return;

      const nextValue = isPlainRecord(value) ? compactObject(value) : {};
      state.business.postDataJson = JSON.stringify(nextValue, null, 2);
    };

    const syncBusinessSourceTarget = (clearCustomTargetAliases = false) => {
      const sourceType = state.business.sourceType;
      const sourceTarget = sourceType === 'custom'
        ? ''
        : readString(state.business.viewName, state.business.tableName);

      state.business.postDataJson = JSON.stringify(
        createSourcePostData(
          state.business.postDataJson,
          sourceTarget,
          sourceType !== 'custom',
          sourceType !== 'custom' || clearCustomTargetAliases,
        ),
        null,
        2,
      );
    };

    const createSchemaModel = (
      schema: LowCodeFormSchema,
      source: Record<string, unknown>,
    ) =>
      schema.fields.reduce<Record<string, unknown>>((model, field) => {
        model[field.field] = cloneDeep(source[field.field]);
        return model;
      }, {});

    const createGridDesignerFormModels = () => {
      const advancedModels = state.advancedModels as Record<string, Record<string, unknown>>;
      const formModel = {
        [gridDesignerFormCodes.columns]: {
          columns: state.columns as unknown as Record<string, unknown>[],
        },
        [gridDesignerFormCodes.businessInfo]: createSchemaModel(
          resolveGridDesignerFormSchema(gridDesignerFormCodes.businessInfo),
          state.business as unknown as Record<string, unknown>,
        ),
        [gridDesignerFormCodes.detailConfig]: createSchemaModel(
          resolveGridDesignerFormSchema(gridDesignerFormCodes.detailConfig),
          state.detailConfig as unknown as Record<string, unknown>,
        ),
        [gridDesignerFormCodes.formSettings]: createSchemaModel(
          resolveGridDesignerFormSchema(gridDesignerFormCodes.formSettings),
          state.formSettings as unknown as Record<string, unknown>,
        ),
        [gridDesignerFormCodes.gridOptions]: createSchemaModel(
          resolveGridDesignerFormSchema(gridDesignerFormCodes.gridOptions),
          state.gridOptions as Record<string, unknown>,
        ),
        [gridDesignerFormCodes.rowConfig]: createSchemaModel(
          resolveGridDesignerFormSchema(gridDesignerFormCodes.rowConfig),
          state.gridOptions as Record<string, unknown>,
        ),
        [gridDesignerFormCodes.columnConfig]: createSchemaModel(
          resolveGridDesignerFormSchema(gridDesignerFormCodes.columnConfig),
          state.gridOptions as Record<string, unknown>,
        ),
        [gridDesignerFormCodes.events]: {
          gridEvents: state.gridEvents as unknown as Record<string, unknown>[],
        },
        ...advancedGridConfigDefinitions.reduce<Record<string, Record<string, unknown>>>(
          (models, config) => {
            models[config.code] = advancedModels[config.field] ?? {};
            return models;
          },
          {},
        ),
        [gridDesignerFormCodes.extraProps]: {
          value: advancedModels.extraPropsJson ?? {},
        },
      };

      return {
        [gridDesignerFormBlockId]: formModel,
      };
    };

    const readRuntimeFormValues = (event: LowCodeRuntimeEvent) =>
      isPlainRecord(event.payload) && isPlainRecord(event.payload.values)
        ? event.payload.values
        : null;

    const syncGridDesignerRuntimeEvent = async (event: LowCodeRuntimeEvent) => {
      if (event.name !== 'form.fieldChange' || event.blockId !== gridDesignerFormBlockId) {
        return;
      }

      const values = readRuntimeFormValues(event);
      if (!values) return;
      const sectionCode = readString(event.payload?.field);
      const payloadValue = isPlainRecord(event.payload)
        ? event.payload.value
        : undefined;
      const modelValue = values[sectionCode];
      let sectionValues: Record<string, unknown> | undefined;
      if (isPlainRecord(payloadValue)) {
        sectionValues = payloadValue;
      } else if (isPlainRecord(modelValue)) {
        sectionValues = modelValue;
      }
      if (!sectionValues) return;

      if (sectionCode === gridDesignerFormCodes.columns) {
        syncColumnsFromRows(sectionValues.columns);
        return;
      }

      if (sectionCode === gridDesignerFormCodes.events) {
        syncEventsFromRows(sectionValues.gridEvents);
        return;
      }

      if (sectionCode === gridDesignerFormCodes.formSettings) {
        Object.assign(state.formSettings, sectionValues);
        syncColumnsFromFormSettings();
        const columnModel = readGridDesignerSectionModel(gridDesignerFormCodes.columns);
        if (columnModel) {
          columnModel.columns = state.columns as unknown as Record<string, unknown>[];
        }
        return;
      }

      if (sectionCode === gridDesignerFormCodes.businessInfo) {
        const previousBusiness = cloneDeep(state.business);
        const previousSourceType = state.business.sourceType;
        Object.assign(state.business, sectionValues);

        if (Object.prototype.hasOwnProperty.call(sectionValues, 'tableType')) {
          const tableType = readString(sectionValues.tableType);
          state.business.tableType = tableType === 'main'
            ? 'main'
            : tableType === 'detail'
              ? 'detail'
              : 'default';
        }

        if (
          Object.prototype.hasOwnProperty.call(sectionValues, 'sourceType') &&
          readString(sectionValues.sourceType) !== readString(previousBusiness.sourceType)
        ) {
          const sourceType = readString(sectionValues.sourceType);
          state.business.sourceType = sourceType === 'view'
            ? 'view'
            : sourceType === 'table'
              ? 'table'
              : 'custom';
          syncBusinessSourceTarget(
            state.business.sourceType === 'custom' && previousSourceType !== 'custom',
          );
        }

        if (readString(sectionValues.tableName) !== readString(previousBusiness.tableName)) {
          if (!readString(sectionValues.tableName)) {
            state.business.tableName = '';
            if (state.business.sourceType === 'table') {
              state.business.sourceType = state.business.viewName ? 'view' : 'custom';
            }
            syncBusinessSourceTarget(previousSourceType === 'table');
          } else {
            await applyAssociationOption('table', sectionValues.tableName);
          }
        }

        if (readString(sectionValues.viewName) !== readString(previousBusiness.viewName)) {
          if (!readString(sectionValues.viewName)) {
            state.business.viewName = '';
            if (state.business.sourceType === 'view') {
              state.business.sourceType = state.business.tableName ? 'table' : 'custom';
            }
            syncBusinessSourceTarget(previousSourceType === 'view');
          } else {
            await applyAssociationOption('view', sectionValues.viewName);
          }
        }

        if (Object.prototype.hasOwnProperty.call(sectionValues, 'postDataJson')) {
          normalizePostDataJsonField(sectionValues.postDataJson);
        }
        if (
          state.business.tableType !== previousBusiness.tableType ||
          readString(state.business.sourceKey) !== readString(previousBusiness.sourceKey)
        ) {
          refreshGridDesignerPageSourceOptions();
          await refreshDetailTableFieldOptions();
          await refreshParentTableFieldOptions();
        }
        syncActiveDesignerDialogModel();
        return;
      }

      if (sectionCode === gridDesignerFormCodes.detailConfig) {
        const previousResource = readString(state.detailConfig.resource);
        const previousParentSourceKey = readString(state.detailConfig.parentSourceKey);
        Object.assign(state.detailConfig, normalizeDetailConfig({
          ...state.detailConfig,
          ...sectionValues,
        }));
        if (readString(state.detailConfig.resource) !== previousResource) {
          await refreshDetailTableFieldOptions();
        }
        if (readString(state.detailConfig.parentSourceKey) !== previousParentSourceKey) {
          await refreshParentTableFieldOptions();
        }
        return;
      }

      if (
        sectionCode === gridDesignerFormCodes.gridOptions ||
        sectionCode === gridDesignerFormCodes.rowConfig ||
        sectionCode === gridDesignerFormCodes.columnConfig
      ) {
        Object.assign(state.gridOptions, sectionValues);
        return;
      }

      const advancedConfig = advancedGridConfigDefinitions.find(
        (config) => sectionCode === config.code,
      );

      if (advancedConfig) {
        syncAdvancedConfigModel(advancedConfig.field, sectionValues);
        return;
      }

      if (sectionCode === gridDesignerFormCodes.extraProps) {
        syncAdvancedConfigModel(
          'extraPropsJson',
          isPlainRecord(sectionValues.value) ? sectionValues.value : {},
        );
      }
    };

    const createGridDesignerDialogBlocks = (): LowCodePageBlock[] => [{
      id: gridDesignerFormBlockId,
      kind: 'form',
      title: '数据表格设计',
      className: 'grid-designer-master-form grid-designer-schema-form-block',
      layout: { fillRemaining: true },
      schema: createGridDesignerSchema(),
    }];

    const createGridDesignerDialogSchema = (): GlobalDialogContentNode[] => [
      {
        type: 'lowcodeBlocks',
        className: 'grid-designer-lowcode-dialog',
        style: {
          height: 'min(760px, calc(100vh - 154px))',
          minHeight: '560px',
        },
        lowcode: {
          blocks: createGridDesignerDialogBlocks(),
          formModels: designerFormModels,
          resolvedData: gridDesignerFieldOptionSources,
          onRuntimeEvent: syncGridDesignerRuntimeEvent,
        },
      },
    ];

    return () => null;
  },
});

export const $$gridDesigner = (() => {
  let ins: any;
  return (option: GridDesignerServiceOption) => {
    let resolvedServiceApi = option.serviceApi;
    if (!resolvedServiceApi) {
      try {
        resolvedServiceApi = typeof useServiceApi === 'function' ? useServiceApi() : undefined;
      } catch {
        resolvedServiceApi = undefined;
      }
    }

    if (!ins) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const app = createApp(ServiceComponent, {
        option: {
          ...option,
          serviceApi: resolvedServiceApi,
          onConfirm: () => undefined,
        },
      });
      app.use(DesignerUI);
      app.config.globalProperties.$$refs = {};
      ins = app.mount(el);
    }
    const dfd = defer<GridDesignerResult>();
    void Promise.resolve(ins.service({
      ...option,
      serviceApi: resolvedServiceApi,
      onConfirm: async (result: GridDesignerResult) => {
        await option.onConfirm?.(result);
        dfd.resolve(result);
      },
    })).catch((error) => {
      ElMessage.error(error instanceof Error ? error.message : '数据表格设计表单加载失败。');
      dfd.reject();
    });
    return dfd.promise;
  };
})();
