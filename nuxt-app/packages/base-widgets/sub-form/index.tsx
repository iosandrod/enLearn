import { Field } from 'vant';
import type {
  VisualEditorBlockData,
  VisualEditorComponent,
  VisualEditorModelValue,
} from '@/visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorModelBindProp,
  createEditorTableProp,
  createEditorInputNumberProp,
} from '@/visual-editor/visual-editor.props';

const defaultFields = [
  {
    field: 'name',
    label: '名称',
    component: 'vxe-input',
    placeholder: '请输入名称',
    required: false,
    span: 1,
    help: '',
    optionsJson: '',
  },
  {
    field: 'remark',
    label: '备注',
    component: 'vxe-textarea',
    placeholder: '请输入备注',
    required: false,
    span: 1,
    help: '',
    optionsJson: '',
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

function readDesignedBlocks(value: unknown) {
  const model = value as VisualEditorModelValue | null | undefined;
  const blocks = model?.pages?.['/']?.blocks;

  return Array.isArray(blocks) ? (blocks as VisualEditorBlockData[]) : [];
}

function renderFieldRows(fields: Record<string, unknown>[]) {
  const rows = fields.length ? fields : defaultFields;

  return (
    <div
      style={{
        display: 'grid',
        gap: '6px',
        width: '100%',
      }}
    >
      {rows.map((field, index) => (
        <div
          key={String(field.field || index)}
          style={{
            display: 'grid',
            gridTemplateColumns: '76px minmax(0, 1fr)',
            alignItems: 'center',
            gap: '8px',
            color: '#475569',
            fontSize: '12px',
          }}
        >
          <span>{String(field.label || field.field || `字段${index + 1}`)}</span>
          <span
            style={{
              height: '26px',
              border: '1px solid #d8e0ea',
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
  key: 'sub-form',
  moduleName: 'baseWidgets',
  label: '表单项类型 - 子表单',
  preview: () => (
    <div
      style={{
        display: 'grid',
        width: '180px',
        gap: '8px',
      }}
    >
      <div style={{ color: '#475569', fontSize: '13px' }}>子表单</div>
      <div
        style={{
          display: 'grid',
          gap: '6px',
          padding: '8px',
          border: '1px solid #d8e0ea',
          borderRadius: '6px',
          background: '#f8fafc',
        }}
      >
        <span style={{ height: '22px', borderRadius: '4px', background: '#ffffff' }} />
        <span style={{ height: '22px', borderRadius: '4px', background: '#ffffff' }} />
      </div>
    </div>
  ),
  render: ({ styles, props, custom }) => {
    return () => {
      const fields = Array.isArray(props.fields) ? props.fields : [];
      const designedBlocks = readDesignedBlocks(props.subFormDesignerModel);
      const renderDesignedBlocks =
        typeof custom.renderDesignedBlocks === 'function'
          ? custom.renderDesignedBlocks
          : undefined;

      return (
        <div style={{ ...styles, width: '100%' }}>
          <Field
            {...props}
            modelValue=""
            name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
            v-slots={{
              input: () => (
                <div
                  style={{
                    display: 'grid',
                    width: '100%',
                    gap: '8px',
                    padding: '10px',
                    border: '1px solid #d8e0ea',
                    borderRadius: '6px',
                    background: '#ffffff',
                  }}
                >
                  {designedBlocks.length && renderDesignedBlocks
                    ? renderDesignedBlocks(
                        designedBlocks,
                        String(props.subFormDesignerUpdatedAt || ''),
                      )
                    : renderFieldRows(fields as Record<string, unknown>[])}
                </div>
              ),
            }}
          />
        </div>
      );
    };
  },
  props: {
    modelValue: createEditorInputProp({
      label: '默认值',
      defaultValue: {},
    }),
    name: createEditorModelBindProp({ label: '字段绑定', defaultValue: '' }),
    label: createEditorInputProp({ label: '输入框左侧文本', defaultValue: '子表单' }),
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
    fields: createEditorTableProp({
      label: '子表单字段',
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
  events: [{ label: '子表单数据变化时触发', value: 'update:model-value' }],
  resize: {
    width: true,
  },
  model: {
    default: '绑定字段',
  },
} as VisualEditorComponent;
