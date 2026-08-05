import { resolveComponent } from 'vue';
import { Field } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputNumberProp,
  createEditorInputProp,
  createEditorModelBindProp,
  createEditorSelectProp,
  createEditorSwitchProp,
  createEditorTableProp,
} from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export const defaultArrayTableColumns: Record<string, unknown>[] = [
  {
    field: 'name',
    title: 'Name',
    minWidth: 120,
    placeholder: 'Enter name',
    defaultValue: '',
  },
  {
    field: 'quantity',
    title: 'Quantity',
    width: 88,
    placeholder: '0',
    defaultValue: '',
  },
  {
    field: 'remark',
    title: 'Remark',
    minWidth: 140,
    placeholder: 'Remark',
    defaultValue: '',
  },
];

const defaultArrayTableData: Record<string, unknown>[] = [
  { name: 'Item A', quantity: 1, remark: 'Example' },
  { name: 'Item B', quantity: 2, remark: 'Example' },
];

const formComponentOptions = [
  { label: 'Input', value: 'vxe-input' },
  { label: 'Textarea', value: 'vxe-textarea' },
  { label: 'Select', value: 'vxe-select' },
  { label: 'Switch', value: 'vxe-switch' },
  { label: 'Password', value: 'vxe-password-input' },
  { label: 'Number', value: 'lc-number-input' },
  { label: 'JSON Editor', value: 'lc-json-editor' },
];

const gridOverflowOptions = [
  { label: '默认', value: '' },
  { label: 'true', value: true },
  { label: 'false', value: false },
  { label: 'ellipsis', value: 'ellipsis' },
  { label: 'title', value: 'title' },
  { label: 'tooltip', value: 'tooltip' },
];

const gridBorderOptions = [
  { label: 'true', value: true },
  { label: 'false', value: false },
  { label: 'default', value: 'default' },
  { label: 'full', value: 'full' },
  { label: 'outer', value: 'outer' },
  { label: 'inner', value: 'inner' },
  { label: 'none', value: 'none' },
];

const gridSizeOptions = [
  { label: '默认', value: '' },
  { label: 'medium', value: 'medium' },
  { label: 'small', value: 'small' },
  { label: 'mini', value: 'mini' },
];

const vxeGridPropKeys = [
  'border',
  'stripe',
  'showOverflow',
  'showHeaderOverflow',
  'showFooterOverflow',
  'height',
  'maxHeight',
  'size',
  'round',
  'showHeader',
  'rowConfig',
  'columnConfig',
  'sortConfig',
  'filterConfig',
  'editConfig',
  'checkboxConfig',
  'radioConfig',
  'treeConfig',
  'expandConfig',
] as const;

const fieldPropExcludeKeys = new Set<string>([
  ...vxeGridPropKeys,
  'columns',
  'data',
  'gridOptions',
  'rowConfig.keyField',
  'rowKey',
  'defaultRow',
  'toolbarButtons',
  'showToolbar',
  'showActions',
  'toolbarAlign',
  'copyable',
  'movable',
  'removable',
  'preserveRowKey',
  'minRows',
  'actionWidth',
  'valueMode',
  'valueField',
  'valueTitle',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRows(value: unknown, fallback: Record<string, unknown>[]) {
  return Array.isArray(value) && value.length
    ? (value.filter(isRecord) as Record<string, unknown>[])
    : fallback;
}

function pickVxeGridOptions(props: Record<string, unknown>) {
  const legacyOptions = isRecord(props.gridOptions) ? props.gridOptions : {};
  const nextOptions: Record<string, unknown> = { ...legacyOptions };

  vxeGridPropKeys.forEach((key) => {
    if (typeof props[key] !== 'undefined') {
      nextOptions[key] = props[key];
    }
  });

  return nextOptions;
}

function createPreviewData(columns: Record<string, unknown>[]) {
  return defaultArrayTableData.map((row, rowIndex) => {
    const nextRow: Record<string, unknown> = {};
    columns.forEach((column, columnIndex) => {
      const field = String(column.field || `field${columnIndex + 1}`);
      nextRow[field] =
        row[field] ??
        column.defaultValue ??
        (typeof column.placeholder === 'string' ? column.placeholder : `Row ${rowIndex + 1}`);
    });
    return nextRow;
  });
}

function createArrayTableGridProps(props: Record<string, unknown>, preview = false) {
  const options = pickVxeGridOptions(props);
  const dataColumns = normalizeRows(props.columns ?? options.columns, defaultArrayTableColumns);
  const data = normalizeRows(props.data ?? props.modelValue, createPreviewData(dataColumns));
  const configuredRowConfig = isRecord(options.rowConfig) ? options.rowConfig : {};
  const rowKey = String(configuredRowConfig.keyField || props.rowKey || '__rowKey');
  const columns = [
    { type: 'seq', width: 42, fixed: 'left' },
    ...dataColumns,
  ];

  return {
    border: true,
    stripe: false,
    showOverflow: true,
    size: 'mini',
    ...options,
    height: options.height ?? (preview ? 128 : 160),
    rowConfig: {
      ...configuredRowConfig,
      keyField: rowKey,
    },
    columns,
    data,
  };
}

function renderVxeGrid(props: Record<string, unknown>, preview = false) {
  const VxeGrid = resolveComponent('vxe-grid') as any;
  return <VxeGrid {...createArrayTableGridProps(props, preview)} />;
}

function createFieldProps(props: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(props).filter(([key]) => !fieldPropExcludeKeys.has(key))
  );
}

export default {
  key: 'array-table',
  moduleName: 'baseWidgets',
  label: '表单项类型 - 表格',
  preview: () => (
    <div
      style={{
        display: 'grid',
        width: '220px',
        gap: '8px',
      }}
    >
      <div style={{ color: '#475569', fontSize: '13px' }}>表格输入</div>
      <div style={{ height: '128px' }}>
        {renderVxeGrid(
          {
            columns: defaultArrayTableColumns,
            data: defaultArrayTableData,
            height: 128,
          },
          true
        )}
      </div>
    </div>
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();

    return () => (
      <div style={{ ...styles, width: '100%' }}>
        <Field
          {...createFieldProps(props)}
          modelValue=""
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{
            input: () => (
              <div
                ref={(el) => registerRef(el, block._vid)}
                style={{
                  display: 'grid',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                {renderVxeGrid(props)}
              </div>
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputProp({
      label: 'Default value',
      defaultValue: [],
    }),
    name: createEditorModelBindProp({ label: '字段绑定', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Array table' }),
    __formSpan: createEditorInputNumberProp({
      label: '表单跨列',
      defaultValue: 1,
      min: 1,
      max: 6,
    }),
    __formHelp: createEditorInputProp({
      label: '帮助文本',
      defaultValue: '',
    }),
    'rowConfig.keyField': createEditorInputProp({
      label: 'rowConfig.keyField',
      defaultValue: '__rowKey',
    }),
    border: createEditorSelectProp({
      label: 'VxeGrid border',
      options: gridBorderOptions,
      defaultValue: true,
    }),
    stripe: createEditorSwitchProp({
      label: 'VxeGrid stripe',
      defaultValue: false,
    }),
    showOverflow: createEditorSelectProp({
      label: 'VxeGrid showOverflow',
      options: gridOverflowOptions,
      defaultValue: true,
    }),
    height: createEditorInputProp({
      label: 'VxeGrid height',
      defaultValue: 160,
    }),
    size: createEditorSelectProp({
      label: 'VxeGrid size',
      options: gridSizeOptions,
      defaultValue: 'mini',
    }),
    columns: createEditorTableProp({
      label: 'VxeGrid columns',
      option: {
        showKey: 'title',
        options: [
          { label: '字段', field: 'field' },
          { label: '标题', field: 'title' },
          {
            label: '组件',
            field: 'component',
            component: 'vxe-select',
            minWidth: 132,
            options: formComponentOptions,
          },
          { label: '宽度', field: 'width' },
          { label: 'Min width', field: 'minWidth' },
          { label: '占位提示', field: 'placeholder' },
          { label: 'Default value', field: 'defaultValue' },
          {
            label: '选项 JSON',
            field: 'optionsJson',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '[{"label":"A","value":"a"}]',
          },
          {
            label: '属性 JSON',
            field: 'propsJson',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '{"clearable":true}',
          },
        ],
      },
      defaultValue: defaultArrayTableColumns,
    }),
    data: createEditorTableProp({
      label: 'VxeGrid data',
      option: {
        showKey: 'name',
        options: [
          { label: 'name', field: 'name' },
          { label: 'quantity', field: 'quantity' },
          { label: 'remark', field: 'remark' },
        ],
      },
      defaultValue: defaultArrayTableData,
    }),
  },
  events: [{ label: 'Table data changed', value: 'update:model-value' }],
  resize: {
    width: true,
  },
  model: {
    default: '绑定字段',
  },
} as VisualEditorComponent;
