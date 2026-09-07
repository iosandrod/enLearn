import type { CSSProperties } from 'vue';
import type {
  VisualEditorBlockData,
  VisualEditorComponent,
} from '../../../visual-editor/visual-editor.utils';
import { resolveLowCodeBlockMaterialComponent } from '../../../lowcode/material-runtime/component-bridge';
import { lowCodeMaterialComponentRevision } from '../../../lowcode/material-runtime/component-bridge';

function previewCard() {
  return (
    <div style={{
      display: 'grid', width: '230px', minHeight: '108px',
      gridTemplateColumns: '34px minmax(0, 1fr)', alignItems: 'center', gap: '10px',
      border: '1px solid #dbe3ea', borderRadius: '6px', background: '#fff', padding: '12px',
    }}>
      <span style={{
        display: 'grid', width: '34px', height: '34px', placeItems: 'center',
        borderRadius: '6px', background: '#fff7ed', color: '#c2410c', fontSize: '19px',
      }}>
        <i class="ri-price-tag-3-line" aria-hidden="true" />
      </span>
      <span style={{ display: 'grid', minWidth: 0, gap: '3px' }}>
        <strong style={{ color: '#263244', fontSize: '13px' }}>标签设计器</strong>
        <small style={{ color: '#748094', fontSize: '10px', lineHeight: '1.45' }}>
          设计标签内容、版式与打印模板
        </small>
      </span>
    </div>
  );
}

const labelDesigner: VisualEditorComponent = {
  key: 'label-designer',
  moduleName: 'businessComponents',
  label: '标签设计器',
  preview: previewCard,
  render({ props, styles, block }) {
    return () => {
      // Re-render when the database material catalog replaces its pending component.
      lowCodeMaterialComponentRevision.value;
      const RuntimeComponent = resolveLowCodeBlockMaterialComponent('label-designer') as any;
      const runtimeBlock = {
        id: String(props.blockId || block._vid),
        kind: 'label-designer',
        ...(props.templateId ? { templateId: String(props.templateId) } : {}),
        templateName: String(props.templateName || '标签打印模板'),
        readonly: props.readonly === true,
      };
      const wrapperStyle: CSSProperties = {
        ...styles,
        display: 'block',
        width: '100%',
        minHeight: '560px',
        overflow: 'hidden',
      };

      if (!RuntimeComponent) {
        return <div style={wrapperStyle} role="status">标签设计器物料正在加载…</div>;
      }

      return (
        <div style={wrapperStyle}>
          <RuntimeComponent
            block={runtimeBlock}
            resolvedData={{}}
            formModels={{}}
            searchFilters={{}}
          />
        </div>
      );
    };
  },
  showStyleConfig: true,
  styles: { width: '100%', minHeight: '560px' },
  events: [
    { label: '模板内容变更', value: 'label-designer.change' },
    { label: '打印预览', value: 'label-designer.preview' },
  ],
};

export default labelDesigner;
