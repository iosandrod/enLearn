import type {
  VisualEditorBlockData,
  VisualEditorComponent,
  VisualEditorModelValue,
} from '@/visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorTableProp,
} from '@/visual-editor/visual-editor.props';

const previewFields = ['姓名', '手机', '状态'];
const defaultFields = [
  {
    field: 'email',
    label: '邮箱',
    component: 'vxe-input',
    placeholder: '请输入邮箱',
  },
  {
    field: 'role',
    label: '角色',
    component: 'vxe-input',
    placeholder: '请输入角色',
  },
] as unknown as { label: string; value: string }[];

function readDesignedBlocks(value: unknown) {
  const model = value as VisualEditorModelValue | null | undefined;
  const blocks = model?.pages?.['/']?.blocks;

  return Array.isArray(blocks) ? (blocks as VisualEditorBlockData[]) : [];
}

export default {
  key: 'lowcode-search-form',
  moduleName: 'containerComponents',
  label: '查询表单',
  preview: () => (
    <div
      style={{
        width: '220px',
        border: '1px solid #dcdfe6',
        borderRadius: '6px',
        padding: '10px',
        background: '#fff',
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: '8px' }}>查询表单</div>
      <div style={{ display: 'grid', gap: '6px' }}>
        {previewFields.map((field) => (
          <div
            key={field}
            style={{
              height: '24px',
              border: '1px solid #ebeef5',
              borderRadius: '4px',
              color: '#909399',
              fontSize: '12px',
              lineHeight: '24px',
              padding: '0 8px',
            }}
          >
            {field}
          </div>
        ))}
      </div>
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
          <div style={{ fontWeight: 600, marginBottom: '10px' }}>{props.title || '查询表单'}</div>
          {designedBlocks.length && renderDesignedBlocks ? (
            renderDesignedBlocks(
              designedBlocks,
              String(props.formDesignerUpdatedAt || ''),
            )
          ) : (
          <div
            style={{
              display: 'grid',
              gap: '8px',
            }}
          >
            {fields.map((field: Record<string, unknown>, index: number) => (
              <div
                key={String(field.field || index)}
              >
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
          )}
          <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
            <span
              style={{
                display: 'inline-block',
                borderRadius: '4px',
                background: '#409eff',
                color: '#fff',
                padding: '4px 12px',
                fontSize: '12px',
              }}
            >
              查询
            </span>
            <span
              style={{
                display: 'inline-block',
                borderRadius: '4px',
                border: '1px solid #dcdfe6',
                padding: '4px 12px',
                fontSize: '12px',
              }}
            >
              重置
            </span>
          </div>
        </div>
      );
    };
  },
  showStyleConfig: true,
  props: {
    blockId: createEditorInputProp({
      label: 'Block ID',
      defaultValue: 'query-form',
    }),
    title: createEditorInputProp({
      label: '标题',
      defaultValue: '查询条件',
    }),
    sourceKey: createEditorInputProp({
      label: '目标数据源',
      defaultValue: 'records',
    }),
    /* columns: createEditorInputNumberProp({
      label: '列数',
      defaultValue: 3,
      min: 1,
      max: 6,
    }), */
    fields: createEditorTableProp({
      label: '查询字段',
      option: {
        showKey: 'label',
        options: [
          { label: '字段', field: 'field' },
          { label: '标签', field: 'label' },
          { label: '组件', field: 'component' },
          { label: '占位提示', field: 'placeholder' },
          { label: '必填', field: 'required' },
          { label: '选项 JSON', field: 'optionsJson' },
        ],
      },
      defaultValue: defaultFields,
    }),
  },
} as VisualEditorComponent;
