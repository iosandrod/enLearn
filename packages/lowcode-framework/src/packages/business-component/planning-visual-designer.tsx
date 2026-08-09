import type { Component, CSSProperties } from 'vue';
import type {
  VisualEditorBlockData,
  VisualEditorComponent,
} from '../../visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorJsonProp,
  createEditorSwitchProp,
  type VisualEditorProps,
} from '../../visual-editor/visual-editor.props';

type PlanningVisualDesignerOptions = {
  key: string;
  kind: 'planningFlow' | 'planningGantt' | 'planningBom';
  label: string;
  description: string;
  icon: string;
  component: Component;
  sourceKey: string;
  dataset: string;
  sampleData: unknown;
  props?: Record<string, VisualEditorProps>;
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

function commonProps(options: PlanningVisualDesignerOptions) {
  return {
    blockId: createEditorInputProp({
      label: 'Block ID',
      defaultValue: `${options.key}-block`,
    }),
    title: createEditorInputProp({
      label: '标题',
      defaultValue: options.label,
    }),
    description: createEditorInputProp({
      label: '说明',
      defaultValue: options.description,
    }),
    sourceKey: createEditorInputProp({
      label: '数据源',
      defaultValue: options.sourceKey,
    }),
    serviceName: createEditorInputProp({
      label: '服务名',
      defaultValue: 'planning',
    }),
    serviceMethod: createEditorInputProp({
      label: '数据方法',
      defaultValue: 'getPlanningConsoleData',
    }),
    postDataJson: createEditorJsonProp({
      label: '请求参数 JSON',
      defaultValue: JSON.stringify({ dataset: options.dataset, filters: {} }),
      rootType: 'object',
      valueMode: 'string',
    }),
    height: createEditorInputProp({
      label: '高度',
      defaultValue: 420,
    }),
  };
}

export function createPlanningVisualDesigner(
  options: PlanningVisualDesignerOptions,
): VisualEditorComponent {
  const RuntimeComponent = options.component as any;

  return {
    key: options.key,
    moduleName: 'businessComponents',
    label: options.label,
    preview: () => previewCard(options),
    render({ props, styles, block }) {
      return () => {
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
    props: {
      ...commonProps(options),
      ...(options.kind === 'planningFlow'
        ? {
            fitViewOnInit: createEditorSwitchProp({
              label: '初始适应视图',
              defaultValue: true,
            }),
          }
        : {}),
      ...(options.props ?? {}),
    },
    events: [{ label: '选择节点或任务', value: `${options.kind}.select` }],
  };
}
