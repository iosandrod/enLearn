import { resolveComponent } from 'vue';
import { Field } from '../../../components/LegacyWidgets';
import {
  mergeSystemTableOptions,
  resolveSystemTableConfig,
  useSystemSettings,
} from '../../../core/system-settings';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export const defaultArrayTableColumns: Record<string, unknown>[] = [
  { field: 'name', title: 'Name', minWidth: 120, placeholder: 'Enter name', defaultValue: '' },
  { field: 'quantity', title: 'Quantity', width: 88, placeholder: '0', defaultValue: '' },
  { field: 'remark', title: 'Remark', minWidth: 140, placeholder: 'Remark', defaultValue: '' },
];

const defaultArrayTableData: Record<string, unknown>[] = [
  { name: 'Item A', quantity: 1, remark: 'Example' },
  { name: 'Item B', quantity: 2, remark: 'Example' },
];

const vxeGridPropKeys = [
  'border', 'stripe', 'showOverflow', 'showHeaderOverflow', 'showFooterOverflow',
  'height', 'minHeight', 'maxHeight', 'rowHeight', 'headerHeight', 'headerRowHeight',
  'footerHeight', 'footerRowHeight', 'size', 'round', 'showHeader', 'showFooter',
  'cellConfig', 'headerCellConfig', 'footerCellConfig', 'rowConfig', 'columnConfig',
  'sortConfig', 'filterConfig', 'editConfig', 'checkboxConfig', 'radioConfig',
  'treeConfig', 'expandConfig', 'tooltipConfig', 'virtualXConfig', 'virtualYConfig',
] as const;

const fieldPropExcludeKeys = new Set<string>([
  ...vxeGridPropKeys, 'columns', 'data', 'gridOptions', 'rowConfig.keyField', 'rowKey',
  'defaultRow', 'toolbarButtons', 'showToolbar', 'showActions', 'toolbarAlign', 'copyable',
  'movable', 'removable', 'preserveRowKey', 'minRows', 'actionWidth', 'valueMode',
  'valueField', 'valueTitle',
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
  const nextOptions: Record<string, unknown> = isRecord(props.gridOptions) ? { ...props.gridOptions } : {};
  vxeGridPropKeys.forEach((key) => {
    if (typeof props[key] !== 'undefined') nextOptions[key] = props[key];
  });
  return nextOptions;
}

function createPreviewData(columns: Record<string, unknown>[]) {
  return defaultArrayTableData.map((row, rowIndex) => {
    const nextRow: Record<string, unknown> = {};
    columns.forEach((column, columnIndex) => {
      const field = String(column.field || `field${columnIndex + 1}`);
      nextRow[field] = row[field] ?? column.defaultValue ??
        (typeof column.placeholder === 'string' ? column.placeholder : `Row ${rowIndex + 1}`);
    });
    return nextRow;
  });
}

function createArrayTableGridProps(
  props: Record<string, unknown>,
  preview = false,
  systemTableConfig = resolveSystemTableConfig(),
) {
  const options = mergeSystemTableOptions(pickVxeGridOptions(props), systemTableConfig);
  const dataColumns = normalizeRows(props.columns ?? options.columns, defaultArrayTableColumns);
  const data = normalizeRows(props.data ?? props.modelValue, createPreviewData(dataColumns));
  const configuredRowConfig = isRecord(options.rowConfig) ? options.rowConfig : {};
  const rowKey = String(configuredRowConfig.keyField || props.rowKey || '__rowKey');

  return {
    border: true,
    stripe: false,
    showOverflow: true,
    size: 'mini' as const,
    ...options,
    height: options.height ?? (preview ? 128 : 160),
    rowConfig: { ...configuredRowConfig, keyField: rowKey },
    columns: [{ type: 'seq', width: 42, fixed: 'left' }, ...dataColumns],
    data,
  };
}

function renderVxeGrid(
  props: Record<string, unknown>,
  preview = false,
  systemTableConfig = resolveSystemTableConfig(),
) {
  const VxeGrid = resolveComponent('vxe-grid') as any;
  return <VxeGrid {...createArrayTableGridProps(props, preview, systemTableConfig)} />;
}

function renderTablePreview() {
  return (
    <div style={{ width: '100%', overflow: 'hidden', border: '1px solid #dbe3ec', borderRadius: '5px', background: '#fff' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr', background: '#f3f6fa' }}>
        {['名称', '数量', '备注'].map((title) => (
          <strong style={{ padding: '7px 8px', borderRight: '1px solid #dbe3ec', fontSize: '12px' }}>{title}</strong>
        ))}
      </div>
      {[['物料 A', '1', '示例'], ['物料 B', '2', '示例']].map((row) => (
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr 1fr', borderTop: '1px solid #e8edf3' }}>
          {row.map((value) => (
            <span style={{ padding: '6px 8px', borderRight: '1px solid #e8edf3', color: '#475569', fontSize: '12px' }}>{value}</span>
          ))}
        </div>
      ))}
    </div>
  );
}

function createRuntimeFieldProps(props: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(props).filter(([key]) => !fieldPropExcludeKeys.has(key)));
}

export default {
  key: 'array-table',
  moduleName: 'baseWidgets',
  label: '表单项类型 - 表格',
  preview: () => (
    <div style={{ display: 'grid', width: '220px', gap: '8px', minHeight: '128px' }}>
      <div style={{ color: '#475569', fontSize: '13px' }}>表格输入</div>
      {renderTablePreview()}
    </div>
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    const systemSettings = useSystemSettings();
    return () => (
      <div style={{ ...styles, width: '100%', minHeight: '150px' }}>
        <Field
          {...createRuntimeFieldProps(props)}
          modelValue=""
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{ input: () => (
            <div ref={(el) => registerRef(el, block._vid)} style={{ width: '100%', minWidth: 0 }}>
              {renderVxeGrid(props, false, resolveSystemTableConfig(systemSettings))}
            </div>
          ) }}
        />
      </div>
    );
  },
  events: [{ label: 'Table data changed', value: 'update:model-value' }],
  resize: { width: true },
  model: { default: '绑定字段' },
} as VisualEditorComponent;
