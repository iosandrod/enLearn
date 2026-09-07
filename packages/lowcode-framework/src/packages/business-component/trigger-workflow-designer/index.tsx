import type { CSSProperties } from 'vue';
import type {
  VisualEditorComponent,
} from '../../../visual-editor/visual-editor.utils';
import { resolveLowCodeBlockMaterialComponent } from '../../../lowcode/material-runtime/component-bridge';
import { lowCodeBlockMaterialRevision } from '../../../lowcode/block-materials';

const sampleModel = {
  schemaVersion: 1,
  code: 'trigger_workflow_preview',
  name: '触发器编排预览',
  kind: 'custom',
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 380, y: 48 } },
    { id: 'end', type: 'end', name: '结束', position: { x: 380, y: 300 } },
  ],
  edges: [{ id: 'edge_start_end', source: 'start', target: 'end' }],
};

function previewCard() {
  return (
    <div style={{
      display: 'grid', width: '230px', minHeight: '108px',
      gridTemplateColumns: '34px minmax(0, 1fr)', alignItems: 'center', gap: '10px',
      border: '1px solid #dbe3ea', borderRadius: '6px', background: '#fff', padding: '12px',
    }}>
      <span style={{
        display: 'grid', width: '34px', height: '34px', placeItems: 'center',
        borderRadius: '6px', background: '#eef2ff', color: '#4f46e5', fontSize: '19px',
      }}>
        <i class="ri-node-tree" aria-hidden="true" />
      </span>
      <span style={{ display: 'grid', minWidth: 0, gap: '3px' }}>
        <strong style={{ color: '#263244', fontSize: '13px' }}>触发器编排画布</strong>
        <small style={{ color: '#748094', fontSize: '10px', lineHeight: '1.45' }}>
          配置触发器、任务、等待与分支节点
        </small>
      </span>
    </div>
  );
}

const triggerWorkflowDesigner: VisualEditorComponent = {
  key: 'trigger-workflow-designer',
  moduleName: 'businessComponents',
  label: '触发器编排画布',
  preview: previewCard,
  render({ props, styles, block }) {
    return () => {
      lowCodeBlockMaterialRevision.value;
      const RuntimeComponent = resolveLowCodeBlockMaterialComponent('trigger-workflow-designer') as any;
      const model = props.model && typeof props.model === 'object' ? props.model : sampleModel;
      const runtimeBlock = {
        id: String(props.blockId || block._vid),
        kind: 'trigger-workflow-designer',
        sourceKey: String(props.sourceKey || 'triggerWorkflowModel'),
        model,
        readonly: true,
      };
      const wrapperStyle: CSSProperties = {
        ...styles,
        display: 'block',
        width: '100%',
        minHeight: '420px',
        overflow: 'hidden',
      };

      if (!RuntimeComponent) {
        return <div style={wrapperStyle} role="status">触发器编排画布物料正在加载…</div>;
      }

      return (
        <div style={wrapperStyle}>
          <RuntimeComponent
            block={runtimeBlock}
            resolvedData={{ triggerWorkflowModel: model }}
            formModels={{}}
            searchFilters={{}}
          />
        </div>
      );
    };
  },
  showStyleConfig: true,
  styles: { width: '100%', minHeight: '420px' },
  events: [
    { label: '编排节点点击', value: 'trigger-workflow.nodeClick' },
    { label: '编排模型变更', value: 'trigger-workflow.change' },
  ],
};

export default triggerWorkflowDesigner;
