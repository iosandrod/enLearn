import type {
  VisualEditorBlockData,
  VisualEditorComponent,
  VisualEditorModelValue,
} from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorJsonProp,
  createEditorSelectProp,
  createEditorTableProp,
} from '../../../visual-editor/visual-editor.props';

const formComponentOptions = [
  { label: '输入框', value: 'vxe-input' },
  { label: '多行文本', value: 'vxe-textarea' },
  { label: '下拉选择', value: 'vxe-select' },
  { label: '开关', value: 'vxe-switch' },
  { label: '密码框', value: 'vxe-password-input' },
  { label: '数字输入', value: 'lc-number-input' },
  { label: 'JSON 编辑器', value: 'lc-json-editor' },
  { label: '代码编辑器', value: 'lc-monaco-editor' },
  { label: '关联资料', value: 'base-info' },
  { label: '表格输入', value: 'lc-array-table' },
  { label: '子表单', value: 'lc-sub-form' },
];

function readDesignedBlocks(value: unknown) {
  const model = value as VisualEditorModelValue | null | undefined;
  const blocks = model?.pages?.['/']?.blocks;

  return Array.isArray(blocks) ? (blocks as VisualEditorBlockData[]) : [];
}

function renderFields(fields: Record<string, unknown>[]) {
  if (!fields.length) {
    return (
      <div
        style={{
          minHeight: '72px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#909399',
          fontSize: '13px',
        }}
      >
        当前表单为空
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gap: '8px',
      }}
    >
      {fields.map((field, index) => (
        <div key={String(field.field || index)}>
          <div style={{ fontSize: '12px', color: '#606266', marginBottom: '4px' }}>
            {String(field.label || field.field || 'Field')}
          </div>
          <div
            style={{
              height: '28px',
              border: '1px solid #dcdfe6',
              borderRadius: '4px',
              background: '#f8fafc',
            }}
          />
        </div>
      ))}
    </div>
  );
}

export default {
  key: 'lowcode-edit-form',
  moduleName: 'businessComponents',
  label: '编辑表单',
  preview: () => (
    <div
      style={{
        width: '220px',
        border: '1px solid #dcdfe6',
        minHeight: '100px',
        borderRadius: '6px',
        padding: '10px',
        background: '#fff',
      }}
    >
      {renderFields([])}
    </div>
  ),
  render({ props, styles, custom }) {
    return () => {
      const fields = Array.isArray(props.fields) && props.fields.length ? props.fields : [];
      const designedBlocks = readDesignedBlocks(props.formDesignerModel);
      const renderDesignedBlocks =
        typeof custom.renderDesignedBlocks === 'function'
          ? custom.renderDesignedBlocks
          : undefined;

      return (
        <div
          style={{
            ...styles,
            width: '100%',
            display: 'block',
            border: '1px solid #dcdfe6',
            borderRadius: '6px',
            background: '#fff',
            padding: '12px',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '10px' }}>{props.title || '编辑表单'}</div>
          {designedBlocks.length && renderDesignedBlocks
            ? renderDesignedBlocks(
                designedBlocks,
                String(props.formDesignerUpdatedAt || ''),
              )
            : renderFields(fields)}
        </div>
      );
    };
  },
  showStyleConfig: true,
  props: {
    blockId: createEditorInputProp({
      label: 'Block ID',
      defaultValue: 'edit-form',
    }),
    formType: createEditorSelectProp({
      label: '表单类型',
      defaultValue: 'edit',
      options: [
        { label: 'edit', value: 'edit' },
        { label: 'search', value: 'search' },
        { label: 'default', value: 'default' },
      ],
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
    postDataJson: createEditorJsonProp({
      label: '请求参数 JSON',
      defaultValue: '{}',
      rootType: 'object',
      valueMode: 'string',
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
      defaultValue: [],
    }),
  },
} as VisualEditorComponent;
