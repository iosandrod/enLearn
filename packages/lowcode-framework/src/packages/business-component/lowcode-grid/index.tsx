import { resolveComponent } from 'vue';
import {
  mergeSystemTableOptions,
  resolveSystemTableConfig,
  useSystemSettings,
} from '../../../core/system-settings';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { normalizeLowCodeGridColumns } from '../../../utils/lowcode';
import type { LowCodeGridColumn } from '../../../types/lowcode';

const defaultColumns: Record<string, unknown>[] = [
  { field: 'email', title: '邮箱', minWidth: 220 },
  { field: 'full_name', title: '姓名', minWidth: 160 },
  { field: 'role', title: '角色', minWidth: 120 },
];

const defaultData: Record<string, unknown>[] = [
  { email: 'alice@example.com', full_name: 'Alice', role: '学生' },
  { email: 'bob@example.com', full_name: 'Bob', role: '老师' },
];

const vxeGridPropKeys = [
  'border', 'stripe', 'showOverflow', 'showHeaderOverflow', 'showFooterOverflow',
  'height', 'minHeight', 'maxHeight', 'rowHeight', 'headerHeight', 'headerRowHeight',
  'footerHeight', 'footerRowHeight', 'size', 'loading', 'round', 'showHeader',
  'showFooter', 'autoResize', 'syncResize', 'cellConfig', 'headerCellConfig',
  'footerCellConfig', 'rowConfig', 'columnConfig', 'sortConfig', 'filterConfig',
  'pagerConfig', 'toolbarConfig', 'proxyConfig', 'editConfig', 'checkboxConfig',
  'radioConfig', 'treeConfig', 'expandConfig', 'tooltipConfig', 'virtualXConfig',
  'virtualYConfig',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeRows(value: unknown, fallback: Record<string, unknown>[]) {
  return Array.isArray(value) && value.length
    ? (value.filter(isRecord) as Record<string, unknown>[])
    : fallback;
}

function resolveGridMinHeight(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.max(value, 200)}px`;
  if (typeof value === 'string') {
    const px = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
    if (px) return `${Math.max(Number(px[1]), 200)}px`;
  }
  return '200px';
}

function pickVxeGridOptions(props: Record<string, unknown>) {
  const legacyOptions = isRecord(props.gridOptions) ? props.gridOptions : {};
  const nextOptions: Record<string, unknown> = { ...legacyOptions };
  vxeGridPropKeys.forEach((key) => {
    if (typeof props[key] !== 'undefined') nextOptions[key] = props[key];
  });
  return nextOptions;
}

function createPreviewData(columns: Record<string, unknown>[]) {
  return defaultData.map((row, rowIndex) => {
    const nextRow: Record<string, unknown> = {};
    columns.forEach((column, columnIndex) => {
      const field = String(column.field || `field${columnIndex + 1}`);
      nextRow[field] = row[field] ?? `Row ${rowIndex + 1}`;
    });
    return nextRow;
  });
}

function createDesignGridProps(
  props: Record<string, unknown>,
  styles: Record<string, unknown>,
  fillRemaining: boolean,
  systemTableConfig = resolveSystemTableConfig(),
) {
  const options = mergeSystemTableOptions(pickVxeGridOptions(props), systemTableConfig);
  const columns = normalizeLowCodeGridColumns(
    normalizeRows(props.columns ?? options.columns, defaultColumns) as LowCodeGridColumn[],
  );
  const data = normalizeRows(props.data, createPreviewData(columns));
  const height = fillRemaining ? '100%' : options.height ?? styles.height ?? '360px';
  return { border: true, stripe: true, showOverflow: true, ...options, height, columns, data };
}

export default {
  key: 'lowcode-grid',
  moduleName: 'businessComponents',
  label: '数据表格',
  preview: () => {
    const VxeGrid = resolveComponent('vxe-grid') as any;
    return (
      <div style={{ width: '240px', border: '1px solid #dcdfe6', borderRadius: '6px', background: '#fff', overflow: 'hidden' }}>
        <div style={{ fontWeight: 600, padding: '8px 10px', borderBottom: '1px solid #ebeef5' }}>数据表格</div>
        <div style={{ height: '116px' }}>
          <VxeGrid border size="mini" showOverflow height="116px" columns={defaultColumns} data={defaultData} />
        </div>
      </div>
    );
  },
  render({ props, styles, block }) {
    const systemSettings = useSystemSettings();
    return () => {
      const VxeGrid = resolveComponent('vxe-grid') as any;
      const fillRemaining = block.layout?.fillRemaining === true || props.layout?.fillRemaining === true;
      const gridProps = createDesignGridProps(
        props,
        styles as Record<string, unknown>,
        fillRemaining,
        resolveSystemTableConfig(systemSettings),
      );
      return (
        <div style={{ ...styles, width: '100%', height: fillRemaining ? '100%' : styles.height, minHeight: resolveGridMinHeight(styles.minHeight), display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <VxeGrid {...gridProps} />
        </div>
      );
    };
  },
  showStyleConfig: true,
  styles: { minHeight: '320px', height: '360px' },
} as VisualEditorComponent;
