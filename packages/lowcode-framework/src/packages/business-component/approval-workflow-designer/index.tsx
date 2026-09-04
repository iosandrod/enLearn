import type { CSSProperties } from 'vue';
import type {
  VisualEditorBlockData,
  VisualEditorComponent,
} from '../../../visual-editor/visual-editor.utils';
import { resolveLowCodeBlockMaterialComponent } from '../../../lowcode/material-runtime/component-bridge';
import { lowCodeBlockMaterialRevision } from '../../../lowcode/block-materials';

const sampleModel = {
  schemaVersion: 1,
  code: 'approval_workflow_preview',
  name: '审批流程预览',
  documentType: 'document',
  status: 'draft',
  variables: [],
  nodes: [
    { id: 'start', type: 'start', name: '开始', position: { x: 330, y: 48 } },
    {
      id: 'approval',
      type: 'approval',
      name: '审批',
      position: { x: 330, y: 190 },
      config: {
        assigneeStrategy: { type: 'initiatorManager', level: 1 },
        allowReject: true,
      },
    },
    { id: 'end', type: 'end', name: '结束', position: { x: 330, y: 332 } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'approval' },
    { id: 'e2', source: 'approval', target: 'end' },
  ],
};

function previewCard() {
  return (
    <div
      style={{
        display: 'grid',
        width: '230px',
        minHeight: '108px',
        gridTemplateColumns: '34px minmax(0, 1fr)',
        alignItems: 'center',
        gap: '10px',
        border: '1px solid #dbe3ea',
        borderRadius: '6px',
        background: '#ffffff',
        padding: '12px',
      }}
    >
      <span
        style={{
          display: 'grid',
          width: '34px',
          height: '34px',
          placeItems: 'center',
          borderRadius: '6px',
          background: '#eff6ff',
          color: '#2563eb',
          fontSize: '19px',
        }}
      >
        <i class="ri-git-branch-line" aria-hidden="true" />
      </span>
      <span style={{ display: 'grid', minWidth: 0, gap: '3px' }}>
        <strong style={{ color: '#263244', fontSize: '13px' }}>审批流模型图</strong>
        <small style={{ color: '#748094', fontSize: '10px', lineHeight: '1.45' }}>
          可视化配置审批节点、分支与流转关系
        </small>
      </span>
    </div>
  );
}

const approvalWorkflowDesigner: VisualEditorComponent = {
  key: 'approval-workflow-designer',
  moduleName: 'businessComponents',
  label: '审批流模型图',
  preview: previewCard,
  render({ props, styles, block }) {
    return () => {
      // Track the catalog revision so a pending placeholder is replaced as
      // soon as the database material finishes compiling.
      lowCodeBlockMaterialRevision.value;
      const RuntimeComponent = resolveLowCodeBlockMaterialComponent('approval-workflow-designer') as any;
      const model = props.model && typeof props.model === 'object' ? props.model : sampleModel;
      const runtimeBlock = {
        id: String(props.blockId || block._vid),
        kind: 'approval-workflow-designer',
        sourceKey: String(props.sourceKey || 'workflowModel'),
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
        return <div style={wrapperStyle} role="status">审批流模型图物料正在加载…</div>;
      }

      return (
        <div style={wrapperStyle}>
          <RuntimeComponent
            block={runtimeBlock}
            resolvedData={{ workflowModel: model }}
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
    { label: '模型图节点点击', value: 'approval-workflow.nodeClick' },
    { label: '模型图变更', value: 'approval-workflow.change' },
  ],
};

export default approvalWorkflowDesigner;
