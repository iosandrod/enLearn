import type { CSSProperties } from 'vue';
import type {
  VisualEditorBlockData,
  VisualEditorComponent,
} from '../../visual-editor/visual-editor.utils';
import { resolveLowCodeBlockMaterialComponent } from '../../lowcode/material-runtime/component-bridge';

type PlanningVisualDesignerOptions = {
  key: string;
  kind: 'planningFlow' | 'planningGantt' | 'planningBom';
  label: string;
  description: string;
  icon: string;
  sourceKey: string;
  dataset: string;
  sampleData: unknown;
  createRuntimeProps?: (props: Record<string, unknown>) => Record<string, unknown>;
};

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function previewCard(options: PlanningVisualDesignerOptions) {
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
          background: '#e8f5f1',
          color: '#0f766e',
          fontSize: '19px',
        }}
      >
        <i class={options.icon} aria-hidden="true" />
      </span>
      <span style={{ display: 'grid', minWidth: 0, gap: '3px' }}>
        <strong style={{ color: '#263244', fontSize: '13px' }}>{options.label}</strong>
        <small style={{ color: '#748094', fontSize: '10px', lineHeight: '1.45' }}>
          {options.description}
        </small>
      </span>
    </div>
  );
}

export function createPlanningVisualDesigner(
  options: PlanningVisualDesignerOptions,
): VisualEditorComponent {
  return {
    key: options.key,
    moduleName: 'businessComponents',
    label: options.label,
    preview: () => previewCard(options),
    render({ props, styles, block }) {
      return () => {
        const RuntimeComponent = resolveLowCodeBlockMaterialComponent(options.kind) as any;
        const sourceKey = readString(props.sourceKey, options.sourceKey);
        const runtimeBlock = {
          id: readString(props.blockId, block._vid),
          kind: options.kind,
          title: readString(props.title, options.label),
          description: readString(props.description),
          sourceKey,
          height: props.height || 420,
          ...(options.createRuntimeProps?.(props) ?? {}),
        };
        const wrapperStyle: CSSProperties = {
          ...styles,
          display: 'block',
          width: '100%',
          minHeight: '300px',
          overflow: 'hidden',
        };

        if (!RuntimeComponent) {
          return (
            <div style={wrapperStyle} role="status">
              物料正在加载…
            </div>
          );
        }

        return (
          <div style={wrapperStyle}>
            <RuntimeComponent
              block={runtimeBlock}
              resolvedData={{ [sourceKey]: options.sampleData }}
              formModels={{}}
              searchFilters={{}}
            />
          </div>
        );
      };
    },
    showStyleConfig: true,
    styles: {
      width: '100%',
      minHeight: '420px',
    },
    events: [{ label: '选择节点或任务', value: `${options.kind}.select` }],
  };
}
