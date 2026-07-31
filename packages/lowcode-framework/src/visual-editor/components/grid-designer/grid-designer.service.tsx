import {
  createApp,
  defineComponent,
  getCurrentInstance,
  h,
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
import { ArrowDown, ArrowUp, CopyDocument, Delete, Plus } from '../common/remix-icons';
import { cloneDeep } from 'lodash-es';
import LowCodeForm from '../../../components/LowCodeForm.vue';
import {
  findGlobalDialog,
  openGlobalDialog,
  type GlobalDialogContentNode,
} from '../../../runtime/global-dialog';
import type {
  LowCodeField,
  LowCodeFormSchema,
  LowCodeRuntimeDirective,
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

function formatArraySummary(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  return `${items.length} 项`;
}

function formatObjectSummary(value: unknown) {
  if (!isPlainRecord(value)) return '{}';
  if (!Object.keys(value).length) return '{}';

  try {
    return JSON.stringify(value);
  } catch {
    return '[object]';
  }
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
      showFlag: false,
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
        state.showFlag = true;
        await nextTick();
      },
      hide: () => {
        state.showFlag = false;
      },
    };

    const selectColumn = (column: GridDesignerColumn) => {
      state.selectedColumnId = readString(column.__id);
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

    const openSchemaDialog = <TValues extends Record<string, unknown>>(
      config: {
        id: string;
        title: string;
        model: TValues;
        width?: string | number;
        height?: string | number;
        className?: unknown;
        schema?: LowCodeFormSchema;
        content?: GlobalDialogContentNode | GlobalDialogContentNode[];
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

    const openObjectEditor = (
      title: string,
      value: unknown,
      fields: LowCodeField[] | undefined,
      onConfirm: (value: Record<string, unknown>) => void,
    ) => {
      const model = isPlainRecord(value) ? cloneDeep(value) : {};
      openSchemaDialog({
        id: `grid-designer-object-${generateNanoid()}`,
        title,
        width: 'min(720px, calc(100vw - 48px))',
        className: 'grid-designer-object-dialog',
        model,
        schema: createObjectSchema(model, fields),
        onConfirm,
      });
    };

    const openArrayEditor = (
      title: string,
      value: unknown,
      columns: ArrayEditorColumn[] | undefined,
      onConfirm: (value: unknown[]) => void,
    ) => {
      const items = Array.isArray(value) ? cloneDeep(value) : [];
      openSchemaDialog({
        id: `grid-designer-array-${generateNanoid()}`,
        title,
        width: 'min(840px, calc(100vw - 48px))',
        className: 'grid-designer-object-dialog',
        model: { items },
        schema: createArraySchema(items, columns),
        onConfirm: (nextValue) => {
          onConfirm(Array.isArray(nextValue.items) ? cloneDeep(nextValue.items) : []);
        },
      });
    };

    const createColumnAdvancedDialogContent = (
      column: GridDesignerColumn,
    ): GlobalDialogContentNode => ({
      type: 'container',
      className: 'grid-designer-column-dialog__content',
      style: {
        display: 'grid',
        gap: '12px',
        maxHeight: 'calc(80vh - 160px)',
        overflow: 'auto',
        paddingRight: '4px',
      },
      children: columnAdvancedFormSections.map((section, index) => ({
        type: 'container',
        key: `${readString(column.__id, 'column')}-section-${index}`,
        className: 'grid-designer-column-dialog__section',
        children: [
          {
            type: 'render',
            key: `${readString(column.__id, 'column')}-section-title-${index}`,
            render: () =>
              h('div', { class: 'grid-designer-column-dialog__section-title' }, section.title),
          },
          {
            type: 'form',
            key: `${readString(column.__id, 'column')}-section-form-${index}`,
            form: {
              schema: {
                fields: section.fields,
                actions: [],
              },
            },
          },
        ],
      })),
    });

    const openColumnAdvancedDialog = (column: GridDesignerColumn) => {
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
          selectColumn(column);
        },
      });
    };

    const renderObjectBoundInput = (
      row: Record<string, unknown>,
      field: string,
      title: string,
      placeholder: string,
      fields?: LowCodeField[],
    ) => {
      const value = row[field];

      if (!isPlainRecord(value)) {
        return (
          <ElInput
            modelValue={readString(value)}
            placeholder={placeholder}
            {...({
              'onUpdate:modelValue': (nextValue: unknown) => {
                row[field] = nextValue;
              },
            } as any)}
          />
        );
      }

      return (
        <div class="grid-designer-object-cell">
          <ElInput modelValue={formatObjectSummary(value)} placeholder={placeholder} readonly />
          <ElButton
            text
            type="primary"
            onClick={(event?: Event) => {
              event?.stopPropagation?.();
              openObjectEditor(title, value, fields, (nextValue) => {
                row[field] = cloneDeep(nextValue);
              });
            }}
          >
            编辑
          </ElButton>
        </div>
      );
    };

    const renderArrayEditorInput = (
      row: Record<string, unknown>,
      field: string,
      title: string,
      columns?: ArrayEditorColumn[],
    ) => (
      <div class="grid-designer-object-cell">
        <ElInput modelValue={formatArraySummary(row[field])} readonly />
        <ElButton
          text
          type="primary"
          onClick={(event?: Event) => {
            event?.stopPropagation?.();
            openArrayEditor(title, row[field], columns, (nextValue) => {
              row[field] = nextValue;
            });
          }}
        >
          编辑
        </ElButton>
      </div>
    );

    const syncAdvancedConfigModel = (
      field: string,
      value: Record<string, unknown>,
    ) => {
      const nextValue = isPlainRecord(value) ? cloneDeep(value) : {};
      (state.advancedModels as Record<string, Record<string, unknown>>)[field] = nextValue;
      state.advanced[field] = JSON.stringify(compactObject(cloneDeep(nextValue)), null, 2);
    };

    const renderAdvancedConfigEditor = (config: AdvancedGridConfigDefinition) => {
      const model =
        (state.advancedModels as Record<string, Record<string, unknown>>)[config.field] ?? {};

      return (
        <section key={config.field} class="grid-designer-advanced-item">
          <div class="grid-designer-advanced-item__header">
            <strong>{config.label}</strong>
          </div>
          <LowCodeForm
            class="grid-designer-advanced-sub-form"
            schema={{ fields: config.fields, actions: [] }}
            modelValue={model}
            onUpdate:modelValue={(value: Record<string, unknown>) => {
              syncAdvancedConfigModel(config.field, value);
            }}
          />
        </section>
      );
    };

    const renderExtraPropsEditor = () => {
      const model =
        (state.advancedModels as Record<string, Record<string, unknown>>).extraPropsJson ?? {};

      return (
        <section class="grid-designer-advanced-item grid-designer-advanced-item--wide">
          <div class="grid-designer-advanced-item__header">
            <strong>extraProps</strong>
          </div>
          <div class="grid-designer-object-cell">
            <ElInput modelValue={formatObjectSummary(model)} readonly />
            <ElButton
              text
              type="primary"
              onClick={() => {
                openObjectEditor('extraProps', model, undefined, (nextValue) => {
                  syncAdvancedConfigModel('extraPropsJson', nextValue);
                });
              }}
            >
              编辑
            </ElButton>
          </div>
        </section>
      );
    };

    const renderBusinessPostDataEditor = () => (
      <div class="grid-designer-object-cell">
        <ElInput modelValue={readString(state.business.postDataJson, '{}')} readonly />
        <ElButton
          text
          type="primary"
          onClick={() => {
            const parsed = parseJsonObject(state.business.postDataJson, 'postDataJson');

            if (parsed.ok === false) {
              ElMessage.error(parsed.message);
              return;
            }

            const value = isPlainRecord(parsed.value) ? parsed.value : {};
            openObjectEditor('postDataJson', value, undefined, (nextValue) => {
              state.business.postDataJson = JSON.stringify(compactObject(nextValue), null, 2);
            });
          }}
        >
          编辑
        </ElButton>
      </div>
    );

    const renderColumnToolbar = () => (
      <div class="grid-designer-column-toolbar">
        <div class="grid-designer-column-toolbar__meta">
          <strong>列配置</strong>
          <span>{state.columns.length} 列</span>
        </div>
        <ElButton type="primary" icon={Plus} onClick={columnActions.add}>
          新增列
        </ElButton>
      </div>
    );

    const renderColumnRowActions = (index: number) => (
      <div class="grid-designer-row-actions">
        <span title="上移">
          <ElButton
            circle
            text
            type="primary"
            icon={ArrowUp}
            disabled={index <= 0}
            onClick={() => columnActions.move(index, -1)}
          />
        </span>
        <span title="下移">
          <ElButton
            circle
            text
            type="primary"
            icon={ArrowDown}
            disabled={index >= state.columns.length - 1}
            onClick={() => columnActions.move(index, 1)}
          />
        </span>
        <span title="复制">
          <ElButton
            circle
            text
            type="primary"
            icon={CopyDocument}
            onClick={() => columnActions.copy(index)}
          />
        </span>
        <span title="删除">
          <ElButton
            circle
            text
            type="danger"
            icon={Delete}
            disabled={state.columns.length <= 1}
            onClick={() => columnActions.remove(index)}
          />
        </span>
      </div>
    );

    const renderColumnDesignerWorkbench = () => {
      return (
        <div class="grid-designer-panel">
          <div class="grid-designer-column-layout">
            <section class="grid-designer-column-table-panel">
              {renderColumnToolbar()}
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
                  onRowDblclick: ({ row }: { row: GridDesignerColumn }) => {
                    selectColumn(row);
                    openColumnAdvancedDialog(row);
                  },
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
                      renderObjectBoundInput(
                        row,
                        'formatter',
                        `${readString(row.title, readString(row.field, '列'))} formatter`,
                        '{"type":"text"} 或格式化器名',
                        formatterObjectFields,
                      )
                    ),
                  }}
                </ElTableColumn>
                <ElTableColumn label="操作" width={144} align="center">
                  {{
                    default: ({ $index }: { $index: number }) => renderColumnRowActions($index),
                  }}
                </ElTableColumn>
              </ElTable>
            </section>

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
              {renderBusinessPostDataEditor()}
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
          <div class="grid-designer-advanced-grid">
            {advancedGridConfigDefinitions.map(renderAdvancedConfigEditor)}
            {renderExtraPropsEditor()}
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
          <ElTableColumn label="指令" minWidth={220}>
            {{
              default: ({ row }: { row: GridDesignerEvent }) => (
                renderArrayEditorInput(
                  row as unknown as Record<string, unknown>,
                  'directives',
                  `${row.vxeName} 指令`,
                  directiveArrayColumns,
                )
              ),
            }}
          </ElTableColumn>
        </ElTable>
      </div>
    );

    return () => (
      <>
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

      </>
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
