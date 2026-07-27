import {
  computed,
  createApp,
  defineComponent,
  getCurrentInstance,
  nextTick,
  onMounted,
  PropType,
  reactive,
} from 'vue';
import DesignerUI, {
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElMessage,
  ElOption,
  ElSelect,
  ElSwitch,
  ElTabPane,
  ElTable,
  ElTableColumn,
  ElTabs,
} from '../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import type { LowCodeFormSchema, LowCodeRuntimeDirective } from '../../../types/lowcode';
import { defer } from '../../utils/defer';
import { generateNanoid } from '../../utils';

export type GridDesignerColumn = {
  __id?: string;
  field?: string;
  title?: string;
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
  formatter?: string;
  filtersJson?: string;
  cellRenderJson?: string;
  editRenderJson?: string;
  paramsJson?: string;
  [key: string]: unknown;
};

export type GridDesignerBusinessInfo = {
  blockId: string;
  title: string;
  sourceKey: string;
  serviceName: string;
  serviceMethod: string;
  saveMethod: string;
  deleteMethod: string;
  postDataJson: string;
  showRowActions: boolean;
};

export type GridDesignerEvent = {
  key: string;
  vxeName: string;
  nativeName: string;
  label: string;
  enabled: boolean;
  eventName?: string;
  directivesJson?: string;
};

export type GridDesignerResult = {
  business: GridDesignerBusinessInfo;
  columns: GridDesignerColumn[];
  gridOptions: Record<string, unknown>;
  gridEvents: GridDesignerEvent[];
};

interface GridDesignerServiceOption {
  title?: string;
  business?: Partial<GridDesignerBusinessInfo> | null;
  columns?: GridDesignerColumn[];
  gridOptions?: Record<string, unknown> | null;
  gridEvents?: GridDesignerEvent[] | null;
  onConfirm: (value: GridDesignerResult) => void;
}

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

const columnTypeOptions = [
  { label: '默认', value: '' },
  { label: '序号 seq', value: 'seq' },
  { label: '单选 radio', value: 'radio' },
  { label: '复选 checkbox', value: 'checkbox' },
  { label: '展开 expand', value: 'expand' },
  { label: 'HTML', value: 'html' },
];

const alignOptions = [
  { label: '默认', value: '' },
  { label: '左对齐 left', value: 'left' },
  { label: '居中 center', value: 'center' },
  { label: '右对齐 right', value: 'right' },
];

const fixedOptions = [
  { label: '不固定', value: '' },
  { label: '左侧 left', value: 'left' },
  { label: '右侧 right', value: 'right' },
];

const sizeOptions = [
  { label: '默认', value: '' },
  { label: 'medium', value: 'medium' },
  { label: 'small', value: 'small' },
  { label: 'mini', value: 'mini' },
];

const borderOptions = [
  { label: 'true', value: true },
  { label: 'false', value: false },
  { label: 'default', value: 'default' },
  { label: 'full', value: 'full' },
  { label: 'outer', value: 'outer' },
  { label: 'inner', value: 'inner' },
  { label: 'none', value: 'none' },
];

const overflowOptions = [
  { label: '默认', value: '' },
  { label: 'true', value: true },
  { label: 'false', value: false },
  { label: 'ellipsis', value: 'ellipsis' },
  { label: 'title', value: 'title' },
  { label: 'tooltip', value: 'tooltip' },
];

const columnAdvancedFormSchema: LowCodeFormSchema = {
  fields: [
    {
      field: 'maxWidth',
      label: 'maxWidth',
      component: 'vxe-input',
      props: { placeholder: 'maxWidth' },
    },
    {
      field: 'headerAlign',
      label: 'headerAlign',
      component: 'vxe-select',
      options: alignOptions,
    },
    {
      field: 'footerAlign',
      label: 'footerAlign',
      component: 'vxe-select',
      options: alignOptions,
    },
    {
      field: 'resizable',
      label: 'resizable',
      component: 'vxe-switch',
    },
    {
      field: 'showHeaderOverflow',
      label: 'showHeaderOverflow',
      component: 'vxe-select',
      options: overflowOptions as any,
    },
    {
      field: 'showFooterOverflow',
      label: 'showFooterOverflow',
      component: 'vxe-select',
      options: overflowOptions as any,
    },
    {
      field: 'filtersJson',
      label: 'filters JSON',
      component: 'vxe-textarea',
      props: { rows: 4, placeholder: '[]' },
    },
    {
      field: 'cellRenderJson',
      label: 'cellRender JSON',
      component: 'vxe-textarea',
      props: { rows: 4, placeholder: '{}' },
    },
    {
      field: 'editRenderJson',
      label: 'editRender JSON',
      component: 'vxe-textarea',
      props: { rows: 4, placeholder: '{}' },
    },
    {
      field: 'paramsJson',
      label: 'params JSON',
      component: 'vxe-textarea',
      props: { rows: 4, placeholder: '{}' },
    },
  ],
  actions: [],
};

const eventDefinitions: Omit<GridDesignerEvent, 'enabled' | 'eventName' | 'directivesJson'>[] = [
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
    filtersJson: '',
    cellRenderJson: '',
    editRenderJson: '',
    paramsJson: '',
  };
}

function normalizeColumn(column: unknown, index: number): GridDesignerColumn {
  const row = isPlainRecord(column) ? column : {};
  const fallback = createDefaultColumn(index);

  return {
    ...fallback,
    __id: readString(row.__id, fallback.__id),
    field: readString(row.field, fallback.field),
    title: readString(row.title, readString(row.field, fallback.title)),
    type: readString(row.type),
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
    formatter: isPlainRecord(row.formatter) || Array.isArray(row.formatter)
      ? stringifyJson(row.formatter, {})
      : readString(row.formatter),
    filtersJson: stringifyJson(row.filters, []),
    cellRenderJson: stringifyJson(row.cellRender, {}),
    editRenderJson: stringifyJson(row.editRender, {}),
    paramsJson: stringifyJson(row.params, {}),
  };
}

function normalizeColumns(columns: unknown) {
  const rows = Array.isArray(columns) ? columns : [];
  const normalized = rows.map((column, index) => normalizeColumn(column, index));
  return normalized.length ? normalized : [createDefaultColumn()];
}

function createDefaultBusiness(): GridDesignerBusinessInfo {
  return {
    blockId: 'records-grid',
    title: '数据列表',
    sourceKey: 'records',
    serviceName: 'admin',
    serviceMethod: 'listUsers',
    saveMethod: '',
    deleteMethod: '',
    postDataJson: '{}',
    showRowActions: true,
  };
}

function normalizeBusiness(value: unknown): GridDesignerBusinessInfo {
  const row = isPlainRecord(value) ? value : {};
  const fallback = createDefaultBusiness();

  return {
    blockId: readString(row.blockId, fallback.blockId),
    title: readString(row.title, fallback.title),
    sourceKey: readString(row.sourceKey, fallback.sourceKey),
    serviceName: readString(row.serviceName, fallback.serviceName),
    serviceMethod: readString(row.serviceMethod, fallback.serviceMethod),
    saveMethod: readString(row.saveMethod),
    deleteMethod: readString(row.deleteMethod),
    postDataJson: readString(row.postDataJson, fallback.postDataJson),
    showRowActions: readBoolean(row.showRowActions, fallback.showRowActions),
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

function normalizeEvents(value: unknown) {
  const rows = Array.isArray(value) ? value.filter(isPlainRecord) : [];
  const rowMap = new Map(rows.map((row) => [readString(row.key), row]));

  return eventDefinitions.map<GridDesignerEvent>((definition) => {
    const row = rowMap.get(definition.key) ?? {};
    return {
      ...definition,
      enabled: readBoolean(row.enabled, false),
      eventName: readString(row.eventName),
      directivesJson: readString(row.directivesJson, '[]'),
    };
  });
}

function resetReactiveObject(target: Record<string, unknown>, source: Record<string, unknown>) {
  Object.keys(target).forEach((key) => delete target[key]);
  Object.assign(target, source);
}

function validateColumnJson(column: GridDesignerColumn, index: number) {
  const label = `第 ${index + 1} 列`;
  const fields = [
    ['filtersJson', `${label} filters`],
    ['cellRenderJson', `${label} cellRender`],
    ['editRenderJson', `${label} editRender`],
    ['paramsJson', `${label} params`],
  ] as const;

  for (const [field, fieldLabel] of fields) {
    const text = readString(column[field]);
    if (!text || text === '[]' || text === '{}') continue;

    const parsed = parseJson(text, fieldLabel);
    if (!parsed.ok) return parsed;
  }

  return { ok: true, value: undefined } as JsonParseResult;
}

function normalizeColumnForResult(column: GridDesignerColumn, index: number): GridDesignerColumn {
  const field = readString(column.field);
  const title = readString(column.title, field || `列${index + 1}`);
  const type = readString(column.type);
  const formatter = parseJsonValueOrString(column.formatter, `第 ${index + 1} 列 formatter`);

  if (formatter.ok === false) {
    throw new Error(formatter.message);
  }

  const filters = parseJson(readString(column.filtersJson), `第 ${index + 1} 列 filters`);
  const cellRender = parseJson(readString(column.cellRenderJson), `第 ${index + 1} 列 cellRender`);
  const editRender = parseJson(readString(column.editRenderJson), `第 ${index + 1} 列 editRender`);
  const params = parseJson(readString(column.paramsJson), `第 ${index + 1} 列 params`);

  assertJsonParsed(filters);
  assertJsonParsed(cellRender);
  assertJsonParsed(editRender);
  assertJsonParsed(params);

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
    filters: filters.value,
    cellRender: cellRender.value,
    editRender: editRender.value,
    params: params.value,
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
    if (!event.enabled) {
      return {
        ...event,
        directivesJson: readString(event.directivesJson, '[]'),
      };
    }

    const parsed = parseJsonArray(readString(event.directivesJson, '[]'), `${event.vxeName} 指令`);
    assertJsonParsed(parsed);

    return {
      ...event,
      eventName: readString(event.eventName),
      directivesJson: JSON.stringify(normalizeRuntimeDirectives(parsed.value), null, 2),
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
      showFlag: false,
      activeTab: 'columns',
      business: normalizeBusiness(props.option.business),
      columns: initialColumns,
      selectedColumnId: readString(initialColumns[0]?.__id),
      gridOptions: normalized.options,
      advanced: normalized.advanced,
      gridEvents: normalizeEvents(props.option.gridEvents),
      mounted: (() => {
        const dfd = defer();
        onMounted(() => setTimeout(() => dfd.resolve(), 0));
        return dfd.promise;
      })(),
    });

    const methods = {
      service: async (option: GridDesignerServiceOption) => {
        const nextGridOptions = normalizeGridOptions(option.gridOptions);
        state.option = option;
        state.activeTab = 'columns';
        resetReactiveObject(state.business, normalizeBusiness(option.business));
        state.columns = normalizeColumns(option.columns);
        state.selectedColumnId = readString(state.columns[0]?.__id);
        resetReactiveObject(state.gridOptions, nextGridOptions.options);
        resetReactiveObject(state.advanced, nextGridOptions.advanced);
        state.gridEvents = normalizeEvents(option.gridEvents);
        await methods.show();
      },
      show: async () => {
        await state.mounted;
        state.showFlag = true;
        await nextTick();
      },
      hide: () => {
        state.showFlag = false;
      },
    };

    const selectedColumn = computed(
      () =>
        state.columns.find((column) => column.__id === state.selectedColumnId) ??
        state.columns[0] ??
        null,
    );

    const selectedColumnIndex = computed(() =>
      selectedColumn.value
        ? state.columns.findIndex((column) => column.__id === selectedColumn.value?.__id)
        : -1,
    );

    const selectColumn = (column: GridDesignerColumn) => {
      state.selectedColumnId = readString(column.__id);
    };

    const syncSelectedColumn = (value: Record<string, unknown>) => {
      if (!selectedColumn.value) return;
      Object.assign(selectedColumn.value, value);
    };

    const columnActions = {
      add: () => {
        const column = createDefaultColumn(state.columns.length);
        state.columns.push(column);
        selectColumn(column);
      },
      copy: (index: number) => {
        const copy = {
          ...cloneDeep(state.columns[index]),
          __id: `column_${generateNanoid()}`,
        };
        state.columns.splice(index + 1, 0, copy);
        selectColumn(copy);
      },
      remove: (index: number) => {
        if (state.columns.length <= 1) {
          ElMessage.warning('至少保留一列');
          return;
        }
        const removed = state.columns[index];
        state.columns.splice(index, 1);
        if (removed?.__id === state.selectedColumnId) {
          selectColumn(state.columns[Math.min(index, state.columns.length - 1)]);
        }
      },
      move: (index: number, offset: number) => {
        const targetIndex = index + offset;
        if (targetIndex < 0 || targetIndex >= state.columns.length) return;
        const [column] = state.columns.splice(index, 1);
        state.columns.splice(targetIndex, 0, column);
      },
    };

    const handler = {
      onConfirm: () => {
        try {
          const postData = parseJsonObject(state.business.postDataJson, 'postDataJson');
          assertJsonParsed(postData);

          const invalidColumn = state.columns.find(
            (column) => !readString(column.field) && !readString(column.title) && !readString(column.type),
          );
          if (invalidColumn) {
            ElMessage.error('列设计中 field、title、type 至少填写一个');
            return;
          }

          for (let index = 0; index < state.columns.length; index += 1) {
            const parsed = validateColumnJson(state.columns[index], index);
            assertJsonParsed(parsed);
          }

          state.option.onConfirm({
            business: cloneDeep(state.business),
            columns: state.columns.map((column, index) => normalizeColumnForResult(column, index)),
            gridOptions: buildGridOptions(state.gridOptions, state.advanced),
            gridEvents: buildEvents(state.gridEvents),
          });
          methods.hide();
        } catch (error) {
          ElMessage.error(error instanceof Error ? error.message : '表格配置格式不正确');
        }
      },
      onCancel: () => {
        methods.hide();
      },
    };

    Object.assign(ctx.proxy!, methods);

    const renderSelectOptions = (options: { label: string; value: unknown }[]) =>
      options.map((option) => (
        <ElOption key={String(option.value)} label={option.label} value={option.value} />
      ));

    const renderColumnDesigner = () => (
      <div class="grid-designer-panel">
        <div class="grid-designer-actions">
          <ElButton type="primary" onClick={columnActions.add}>
            新增列
          </ElButton>
        </div>
        <ElTable data={state.columns} border height="460" rowKey="__id" class="grid-designer-table">
          <ElTableColumn type="index" width={48} label="#" />
          <ElTableColumn label="field" minWidth={150}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElInput v-model={row.field} placeholder="field" />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="title" minWidth={150}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElInput v-model={row.title} placeholder="title" />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="type" width={132}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElSelect v-model={row.type}>{renderSelectOptions(columnTypeOptions)}</ElSelect>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="width" width={108}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElInput v-model={row.width} placeholder="auto" />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="minWidth" width={118}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElInput v-model={row.minWidth} placeholder="minWidth" />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="fixed" width={116}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElSelect v-model={row.fixed}>{renderSelectOptions(fixedOptions)}</ElSelect>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="align" width={124}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElSelect v-model={row.align}>{renderSelectOptions(alignOptions)}</ElSelect>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="sortable" width={96} align="center">
            {{
              default: ({ row }: { row: GridDesignerColumn }) => <ElSwitch v-model={row.sortable} />,
            }}
          </ElTableColumn>
          <ElTableColumn label="visible" width={92} align="center">
            {{
              default: ({ row }: { row: GridDesignerColumn }) => <ElSwitch v-model={row.visible} />,
            }}
          </ElTableColumn>
          <ElTableColumn label="showOverflow" width={138}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElSelect v-model={row.showOverflow}>{renderSelectOptions(overflowOptions)}</ElSelect>
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="formatter" minWidth={210}>
            {{
              default: ({ row }: { row: GridDesignerColumn }) => (
                <ElInput v-model={row.formatter} placeholder='{"type":"text"} 或格式化器名' />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="操作" width={172} fixed="right">
            {{
              default: ({ $index }: { $index: number }) => (
                <div class="grid-designer-row-actions">
                  <ElButton text type="primary" onClick={() => columnActions.move($index, -1)}>
                    上移
                  </ElButton>
                  <ElButton text type="primary" onClick={() => columnActions.move($index, 1)}>
                    下移
                  </ElButton>
                  <ElButton text type="primary" onClick={() => columnActions.copy($index)}>
                    复制
                  </ElButton>
                  <ElButton text type="danger" onClick={() => columnActions.remove($index)}>
                    删除
                  </ElButton>
                </div>
              ),
            }}
          </ElTableColumn>
        </ElTable>
      </div>
    );

    const renderColumnDesignerWorkbench = () => {
      const column = selectedColumn.value;
      const fallbackTitle =
        selectedColumnIndex.value >= 0 ? `Column ${selectedColumnIndex.value + 1}` : 'Column';

      return (
        <div class="grid-designer-panel">
          <div class="grid-designer-column-layout">
            <section class="grid-designer-column-table-panel">
              <div class="grid-designer-actions">
                <ElButton type="primary" onClick={columnActions.add}>
                  新增列
                </ElButton>
              </div>
              <ElTable
                data={state.columns}
                border
                height="100%"
                rowKey="__id"
                class="grid-designer-table"
                {...({
                  rowClassName: ({ row }: { row: GridDesignerColumn }) =>
                    row.__id === state.selectedColumnId ? 'is-selected' : '',
                  onCellClick: ({ row }: { row: GridDesignerColumn }) => selectColumn(row),
                } as any)}
              >
                <ElTableColumn type="index" width={48} label="#" />
                <ElTableColumn label="field" minWidth={150}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElInput v-model={row.field} placeholder="field" />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="title" minWidth={150}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElInput v-model={row.title} placeholder="title" />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="type" width={132}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElSelect v-model={row.type}>{renderSelectOptions(columnTypeOptions)}</ElSelect>
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="width" width={108}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElInput v-model={row.width} placeholder="auto" />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="minWidth" width={118}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElInput v-model={row.minWidth} placeholder="minWidth" />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="fixed" width={116}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElSelect v-model={row.fixed}>{renderSelectOptions(fixedOptions)}</ElSelect>
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="align" width={124}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElSelect v-model={row.align}>{renderSelectOptions(alignOptions)}</ElSelect>
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="sortable" width={96} align="center">
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElSwitch v-model={row.sortable} />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="visible" width={92} align="center">
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElSwitch v-model={row.visible} />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="showOverflow" width={138}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElSelect v-model={row.showOverflow}>
                        {renderSelectOptions(overflowOptions)}
                      </ElSelect>
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="formatter" minWidth={210}>
                  {{
                    default: ({ row }: { row: GridDesignerColumn }) => (
                      <ElInput v-model={row.formatter} placeholder='{"type":"text"} 或格式化器名' />
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="操作" width={172} fixed="right">
                  {{
                    default: ({ $index }: { $index: number }) => (
                      <div class="grid-designer-row-actions">
                        <ElButton text type="primary" onClick={() => columnActions.move($index, -1)}>
                          上移
                        </ElButton>
                        <ElButton text type="primary" onClick={() => columnActions.move($index, 1)}>
                          下移
                        </ElButton>
                        <ElButton text type="primary" onClick={() => columnActions.copy($index)}>
                          复制
                        </ElButton>
                        <ElButton text type="danger" onClick={() => columnActions.remove($index)}>
                          删除
                        </ElButton>
                      </div>
                    ),
                  }}
                </ElTableColumn>
              </ElTable>
            </section>

            <aside class="grid-designer-column-form-panel">
              <div class="grid-designer-card is-compact grid-designer-column-form-card">
                <h3>{readString(column?.title, readString(column?.field, fallbackTitle))} 高级列属性</h3>
                {column ? (
                  <LowCodeForm
                    key={column.__id}
                    schema={columnAdvancedFormSchema}
                    modelValue={column as Record<string, unknown>}
                    onUpdate:modelValue={syncSelectedColumn}
                  />
                ) : (
                  <div class="grid-designer-empty">请选择左侧表格中的列</div>
                )}
              </div>
            </aside>
          </div>
        </div>
      );
    };

    const renderBaseInfo = () => (
      <ElForm labelPosition="top" class="grid-designer-panel">
        <div class="grid-designer-card">
          <h3>业务信息</h3>
          <div class="grid-designer-form-grid">
            <ElFormItem label="blockId">
              <ElInput v-model={state.business.blockId} />
            </ElFormItem>
            <ElFormItem label="title">
              <ElInput v-model={state.business.title} />
            </ElFormItem>
            <ElFormItem label="sourceKey">
              <ElInput v-model={state.business.sourceKey} />
            </ElFormItem>
            <ElFormItem label="serviceName">
              <ElInput v-model={state.business.serviceName} />
            </ElFormItem>
            <ElFormItem label="serviceMethod">
              <ElInput v-model={state.business.serviceMethod} />
            </ElFormItem>
            <ElFormItem label="saveMethod">
              <ElInput v-model={state.business.saveMethod} />
            </ElFormItem>
            <ElFormItem label="deleteMethod">
              <ElInput v-model={state.business.deleteMethod} />
            </ElFormItem>
            <ElFormItem label="showRowActions">
              <ElSwitch v-model={state.business.showRowActions} />
            </ElFormItem>
            <ElFormItem label="postDataJson" class="grid-designer-col-span-2">
              <ElInput v-model={state.business.postDataJson} type="textarea" rows={4} />
            </ElFormItem>
          </div>
        </div>

        <div class="grid-designer-card">
          <h3>VxeGrid 表格入参</h3>
          <div class="grid-designer-form-grid">
            <ElFormItem label="id">
              <ElInput v-model={state.gridOptions.id} />
            </ElFormItem>
            <ElFormItem label="size">
              <ElSelect v-model={state.gridOptions.size}>{renderSelectOptions(sizeOptions)}</ElSelect>
            </ElFormItem>
            <ElFormItem label="height">
              <ElInput v-model={state.gridOptions.height} placeholder="auto / 480" />
            </ElFormItem>
            <ElFormItem label="maxHeight">
              <ElInput v-model={state.gridOptions.maxHeight} />
            </ElFormItem>
            <ElFormItem label="border">
              <ElSelect v-model={state.gridOptions.border}>{renderSelectOptions(borderOptions)}</ElSelect>
            </ElFormItem>
            <ElFormItem label="stripe">
              <ElSwitch v-model={state.gridOptions.stripe} />
            </ElFormItem>
            <ElFormItem label="round">
              <ElSwitch v-model={state.gridOptions.round} />
            </ElFormItem>
            <ElFormItem label="showHeader">
              <ElSwitch v-model={state.gridOptions.showHeader} />
            </ElFormItem>
            <ElFormItem label="showFooter">
              <ElSwitch v-model={state.gridOptions.showFooter} />
            </ElFormItem>
            <ElFormItem label="showOverflow">
              <ElSelect v-model={state.gridOptions.showOverflow}>
                {renderSelectOptions(overflowOptions)}
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="showHeaderOverflow">
              <ElSelect v-model={state.gridOptions.showHeaderOverflow}>
                {renderSelectOptions(overflowOptions)}
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="align">
              <ElSelect v-model={state.gridOptions.align}>{renderSelectOptions(alignOptions)}</ElSelect>
            </ElFormItem>
            <ElFormItem label="headerAlign">
              <ElSelect v-model={state.gridOptions.headerAlign}>
                {renderSelectOptions(alignOptions)}
              </ElSelect>
            </ElFormItem>
            <ElFormItem label="autoResize">
              <ElSwitch v-model={state.gridOptions.autoResize} />
            </ElFormItem>
            <ElFormItem label="keepSource">
              <ElSwitch v-model={state.gridOptions.keepSource} />
            </ElFormItem>
          </div>
        </div>

        <div class="grid-designer-card">
          <h3>rowConfig / columnConfig</h3>
          <div class="grid-designer-form-grid">
            <ElFormItem label="rowConfig.keyField">
              <ElInput v-model={(state.gridOptions.rowConfig as Record<string, unknown>).keyField} />
            </ElFormItem>
            <ElFormItem label="rowConfig.useKey">
              <ElSwitch v-model={(state.gridOptions.rowConfig as Record<string, unknown>).useKey} />
            </ElFormItem>
            <ElFormItem label="rowConfig.isCurrent">
              <ElSwitch v-model={(state.gridOptions.rowConfig as Record<string, unknown>).isCurrent} />
            </ElFormItem>
            <ElFormItem label="rowConfig.isHover">
              <ElSwitch v-model={(state.gridOptions.rowConfig as Record<string, unknown>).isHover} />
            </ElFormItem>
            <ElFormItem label="rowConfig.resizable">
              <ElSwitch v-model={(state.gridOptions.rowConfig as Record<string, unknown>).resizable} />
            </ElFormItem>
            <ElFormItem label="rowConfig.drag">
              <ElSwitch v-model={(state.gridOptions.rowConfig as Record<string, unknown>).drag} />
            </ElFormItem>
            <ElFormItem label="columnConfig.useKey">
              <ElSwitch v-model={(state.gridOptions.columnConfig as Record<string, unknown>).useKey} />
            </ElFormItem>
            <ElFormItem label="columnConfig.resizable">
              <ElSwitch v-model={(state.gridOptions.columnConfig as Record<string, unknown>).resizable} />
            </ElFormItem>
            <ElFormItem label="columnConfig.isCurrent">
              <ElSwitch v-model={(state.gridOptions.columnConfig as Record<string, unknown>).isCurrent} />
            </ElFormItem>
            <ElFormItem label="columnConfig.isHover">
              <ElSwitch v-model={(state.gridOptions.columnConfig as Record<string, unknown>).isHover} />
            </ElFormItem>
            <ElFormItem label="columnConfig.drag">
              <ElSwitch v-model={(state.gridOptions.columnConfig as Record<string, unknown>).drag} />
            </ElFormItem>
            <ElFormItem label="columnConfig.minWidth">
              <ElInput v-model={(state.gridOptions.columnConfig as Record<string, unknown>).minWidth} />
            </ElFormItem>
          </div>
        </div>

        <div class="grid-designer-card">
          <h3>高级 VxeGrid 配置</h3>
          <div class="grid-designer-form-grid">
            {Object.entries({
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
              extraPropsJson: 'extraProps',
            }).map(([field, label]) => (
              <ElFormItem key={field} label={label} class="grid-designer-col-span-2">
                <ElInput v-model={state.advanced[field]} type="textarea" rows={4} />
              </ElFormItem>
            ))}
          </div>
        </div>
      </ElForm>
    );

    const renderEventDesigner = () => (
      <div class="grid-designer-panel">
        <ElTable data={state.gridEvents} border height="560" rowKey="key" class="grid-designer-table">
          <ElTableColumn label="启用" width={78} align="center">
            {{
              default: ({ row }: { row: GridDesignerEvent }) => <ElSwitch v-model={row.enabled} />,
            }}
          </ElTableColumn>
          <ElTableColumn label="事件说明" prop="label" width={130} />
          <ElTableColumn label="VxeGrid 事件属性" prop="vxeName" width={170} />
          <ElTableColumn label="原生事件名" prop="nativeName" width={190} />
          <ElTableColumn label="运行事件名 eventName" minWidth={220}>
            {{
              default: ({ row }: { row: GridDesignerEvent }) => (
                <ElInput v-model={row.eventName} placeholder={`grid.${row.key}`} />
              ),
            }}
          </ElTableColumn>
          <ElTableColumn label="directives JSON" minWidth={340}>
            {{
              default: ({ row }: { row: GridDesignerEvent }) => (
                <ElInput v-model={row.directivesJson} type="textarea" rows={3} />
              ),
            }}
          </ElTableColumn>
        </ElTable>
      </div>
    );

    return () => (
      <ElDialog
        v-model={state.showFlag}
        title={state.option.title || '表格设计'}
        width="min(1360px, calc(100vw - 40px))"
        top="4vh"
        class="grid-designer-dialog form-workbench-dialog"
        destroyOnClose={true}
      >
        {{
          default: () => (
            <div class="grid-designer-workbench">
              <ElTabs v-model={state.activeTab} class="grid-designer-tabs">
                <ElTabPane label="列设计" name="columns">
                  {renderColumnDesignerWorkbench()}
                </ElTabPane>
                <ElTabPane label="表格信息设计" name="info">
                  {renderBaseInfo()}
                </ElTabPane>
                <ElTabPane label="事件属性" name="events">
                  {renderEventDesigner()}
                </ElTabPane>
              </ElTabs>
            </div>
          ),
          footer: () => (
            <div class="form-workbench-footer">
              <ElButton onClick={handler.onCancel}>取消</ElButton>
              <ElButton type="primary" onClick={handler.onConfirm}>
                确定
              </ElButton>
            </div>
          ),
        }}
      </ElDialog>
    );
  },
});

export const $$gridDesigner = (() => {
  let ins: any;
  return (option: Omit<GridDesignerServiceOption, 'onConfirm'>) => {
    if (!ins) {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const app = createApp(ServiceComponent, {
        option: {
          ...option,
          onConfirm: () => undefined,
        },
      });
      app.use(DesignerUI);
      app.config.globalProperties.$$refs = {};
      ins = app.mount(el);
    }
    const dfd = defer<GridDesignerResult>();
    ins.service({
      ...option,
      onConfirm: dfd.resolve,
    });
    return dfd.promise;
  };
})();
