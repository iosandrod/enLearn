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
  findGlobalDialog,
  openGlobalDialog,
  type GlobalDialogContentNode,
} from '../../../runtime/global-dialog';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodePageBlock,
  LowCodeRuntimeDirective,
  LowCodeRuntimeEvent,
} from '../../../types/lowcode';
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
  formatter?: unknown;
  filters?: unknown[];
  cellRender?: Record<string, unknown>;
  editRender?: Record<string, unknown>;
  params?: Record<string, unknown>;
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
  directives?: LowCodeRuntimeDirective[];
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

const rendererPropFields: LowCodeField[] = [
  { field: 'placeholder', label: 'placeholder', component: 'vxe-input' },
  { field: 'clearable', label: 'clearable', component: 'vxe-switch' },
  { field: 'disabled', label: 'disabled', component: 'vxe-switch' },
  { field: 'readonly', label: 'readonly', component: 'vxe-switch' },
];

const rendererObjectFields: LowCodeField[] = [
  { field: 'name', label: 'name', component: 'vxe-input', props: { placeholder: 'VxeInput' } },
  {
    field: 'props',
    label: 'props',
    component: 'lc-sub-form',
    props: { fields: rendererPropFields },
  },
  {
    field: 'attrs',
    label: 'attrs',
    component: 'lc-sub-form',
    props: { fields: rendererPropFields },
  },
];

const formatterObjectFields: LowCodeField[] = [
  {
    field: 'type',
    label: 'type',
    component: 'vxe-select',
    options: [
      { label: 'text', value: 'text' },
      { label: 'date', value: 'date' },
      { label: 'datetime', value: 'datetime' },
      { label: 'currency', value: 'currency' },
      { label: 'number', value: 'number' },
      { label: 'enum', value: 'enum' },
    ],
  },
  { field: 'emptyText', label: 'emptyText', component: 'vxe-input' },
  { field: 'locale', label: 'locale', component: 'vxe-input' },
  {
    field: 'options',
    label: 'options',
    component: 'lc-sub-form',
    props: {
      fields: [
        { field: 'dateStyle', label: 'dateStyle', component: 'vxe-input' },
        { field: 'timeStyle', label: 'timeStyle', component: 'vxe-input' },
        { field: 'style', label: 'style', component: 'vxe-input' },
        { field: 'currency', label: 'currency', component: 'vxe-input' },
        { field: 'minimumFractionDigits', label: 'minimumFractionDigits', component: 'lc-number-input' },
        { field: 'maximumFractionDigits', label: 'maximumFractionDigits', component: 'lc-number-input' },
      ],
    },
  },
  {
    field: 'map',
    label: 'map',
    component: 'lc-sub-form',
    props: { fields: [] },
  },
];

type AdvancedGridConfigDefinition = {
  field: string;
  label: string;
  fields: LowCodeField[];
};

const triggerOptions = [
  { label: '默认', value: '' },
  { label: 'manual', value: 'manual' },
  { label: 'click', value: 'click' },
  { label: 'dblclick', value: 'dblclick' },
];

const editModeOptions = [
  { label: '默认', value: '' },
  { label: 'row', value: 'row' },
  { label: 'cell', value: 'cell' },
];

const pagerConfigFields: LowCodeField[] = [
  { field: 'enabled', label: 'enabled', component: 'vxe-switch' },
  { field: 'pageSize', label: 'pageSize', component: 'lc-number-input' },
  { field: 'currentPage', label: 'currentPage', component: 'lc-number-input' },
  {
    field: 'pageSizes',
    label: 'pageSizes',
    component: 'lc-array-table',
    props: { valueMode: 'primitive', valueField: 'value', valueTitle: 'pageSize', addText: '新增' },
  },
  {
    field: 'layouts',
    label: 'layouts',
    component: 'lc-array-table',
    props: { valueMode: 'primitive', valueField: 'value', valueTitle: 'layout', addText: '新增' },
  },
  { field: 'autoHidden', label: 'autoHidden', component: 'vxe-switch' },
  { field: 'perfect', label: 'perfect', component: 'vxe-switch' },
];

const toolbarConfigFields: LowCodeField[] = [
  { field: 'enabled', label: 'enabled', component: 'vxe-switch' },
  { field: 'refresh', label: 'refresh', component: 'vxe-switch' },
  { field: 'import', label: 'import', component: 'vxe-switch' },
  { field: 'export', label: 'export', component: 'vxe-switch' },
  { field: 'print', label: 'print', component: 'vxe-switch' },
  { field: 'zoom', label: 'zoom', component: 'vxe-switch' },
  { field: 'custom', label: 'custom', component: 'vxe-switch' },
  {
    field: 'slots',
    label: 'slots',
    component: 'lc-sub-form',
    props: {
      fields: [
        { field: 'buttons', label: 'buttons', component: 'vxe-input' },
        { field: 'tools', label: 'tools', component: 'vxe-input' },
      ],
    },
  },
];

const proxyConfigFields: LowCodeField[] = [
  { field: 'enabled', label: 'enabled', component: 'vxe-switch' },
  { field: 'autoLoad', label: 'autoLoad', component: 'vxe-switch' },
  { field: 'seq', label: 'seq', component: 'vxe-switch' },
  { field: 'sort', label: 'sort', component: 'vxe-switch' },
  { field: 'filter', label: 'filter', component: 'vxe-switch' },
  { field: 'form', label: 'form', component: 'vxe-switch' },
  {
    field: 'props',
    label: 'props',
    component: 'lc-sub-form',
    props: {
      fields: [
        { field: 'result', label: 'result', component: 'vxe-input', props: { placeholder: 'result' } },
        { field: 'total', label: 'total', component: 'vxe-input', props: { placeholder: 'total' } },
        { field: 'message', label: 'message', component: 'vxe-input', props: { placeholder: 'message' } },
      ],
    },
  },
  {
    field: 'ajax',
    label: 'ajax',
    component: 'lc-sub-form',
    props: {
      fields: [
        { field: 'query', label: 'query', component: 'vxe-input' },
        { field: 'queryAll', label: 'queryAll', component: 'vxe-input' },
        { field: 'save', label: 'save', component: 'vxe-input' },
        { field: 'delete', label: 'delete', component: 'vxe-input' },
      ],
    },
  },
];

const editConfigFields: LowCodeField[] = [
  { field: 'enabled', label: 'enabled', component: 'vxe-switch' },
  { field: 'mode', label: 'mode', component: 'vxe-select', options: editModeOptions },
  { field: 'trigger', label: 'trigger', component: 'vxe-select', options: triggerOptions },
  { field: 'showStatus', label: 'showStatus', component: 'vxe-switch' },
  { field: 'showIcon', label: 'showIcon', component: 'vxe-switch' },
  { field: 'autoClear', label: 'autoClear', component: 'vxe-switch' },
  { field: 'showUpdateStatus', label: 'showUpdateStatus', component: 'vxe-switch' },
  { field: 'showInsertStatus', label: 'showInsertStatus', component: 'vxe-switch' },
  { field: 'activeMethod', label: 'activeMethod', component: 'vxe-input' },
  { field: 'beforeEditMethod', label: 'beforeEditMethod', component: 'vxe-input' },
];

const checkboxConfigFields: LowCodeField[] = [
  { field: 'checkField', label: 'checkField', component: 'vxe-input' },
  { field: 'labelField', label: 'labelField', component: 'vxe-input' },
  { field: 'trigger', label: 'trigger', component: 'vxe-select', options: triggerOptions },
  { field: 'showHeader', label: 'showHeader', component: 'vxe-switch' },
  { field: 'reserve', label: 'reserve', component: 'vxe-switch' },
  { field: 'range', label: 'range', component: 'vxe-switch' },
  { field: 'highlight', label: 'highlight', component: 'vxe-switch' },
  { field: 'strict', label: 'strict', component: 'vxe-switch' },
  { field: 'checkStrictly', label: 'checkStrictly', component: 'vxe-switch' },
];

const radioConfigFields: LowCodeField[] = [
  { field: 'checkRowKey', label: 'checkRowKey', component: 'vxe-input' },
  { field: 'labelField', label: 'labelField', component: 'vxe-input' },
  { field: 'trigger', label: 'trigger', component: 'vxe-select', options: triggerOptions },
  { field: 'reserve', label: 'reserve', component: 'vxe-switch' },
  { field: 'highlight', label: 'highlight', component: 'vxe-switch' },
  { field: 'strict', label: 'strict', component: 'vxe-switch' },
];

const sortConfigFields: LowCodeField[] = [
  { field: 'remote', label: 'remote', component: 'vxe-switch' },
  { field: 'trigger', label: 'trigger', component: 'vxe-select', options: triggerOptions },
  { field: 'multiple', label: 'multiple', component: 'vxe-switch' },
  { field: 'chronological', label: 'chronological', component: 'vxe-switch' },
  {
    field: 'orders',
    label: 'orders',
    component: 'lc-array-table',
    props: { valueMode: 'primitive', valueField: 'value', valueTitle: 'order', addText: '新增' },
  },
  {
    field: 'defaultSort',
    label: 'defaultSort',
    component: 'lc-sub-form',
    props: {
      fields: [
        { field: 'field', label: 'field', component: 'vxe-input' },
        {
          field: 'order',
          label: 'order',
          component: 'vxe-select',
          options: [
            { label: 'asc', value: 'asc' },
            { label: 'desc', value: 'desc' },
          ],
        },
      ],
    },
  },
];

const filterConfigFields: LowCodeField[] = [
  { field: 'remote', label: 'remote', component: 'vxe-switch' },
  { field: 'showIcon', label: 'showIcon', component: 'vxe-switch' },
  { field: 'showFilterFooter', label: 'showFilterFooter', component: 'vxe-switch' },
  { field: 'filterMethod', label: 'filterMethod', component: 'vxe-input' },
];

const treeConfigFields: LowCodeField[] = [
  { field: 'transform', label: 'transform', component: 'vxe-switch' },
  { field: 'rowField', label: 'rowField', component: 'vxe-input', props: { placeholder: 'id' } },
  { field: 'parentField', label: 'parentField', component: 'vxe-input', props: { placeholder: 'parentId' } },
  { field: 'childrenField', label: 'childrenField', component: 'vxe-input', props: { placeholder: 'children' } },
  { field: 'hasChild', label: 'hasChild', component: 'vxe-input' },
  { field: 'indent', label: 'indent', component: 'lc-number-input' },
  { field: 'showIcon', label: 'showIcon', component: 'vxe-switch' },
  { field: 'expandAll', label: 'expandAll', component: 'vxe-switch' },
  { field: 'lazy', label: 'lazy', component: 'vxe-switch' },
  { field: 'accordion', label: 'accordion', component: 'vxe-switch' },
  { field: 'trigger', label: 'trigger', component: 'vxe-select', options: triggerOptions },
];

const expandConfigFields: LowCodeField[] = [
  { field: 'expandAll', label: 'expandAll', component: 'vxe-switch' },
  { field: 'accordion', label: 'accordion', component: 'vxe-switch' },
  { field: 'lazy', label: 'lazy', component: 'vxe-switch' },
  { field: 'trigger', label: 'trigger', component: 'vxe-select', options: triggerOptions },
  { field: 'labelField', label: 'labelField', component: 'vxe-input' },
  { field: 'iconOpen', label: 'iconOpen', component: 'vxe-input' },
  { field: 'iconClose', label: 'iconClose', component: 'vxe-input' },
  { field: 'visibleMethod', label: 'visibleMethod', component: 'vxe-input' },
];

const advancedGridConfigDefinitions: AdvancedGridConfigDefinition[] = [
  { field: 'pagerConfigJson', label: 'pagerConfig', fields: pagerConfigFields },
  { field: 'toolbarConfigJson', label: 'toolbarConfig', fields: toolbarConfigFields },
  { field: 'proxyConfigJson', label: 'proxyConfig', fields: proxyConfigFields },
  { field: 'editConfigJson', label: 'editConfig', fields: editConfigFields },
  { field: 'checkboxConfigJson', label: 'checkboxConfig', fields: checkboxConfigFields },
  { field: 'radioConfigJson', label: 'radioConfig', fields: radioConfigFields },
  { field: 'sortConfigJson', label: 'sortConfig', fields: sortConfigFields },
  { field: 'filterConfigJson', label: 'filterConfig', fields: filterConfigFields },
  { field: 'treeConfigJson', label: 'treeConfig', fields: treeConfigFields },
  { field: 'expandConfigJson', label: 'expandConfig', fields: expandConfigFields },
];

const columnAdvancedFormSections: Array<{ title: string; fields: LowCodeField[] }> = [
  {
    title: '尺寸与对齐',
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
    ],
  },
  {
    title: '显示行为',
    fields: [
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
    ],
  },
  {
    title: '筛选项',
    fields: [
      {
        field: 'filters',
        label: 'filters',
        component: 'lc-array-table',
        props: {
          addText: '新增筛选',
          rowKey: '__rowKey',
          defaultRow: {
            label: '筛选项',
            value: '',
            checked: false,
          },
          columns: [
            { field: 'label', title: 'label', minWidth: 110 },
            { field: 'value', title: 'value', minWidth: 110 },
            { field: 'checked', title: 'checked', component: 'vxe-switch', width: 86 },
          ],
        },
      },
    ],
  },
  {
    title: '渲染配置',
    fields: [
      {
        field: 'cellRender',
        label: 'cellRender',
        component: 'lc-sub-form',
        props: { fields: rendererObjectFields },
      },
      {
        field: 'editRender',
        label: 'editRender',
        component: 'lc-sub-form',
        props: { fields: rendererObjectFields },
      },
      {
        field: 'params',
        label: 'params',
        component: 'lc-sub-form',
        props: { fields: formatterObjectFields },
      },
    ],
  },
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
    formatter: isPlainRecord(row.formatter) ? cloneDeep(row.formatter) : readString(row.formatter),
    filters: Array.isArray(row.filters) ? cloneDeep(row.filters) : [],
    cellRender: isPlainRecord(row.cellRender) ? cloneDeep(row.cellRender) : {},
    editRender: isPlainRecord(row.editRender) ? cloneDeep(row.editRender) : {},
    params: isPlainRecord(row.params) ? cloneDeep(row.params) : {},
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
      return {
        field,
        label: field,
        component: 'lc-sub-form',
        props: { fields: inferObjectFields(currentValue) },
      };
    }

    if (Array.isArray(currentValue)) {
      const columns = inferArrayColumns(currentValue);
      return {
        field,
        label: field,
        component: 'lc-array-table',
        props: {
          addText: '新增',
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
  readonly?: boolean;
};

const directiveArrayColumns: ArrayEditorColumn[] = [
  { field: 'type', title: 'type', minWidth: 130, defaultValue: 'setDataSource' },
  { field: 'sourceKey', title: 'sourceKey', minWidth: 150 },
  { field: 'targetKey', title: 'targetKey', minWidth: 150 },
  { field: 'value', title: 'value', minWidth: 180 },
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
          addText: '新增',
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
  const title = readString(column.title, field || `列${index + 1}`);
  const type = readString(column.type);
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
      activeTab: 'columns',
      business: normalizeBusiness(props.option.business),
      columns: initialColumns,
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
        resetReactiveObject(state.advancedModels, createAdvancedFormModels(nextGridOptions.advanced));
        state.gridEvents = normalizeEvents(option.gridEvents);
        await methods.show();
      },
      show: async () => {
        await state.mounted;
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
              onClick: () =>
                handler.onConfirm()
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
            return false;
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
          schema: {
            fields: section.fields,
            actions: [],
          },
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
          onApply?.(column);
          selectColumn(column);
        },
      });
    };

    const createSchema = (fields: LowCodeField[], columns = 4): LowCodeFormSchema => ({
      columns,
      fields,
      actions: [],
    });

    const businessInfoSchema = createSchema([
      { field: 'blockId', label: 'blockId', component: 'vxe-input' },
      { field: 'title', label: 'title', component: 'vxe-input' },
      { field: 'sourceKey', label: 'sourceKey', component: 'vxe-input' },
      { field: 'serviceName', label: 'serviceName', component: 'vxe-input' },
      { field: 'serviceMethod', label: 'serviceMethod', component: 'vxe-input' },
      { field: 'saveMethod', label: 'saveMethod', component: 'vxe-input' },
      { field: 'deleteMethod', label: 'deleteMethod', component: 'vxe-input' },
      { field: 'showRowActions', label: 'showRowActions', component: 'vxe-switch' },
      {
        field: 'postDataJson',
        label: 'postDataJson',
        component: 'lc-json-editor',
        props: { rows: 4 },
      },
    ]);

    const gridOptionsSchema = createSchema([
      { field: 'id', label: 'id', component: 'vxe-input' },
      { field: 'size', label: 'size', component: 'vxe-select', options: sizeOptions },
      { field: 'height', label: 'height', component: 'vxe-input', props: { placeholder: 'auto / 480' } },
      { field: 'maxHeight', label: 'maxHeight', component: 'vxe-input' },
      { field: 'border', label: 'border', component: 'vxe-select', options: borderOptions as any },
      { field: 'stripe', label: 'stripe', component: 'vxe-switch' },
      { field: 'round', label: 'round', component: 'vxe-switch' },
      { field: 'showHeader', label: 'showHeader', component: 'vxe-switch' },
      { field: 'showFooter', label: 'showFooter', component: 'vxe-switch' },
      { field: 'showOverflow', label: 'showOverflow', component: 'vxe-select', options: overflowOptions as any },
      {
        field: 'showHeaderOverflow',
        label: 'showHeaderOverflow',
        component: 'vxe-select',
        options: overflowOptions as any,
      },
      { field: 'align', label: 'align', component: 'vxe-select', options: alignOptions },
      { field: 'headerAlign', label: 'headerAlign', component: 'vxe-select', options: alignOptions },
      { field: 'autoResize', label: 'autoResize', component: 'vxe-switch' },
      { field: 'keepSource', label: 'keepSource', component: 'vxe-switch' },
    ]);

    const rowConfigSubFields: LowCodeField[] = [
      { field: 'keyField', label: 'keyField', component: 'vxe-input' },
      { field: 'useKey', label: 'useKey', component: 'vxe-switch' },
      { field: 'isCurrent', label: 'isCurrent', component: 'vxe-switch' },
      { field: 'isHover', label: 'isHover', component: 'vxe-switch' },
      { field: 'resizable', label: 'resizable', component: 'vxe-switch' },
      { field: 'drag', label: 'drag', component: 'vxe-switch' },
    ];

    const columnConfigSubFields: LowCodeField[] = [
      { field: 'useKey', label: 'useKey', component: 'vxe-switch' },
      { field: 'resizable', label: 'resizable', component: 'vxe-switch' },
      { field: 'isCurrent', label: 'isCurrent', component: 'vxe-switch' },
      { field: 'isHover', label: 'isHover', component: 'vxe-switch' },
      { field: 'drag', label: 'drag', component: 'vxe-switch' },
      { field: 'minWidth', label: 'minWidth', component: 'vxe-input' },
    ];

    const rowColumnConfigSchema = createSchema(
      [
        {
          field: 'rowConfig',
          label: 'rowConfig',
          component: 'lc-sub-form',
          props: { fields: rowConfigSubFields },
        },
        {
          field: 'columnConfig',
          label: 'columnConfig',
          component: 'lc-sub-form',
          props: { fields: columnConfigSubFields },
        },
      ],
      2,
    );

    const syncAdvancedConfigModel = (
      field: string,
      value: Record<string, unknown>,
    ) => {
      const nextValue = isPlainRecord(value) ? cloneDeep(value) : {};
      (state.advancedModels as Record<string, Record<string, unknown>>)[field] = nextValue;
      state.advanced[field] = JSON.stringify(compactObject(cloneDeep(nextValue)), null, 2);
    };

    const toArrayTableOptions = (options: Array<{ label: string; value: unknown }>) =>
      options.map((option) =>
        typeof option.value === 'boolean'
          ? {
              label: option.label,
              value: String(option.value),
              rawValue: option.value,
            }
          : option,
      );

    const createColumnArrayDefaultRow = () => {
      const { __id, ...row } = createDefaultColumn(0);
      return {
        ...row,
        field: 'field_{{ index }}',
        title: '列 {{ index }}',
      };
    };

    const createColumnDesignerArrayColumns = (): ArrayEditorColumn[] => [
      { field: 'field', title: 'field', minWidth: 150 },
      { field: 'title', title: 'title', minWidth: 150 },
      {
        field: 'type',
        title: 'type',
        component: 'vxe-select',
        width: 132,
        options: toArrayTableOptions(columnTypeOptions),
      },
      { field: 'width', title: 'width', width: 108, props: { placeholder: 'auto' } },
      { field: 'minWidth', title: 'minWidth', width: 118 },
      {
        field: 'fixed',
        title: 'fixed',
        component: 'vxe-select',
        width: 116,
        options: toArrayTableOptions(fixedOptions),
      },
      {
        field: 'align',
        title: 'align',
        component: 'vxe-select',
        width: 124,
        options: toArrayTableOptions(alignOptions),
      },
      {
        field: 'sortable',
        title: 'sortable',
        component: 'vxe-switch',
        width: 96,
      },
      {
        field: 'visible',
        title: 'visible',
        component: 'vxe-switch',
        width: 92,
      },
      {
        field: 'showOverflow',
        title: 'showOverflow',
        component: 'vxe-select',
        width: 138,
        options: toArrayTableOptions(overflowOptions),
      },
      {
        field: 'formatter',
        title: 'formatter',
        minWidth: 210,
        props: {
          placeholder: '{"type":"text"} 或格式化器名',
          fields: formatterObjectFields,
        },
      },
    ];

    const createEventDesignerArrayColumns = (): ArrayEditorColumn[] => [
      {
        field: 'enabled',
        title: '启用',
        component: 'vxe-switch',
        width: 78,
      },
      { field: 'label', title: '事件说明', width: 130, readonly: true },
      { field: 'vxeName', title: 'VxeGrid 事件属性', width: 170, readonly: true },
      { field: 'nativeName', title: '原生事件名', width: 190, readonly: true },
      {
        field: 'eventName',
        title: '运行事件名 eventName',
        minWidth: 220,
        props: { placeholder: 'grid.rowDblclick' },
      },
      {
        field: 'directives',
        title: '指令',
        component: 'lc-json-editor',
        minWidth: 260,
        props: { rows: 3, placeholder: JSON.stringify([createArrayDefaultRow(directiveArrayColumns)], null, 2) },
      },
    ];

    const columnDesignerBlockId = 'grid-designer-columns-form';
    const businessInfoBlockId = 'grid-designer-business-info-form';
    const gridOptionsBlockId = 'grid-designer-grid-options-form';
    const rowColumnConfigBlockId = 'grid-designer-row-column-config-form';
    const eventDesignerBlockId = 'grid-designer-events-form';
    const extraPropsBlockId = 'grid-designer-extra-props-form';
    const advancedBlockId = (field: string) => `grid-designer-advanced-${field}-form`;

    const syncColumnsFromRows = (rows: unknown) => {
      const selectedId = state.selectedColumnId;
      state.columns = normalizeColumns(rows);

      if (!state.columns.some((column) => column.__id === selectedId)) {
        selectColumn(state.columns[0]);
      }
    };

    const syncEventsFromRows = (rows: unknown) => {
      state.gridEvents = normalizeEvents(rows);
    };

    const createColumnDesignerSchema = (): LowCodeFormSchema =>
      createSchema(
        [
          {
            field: 'columns',
            label: '列配置',
            component: 'lc-array-table',
            props: {
              addText: '新增列',
              rowKey: '__id',
              preserveRowKey: true,
              copyable: true,
              minRows: 1,
              actionWidth: 120,
              height: 520,
              toolbarAlign: 'left',
              columns: createColumnDesignerArrayColumns(),
              defaultRow: createColumnArrayDefaultRow(),
              onRowClick: ({ row }: { row: GridDesignerColumn }) => selectColumn(row),
              onRowDblclick: ({
                row,
                rows,
              }: {
                row: GridDesignerColumn;
                rows: GridDesignerColumn[];
              }) => {
                selectColumn(row);
                openColumnAdvancedDialog(row, () => syncColumnsFromRows(rows));
              },
            },
          },
        ],
        1,
      );

    const createEventDesignerSchema = (): LowCodeFormSchema =>
      createSchema(
        [
          {
            field: 'gridEvents',
            label: '事件配置',
            component: 'lc-array-table',
            props: {
              showToolbar: false,
              showActions: false,
              rowKey: 'key',
              preserveRowKey: true,
              height: 560,
              columns: createEventDesignerArrayColumns(),
            },
          },
        ],
        1,
      );

    const createFormBlock = (
      id: string,
      title: string,
      schema: LowCodeFormSchema,
      className = 'grid-designer-card grid-designer-schema-form-block',
    ): LowCodePageBlock => ({
      id,
      kind: 'form',
      title,
      className,
      schema,
    });

    const createContainerBlock = (
      id: string,
      className: unknown,
      blocks: LowCodePageBlock[],
      extra: Partial<LowCodePageBlock> = {},
    ): LowCodePageBlock =>
      ({
        id,
        kind: 'container',
        className,
        panel: false,
        blocks,
        ...extra,
      }) as LowCodePageBlock;

    const createColumnDesignerBlocks = (): LowCodePageBlock[] => [
      createContainerBlock('grid-designer-columns-panel', 'grid-designer-panel', [
        createFormBlock(
          columnDesignerBlockId,
          '列配置',
          createColumnDesignerSchema(),
          'grid-designer-array-table-card grid-designer-column-table-panel',
        ),
      ]),
    ];

    const normalizePostDataJsonField = (value: unknown) => {
      if (typeof value === 'string') return;

      const nextValue = isPlainRecord(value) ? compactObject(value) : {};
      state.business.postDataJson = JSON.stringify(nextValue, null, 2);
    };

    const createBaseInfoBlocks = (): LowCodePageBlock[] => [
      createContainerBlock('grid-designer-info-panel', 'grid-designer-panel', [
        createFormBlock(businessInfoBlockId, '业务信息', businessInfoSchema),
        createFormBlock(gridOptionsBlockId, 'VxeGrid 表格入参', gridOptionsSchema),
        createFormBlock(rowColumnConfigBlockId, 'rowConfig / columnConfig', rowColumnConfigSchema),
        createContainerBlock(
          'grid-designer-advanced-panel',
          'grid-designer-advanced-grid',
          [
            ...advancedGridConfigDefinitions.map((config) =>
              createFormBlock(
                advancedBlockId(config.field),
                config.label,
                createSchema(config.fields, 2),
                'grid-designer-advanced-item grid-designer-schema-form-block',
              ),
            ),
            createFormBlock(
              extraPropsBlockId,
              'extraProps',
              createSchema(
                [
                  {
                    field: 'value',
                    label: 'extraProps',
                    component: 'lc-json-editor',
                    props: { rows: 5 },
                  },
                ],
                1,
              ),
              'grid-designer-advanced-item grid-designer-advanced-item--wide grid-designer-schema-form-block',
            ),
          ],
        ),
      ]),
    ];

    const createEventDesignerBlocks = (): LowCodePageBlock[] => [
      createContainerBlock('grid-designer-events-panel', 'grid-designer-panel', [
        createFormBlock(
          eventDesignerBlockId,
          '事件配置',
          createEventDesignerSchema(),
          'grid-designer-array-table-card',
        ),
      ]),
    ];

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

      return {
        [columnDesignerBlockId]: {
          columns: state.columns as unknown as Record<string, unknown>[],
        },
        [businessInfoBlockId]: createSchemaModel(
          businessInfoSchema,
          state.business as unknown as Record<string, unknown>,
        ),
        [gridOptionsBlockId]: createSchemaModel(
          gridOptionsSchema,
          state.gridOptions as Record<string, unknown>,
        ),
        [rowColumnConfigBlockId]: createSchemaModel(
          rowColumnConfigSchema,
          state.gridOptions as Record<string, unknown>,
        ),
        [eventDesignerBlockId]: {
          gridEvents: state.gridEvents as unknown as Record<string, unknown>[],
        },
        ...advancedGridConfigDefinitions.reduce<Record<string, Record<string, unknown>>>(
          (models, config) => {
            models[advancedBlockId(config.field)] = advancedModels[config.field] ?? {};
            return models;
          },
          {},
        ),
        [extraPropsBlockId]: {
          value: advancedModels.extraPropsJson ?? {},
        },
      };
    };

    const readRuntimeFormValues = (event: LowCodeRuntimeEvent) =>
      isPlainRecord(event.payload) && isPlainRecord(event.payload.values)
        ? event.payload.values
        : null;

    const syncGridDesignerRuntimeEvent = (event: LowCodeRuntimeEvent) => {
      if (event.name !== 'form.fieldChange') return;

      const values = readRuntimeFormValues(event);
      if (!values) return;

      if (event.blockId === columnDesignerBlockId) {
        syncColumnsFromRows(values.columns);
        return;
      }

      if (event.blockId === eventDesignerBlockId) {
        syncEventsFromRows(values.gridEvents);
        return;
      }

      if (event.blockId === businessInfoBlockId) {
        Object.assign(state.business, values);
        if (event.payload?.field === 'postDataJson') {
          normalizePostDataJsonField(event.payload.value);
        }
        return;
      }

      if (event.blockId === gridOptionsBlockId || event.blockId === rowColumnConfigBlockId) {
        Object.assign(state.gridOptions, values);
        return;
      }

      const advancedConfig = advancedGridConfigDefinitions.find(
        (config) => event.blockId === advancedBlockId(config.field),
      );

      if (advancedConfig) {
        syncAdvancedConfigModel(advancedConfig.field, values);
        return;
      }

      if (event.blockId === extraPropsBlockId) {
        syncAdvancedConfigModel(
          'extraPropsJson',
          isPlainRecord(values.value) ? values.value : {},
        );
      }
    };

    const createGridDesignerDialogBlocks = (): LowCodePageBlock[] => [
      createContainerBlock('grid-designer-workbench', 'grid-designer-workbench', [
        {
          id: 'grid-designer-tabs',
          kind: 'tabs',
          className: 'grid-designer-tabs',
          defaultKey: state.activeTab,
          layout: { fillRemaining: true },
          tabs: [
            {
              key: 'columns',
              label: '列设计',
              blocks: createColumnDesignerBlocks(),
            },
            {
              key: 'info',
              label: '表格信息设计',
              blocks: createBaseInfoBlocks(),
            },
            {
              key: 'events',
              label: '事件属性',
              blocks: createEventDesignerBlocks(),
            },
          ],
        },
      ]),
    ];

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
          formModels: createGridDesignerFormModels(),
          onRuntimeEvent: syncGridDesignerRuntimeEvent,
        },
      },
    ];

    return () => null;
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
