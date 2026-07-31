import { resolveComponent } from 'vue';
import { Field } from '../../../components/VantFree';
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
    title: '鍚嶇О',
    minWidth: 120,
    placeholder: '璇疯緭鍏ュ悕绉?,
    defaultValue: '',
  },
  {
    field: 'quantity',
    title: '鏁伴噺',
    width: 88,
    placeholder: '0',
    defaultValue: '',
  },
  {
    field: 'remark',
    title: '澶囨敞',
    minWidth: 140,
    placeholder: '澶囨敞',
    defaultValue: '',
  },
];

const defaultArrayTableData: Record<string, unknown>[] = [
  { name: '椤圭洰 A', quantity: 1, remark: '绀轰緥' },
  { name: '椤圭洰 B', quantity: 2, remark: '绀轰緥' },
];

const formComponentOptions = [
  { label: '杈撳叆妗?, value: 'vxe-input' },
  { label: '澶氳鏂囨湰', value: 'vxe-textarea' },
  { label: '涓嬫媺閫夋嫨', value: 'vxe-select' },
  { label: '寮€鍏?, value: 'vxe-switch' },
  { label: '瀵嗙爜妗?, value: 'vxe-password-input' },
  { label: '鏁板瓧杈撳叆', value: 'lc-number-input' },
  { label: 'JSON 缂栬緫鍣?, value: 'lc-json-editor' },
];

const gridOverflowOptions = [
  { label: '榛樿', value: '' },
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
  { label: '榛樿', value: '' },
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
  'addText',
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
  label: '琛ㄥ崟椤圭被鍨?- 琛ㄦ牸',
  preview: () => (
    <div
      style={{
        display: 'grid',
        width: '220px',
        gap: '8px',
      }}
    >
      <div style={{ color: '#475569', fontSize: '13px' }}>琛ㄦ牸杈撳叆</div>
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
      label: '榛樿鍊?,
      defaultValue: [],
    }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: '杈撳叆妗嗗乏渚ф枃鏈?, defaultValue: '琛ㄦ牸杈撳叆' }),
    __formSpan: createEditorInputNumberProp({
      label: '琛ㄥ崟璺ㄥ垪',
      defaultValue: 1,
      min: 1,
      max: 6,
    }),
    __formHelp: createEditorInputProp({
      label: '甯姪鏂囨湰',
      defaultValue: '',
    }),
    addText: createEditorInputProp({
      label: '鏂板鎸夐挳鏂囨',
      defaultValue: '鏂板琛?,
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
          { label: '瀛楁', field: 'field' },
          { label: '鏍囬', field: 'title' },
          {
            label: '缁勪欢',
            field: 'component',
            component: 'vxe-select',
            minWidth: 132,
            options: formComponentOptions,
          },
          { label: '瀹藉害', field: 'width' },
          { label: '鏈€灏忓搴?, field: 'minWidth' },
          { label: '鍗犱綅鎻愮ず', field: 'placeholder' },
          { label: '榛樿鍊?, field: 'defaultValue' },
          {
            label: '閫夐」 JSON',
            field: 'optionsJson',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '[{"label":"A","value":"a"}]',
          },
          {
            label: '灞炴€?JSON',
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
  events: [{ label: '琛ㄦ牸鏁版嵁鍙樺寲鏃惰Е鍙?, value: 'update:model-value' }],
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
