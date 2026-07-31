import { Field } from 'vant';
import { createEditorInputNumberProp, createEditorInputProp, createEditorModelBindProp, createEditorTableProp, } from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
export const defaultArrayTableColumns = [
    {
        field: 'name',
        title: '名称',
        minWidth: 120,
        placeholder: '请输入名称',
        defaultValue: '',
    },
    {
        field: 'quantity',
        title: '数量',
        width: 88,
        placeholder: '0',
        defaultValue: '',
    },
    {
        field: 'remark',
        title: '备注',
        minWidth: 140,
        placeholder: '备注',
        defaultValue: '',
    },
];
const formComponentOptions = [
    { label: '输入框', value: 'vxe-input' },
    { label: '多行文本', value: 'vxe-textarea' },
    { label: '下拉选择', value: 'vxe-select' },
    { label: '开关', value: 'vxe-switch' },
    { label: '密码框', value: 'vxe-password-input' },
    { label: '数字输入', value: 'lc-number-input' },
    { label: 'JSON 编辑器', value: 'lc-json-editor' },
];
function normalizeColumns(value) {
    return Array.isArray(value) && value.length
        ? value
        : defaultArrayTableColumns;
}
function renderMiniTable(columns) {
    const visibleColumns = columns.slice(0, 3);
    return (<div style={{
            display: 'grid',
            width: '100%',
            minWidth: 0,
            overflow: 'hidden',
            border: '1px solid #d8e0ea',
            borderRadius: '6px',
            background: '#ffffff',
        }}>
      <div style={{
            display: 'grid',
            gridTemplateColumns: `42px repeat(${visibleColumns.length}, minmax(58px, 1fr))`,
            minWidth: 0,
            background: '#f8fafc',
            borderBottom: '1px solid #d8e0ea',
            color: '#475569',
            fontSize: '12px',
            lineHeight: '28px',
        }}>
        <span style={{ padding: '0 8px' }}>#</span>
        {visibleColumns.map((column, index) => (<span key={String(column.field || index)} style={{ padding: '0 8px' }}>
            {String(column.title || column.field || `列${index + 1}`)}
          </span>))}
      </div>
      {[1, 2].map((rowIndex) => (<div key={rowIndex} style={{
                display: 'grid',
                gridTemplateColumns: `42px repeat(${visibleColumns.length}, minmax(58px, 1fr))`,
                minWidth: 0,
                borderBottom: rowIndex === 1 ? '1px solid #eef2f7' : '0',
                fontSize: '12px',
                lineHeight: '30px',
            }}>
          <span style={{ padding: '0 8px', color: '#64748b' }}>{rowIndex}</span>
          {visibleColumns.map((column, index) => (<span key={`${rowIndex}-${String(column.field || index)}`} style={{
                    margin: '5px 6px',
                    borderRadius: '4px',
                    background: '#f1f5f9',
                }}/>))}
        </div>))}
    </div>);
}
export default {
    key: 'array-table',
    moduleName: 'baseWidgets',
    label: '表单项类型 - 表格',
    preview: () => (<div style={{
            display: 'grid',
            width: '180px',
            gap: '8px',
        }}>
      <div style={{ color: '#475569', fontSize: '13px' }}>表格输入</div>
      {renderMiniTable(defaultArrayTableColumns)}
    </div>),
    render: ({ styles, block, props }) => {
        const { registerRef } = useGlobalProperties();
        return () => {
            const columns = normalizeColumns(props.columns);
            return (<div style={{ ...styles, width: '100%' }}>
          <Field {...props} modelValue="" name={Array.isArray(props.name) ? [...props.name].pop() : props.name} v-slots={{
                    input: () => (<div ref={(el) => registerRef(el, block._vid)} style={{
                            display: 'grid',
                            width: '100%',
                            minWidth: 0,
                            gap: '8px',
                        }}>
                  {renderMiniTable(columns)}
                </div>),
                }}/>
        </div>);
        };
    },
    props: {
        modelValue: createEditorInputProp({
            label: '默认值',
            defaultValue: [],
        }),
        name: createEditorModelBindProp({ label: '字段绑定', defaultValue: '' }),
        label: createEditorInputProp({ label: '输入框左侧文本', defaultValue: '表格输入' }),
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
        addText: createEditorInputProp({
            label: '新增按钮文案',
            defaultValue: '新增行',
        }),
        rowKey: createEditorInputProp({
            label: '行唯一键',
            defaultValue: '__rowKey',
        }),
        columns: createEditorTableProp({
            label: '表格列',
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
                    { label: '最小宽度', field: 'minWidth' },
                    { label: '占位提示', field: 'placeholder' },
                    { label: '默认值', field: 'defaultValue' },
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
    },
    events: [{ label: '表格数据变化时触发', value: 'update:model-value' }],
    resize: {
        width: true,
    },
    model: {
        default: '绑定字段',
    },
};
