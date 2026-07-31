import { createEditorInputProp, createEditorTableProp, } from '../../../visual-editor/visual-editor.props';
const defaultFields = [
    {
        field: 'email',
        label: '邮箱',
        component: 'vxe-input',
        placeholder: '请输入邮箱',
        required: true,
    },
    {
        field: 'full_name',
        label: '姓名',
        component: 'vxe-input',
        placeholder: '请输入姓名',
        required: true,
    },
    {
        field: 'role',
        label: '角色',
        component: 'vxe-select',
        placeholder: '请选择角色',
        optionsJson: '[{"label":"管理员","value":"admin"},{"label":"用户","value":"user"}]',
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
    { label: '表格输入', value: 'lc-array-table' },
    { label: '子表单', value: 'lc-sub-form' },
];
function readDesignedBlocks(value) {
    const model = value;
    const blocks = model?.pages?.['/']?.blocks;
    return Array.isArray(blocks) ? blocks : [];
}
function renderFields(fields) {
    return (<div style={{
            display: 'grid',
            gap: '8px',
        }}>
      {fields.map((field, index) => (<div key={String(field.field || index)}>
          <div style={{ fontSize: '12px', color: '#606266', marginBottom: '4px' }}>
            {String(field.label || field.field || 'Field')}
          </div>
          <div style={{
                height: '28px',
                border: '1px solid #dcdfe6',
                borderRadius: '4px',
                background: '#f8fafc',
            }}/>
        </div>))}
    </div>);
}
export default {
    key: 'lowcode-edit-form',
    moduleName: 'businessComponents',
    label: '编辑表单',
    preview: () => (<div style={{
            width: '220px',
            border: '1px solid #dcdfe6',
            borderRadius: '6px',
            padding: '10px',
            background: '#fff',
        }}>
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>编辑表单</div>
      {renderFields(defaultFields)}
      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <span style={{
            display: 'inline-block',
            borderRadius: '4px',
            background: '#409eff',
            color: '#fff',
            padding: '4px 12px',
            fontSize: '12px',
        }}>
          保存
        </span>
        <span style={{
            display: 'inline-block',
            borderRadius: '4px',
            border: '1px solid #dcdfe6',
            padding: '4px 12px',
            fontSize: '12px',
        }}>
          重置
        </span>
      </div>
    </div>),
    render({ props, styles, custom }) {
        return () => {
            const fields = Array.isArray(props.fields) && props.fields.length ? props.fields : [];
            const designedBlocks = readDesignedBlocks(props.formDesignerModel);
            const renderDesignedBlocks = typeof custom.renderDesignedBlocks === 'function'
                ? custom.renderDesignedBlocks
                : undefined;
            return (<div style={{
                    ...styles,
                    width: '100%',
                    display: 'block',
                    border: '1px solid #dcdfe6',
                    borderRadius: '6px',
                    background: '#fff',
                    padding: '12px',
                }}>
          <div style={{ fontWeight: 600, marginBottom: '10px' }}>{props.title || '编辑表单'}</div>
          {designedBlocks.length && renderDesignedBlocks
                    ? renderDesignedBlocks(designedBlocks, String(props.formDesignerUpdatedAt || ''))
                    : renderFields(fields)}
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
            <span style={{
                    display: 'inline-block',
                    borderRadius: '4px',
                    background: '#409eff',
                    color: '#fff',
                    padding: '4px 12px',
                    fontSize: '12px',
                }}>
              {props.submitText || '保存'}
            </span>
            <span style={{
                    display: 'inline-block',
                    borderRadius: '4px',
                    border: '1px solid #dcdfe6',
                    padding: '4px 12px',
                    fontSize: '12px',
                }}>
              {props.resetText || '重置'}
            </span>
          </div>
        </div>);
        };
    },
    showStyleConfig: true,
    props: {
        blockId: createEditorInputProp({
            label: 'Block ID',
            defaultValue: 'edit-form',
        }),
        title: createEditorInputProp({
            label: '标题',
            defaultValue: '编辑信息',
        }),
        sourceKey: createEditorInputProp({
            label: '数据源',
            defaultValue: 'record',
        }),
        submitSourceKey: createEditorInputProp({
            label: '提交数据源',
            defaultValue: 'record',
        }),
        serviceName: createEditorInputProp({
            label: '服务名',
            defaultValue: 'admin',
        }),
        serviceMethod: createEditorInputProp({
            label: '详情方法',
            defaultValue: 'getUser',
        }),
        saveMethod: createEditorInputProp({
            label: '保存方法',
            defaultValue: 'saveUser',
        }),
        postDataJson: createEditorInputProp({
            label: '请求参数 JSON',
            defaultValue: '{}',
        }),
        /* columns: createEditorInputNumberProp({
          label: '列数',
          defaultValue: 1,
          min: 1,
          max: 6,
        }), */
        submitText: createEditorInputProp({
            label: '提交按钮',
            defaultValue: '保存',
        }),
        resetText: createEditorInputProp({
            label: '重置按钮',
            defaultValue: '重置',
        }),
        fields: createEditorTableProp({
            label: '表单字段',
            option: {
                showKey: 'label',
                options: [
                    { label: '字段', field: 'field' },
                    { label: '标签', field: 'label' },
                    {
                        label: '组件',
                        field: 'component',
                        component: 'vxe-select',
                        minWidth: 132,
                        options: formComponentOptions,
                    },
                    { label: '占位提示', field: 'placeholder' },
                    { label: '必填', field: 'required', component: 'vxe-switch', width: 72 },
                    { label: '跨列', field: 'span' },
                    { label: '帮助文本', field: 'help' },
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
                        minWidth: 240,
                        placeholder: '{"columns":[]}',
                    },
                ],
            },
            defaultValue: defaultFields,
        }),
    },
};
