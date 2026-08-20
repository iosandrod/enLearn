import type {
  VisualEditorBlockData,
  VisualEditorComponent,
  VisualEditorModelValue,
} from '../../../visual-editor/visual-editor.utils';

function readDesignedBlocks(value: unknown) {
  const model = value as VisualEditorModelValue | null | undefined;
  const blocks = model?.pages?.['/']?.blocks;
  return Array.isArray(blocks) ? (blocks as VisualEditorBlockData[]) : [];
}

function renderFields(fields: Record<string, unknown>[]) {
  if (!fields.length) {
    return <div style={{ minHeight: '72px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#909399', fontSize: '13px' }}>当前表单为空</div>;
  }
  return (
    <div style={{ display: 'grid', gap: '8px' }}>
      {fields.map((field, index) => (
        <div key={String(field.field || index)}>
          <div style={{ fontSize: '12px', color: '#606266', marginBottom: '4px' }}>{String(field.label || field.field || 'Field')}</div>
          <div style={{ height: '28px', border: '1px solid #dcdfe6', borderRadius: '4px', background: '#f8fafc' }} />
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
    <div style={{ width: '220px', border: '1px solid #dcdfe6', minHeight: '100px', borderRadius: '6px', padding: '10px', background: '#fff' }}>
      {renderFields([])}
    </div>
  ),
  render({ props, styles, custom }) {
    return () => {
      const fields = Array.isArray(props.fields) && props.fields.length ? props.fields : [];
      const designedBlocks = readDesignedBlocks(props.formDesignerModel);
      const renderDesignedBlocks = typeof custom.renderDesignedBlocks === 'function' ? custom.renderDesignedBlocks : undefined;
      return (
        <div style={{ ...styles, width: '100%', display: 'block', border: '1px solid #dcdfe6', borderRadius: '6px', background: '#fff', padding: '12px' }}>
          <div style={{ fontWeight: 600, marginBottom: '10px' }}>{props.title || '编辑表单'}</div>
          {designedBlocks.length && renderDesignedBlocks
            ? renderDesignedBlocks(designedBlocks, String(props.formDesignerUpdatedAt || ''))
            : renderFields(fields)}
        </div>
      );
    };
  },
  showStyleConfig: true,
} as VisualEditorComponent;
