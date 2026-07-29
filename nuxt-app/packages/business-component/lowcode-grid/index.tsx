import type { VisualEditorComponent } from '@/visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorSwitchProp,
  createEditorTableProp,
} from '@/visual-editor/visual-editor.props';

const previewRows = [
  ['Alice', '学生', '启用'],
  ['Bob', '老师', '停用'],
];
const defaultColumns = [
  { field: 'email', title: '邮箱', minWidth: '220' },
  { field: 'full_name', title: '姓名', minWidth: '160' },
  { field: 'role', title: '角色', minWidth: '120' },
] as unknown as { label: string; value: string }[];

const gridOverflowOptions = [
  { label: '默认', value: '' },
  { label: '省略', value: 'ellipsis' },
  { label: '标题提示', value: 'title' },
  { label: '气泡提示', value: 'tooltip' },
];

function resolveGridMinHeight(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${Math.max(value, 200)}px`;
  }

  if (typeof value === 'string') {
    const px = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
    if (px) return `${Math.max(Number(px[1]), 200)}px`;
  }

  return '200px';
}

export default {
  key: 'lowcode-grid',
  moduleName: 'businessComponents',
  label: '数据表格',
  preview: () => (
    <div
      style={{
        width: '240px',
        border: '1px solid #dcdfe6',
        borderRadius: '6px',
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      <div style={{ fontWeight: 600, padding: '8px 10px', borderBottom: '1px solid #ebeef5' }}>
        数据表格
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <tbody>
          {previewRows.map((row) => (
            <tr>
              {row.map((cell) => (
                <td style={{ borderBottom: '1px solid #ebeef5', padding: '6px' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ),
  render({ props, styles }) {
    return () => {
      const columns = Array.isArray(props.columns) && props.columns.length ? props.columns : [];

      return (
        <div
          style={{
            ...styles,
            width: '100%',
            minHeight: resolveGridMinHeight(styles.minHeight),
            display: 'block',
            border: '1px solid #dcdfe6',
            borderRadius: '6px',
            background: '#fff',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {columns.map((column: Record<string, unknown>) => (
                  <th
                    style={{
                      textAlign: 'left',
                      background: '#f5f7fa',
                      borderBottom: '1px solid #ebeef5',
                      padding: '8px',
                    }}
                  >
                    {String(column.title || column.field || 'Column')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr>
                  {columns.map((_column: Record<string, unknown>, index: number) => (
                    <td style={{ borderBottom: '1px solid #ebeef5', padding: '8px' }}>
                      {row[index] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    };
  },
  showStyleConfig: true,
  styles: {
    minHeight: '320px',
    height: '360px',
  },
  props: {
    blockId: createEditorInputProp({
      label: 'Block ID',
      defaultValue: 'records-grid',
    }),
    title: createEditorInputProp({
      label: '标题',
      defaultValue: '数据列表',
    }),
    sourceKey: createEditorInputProp({
      label: '数据源',
      defaultValue: 'records',
    }),
    serviceName: createEditorInputProp({
      label: '服务名',
      defaultValue: 'admin',
    }),
    serviceMethod: createEditorInputProp({
      label: '列表方法',
      defaultValue: 'listUsers',
    }),
    saveMethod: createEditorInputProp({
      label: '保存方法',
      defaultValue: '',
    }),
    deleteMethod: createEditorInputProp({
      label: '删除方法',
      defaultValue: '',
    }),
    postDataJson: createEditorInputProp({
      label: '请求参数 JSON',
      defaultValue: '{}',
    }),
    showRowActions: createEditorSwitchProp({
      label: '显示行操作',
      defaultValue: true,
    }),
    columns: createEditorTableProp({
      label: '表格列',
      option: {
        showKey: 'title',
        options: [
          { label: '字段', field: 'field' },
          { label: '标题', field: 'title' },
          { label: '宽度', field: 'width' },
          { label: '最小宽度', field: 'minWidth' },
          { label: '格式化器', field: 'formatter' },
          {
            label: '溢出',
            field: 'showOverflow',
            component: 'vxe-select',
            minWidth: 110,
            options: gridOverflowOptions,
          },
          {
            label: '筛选 JSON',
            field: 'filters',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '[]',
          },
          {
            label: '渲染 JSON',
            field: 'cellRender',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '{}',
          },
          {
            label: '编辑 JSON',
            field: 'editRender',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '{}',
          },
          {
            label: '参数 JSON',
            field: 'params',
            component: 'lc-json-editor',
            minWidth: 220,
            placeholder: '{}',
          },
        ],
      },
      defaultValue: defaultColumns,
    }),
  },
} as VisualEditorComponent;
