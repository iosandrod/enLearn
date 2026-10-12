import type { VisualEditorComponent } from './visual-editor.utils';
import { useGlobalProperties } from '../hooks/useGlobalProperties';

// Render text nodes already stored in page schemas without adding a palette item.
export default {
  key: 'text',
  moduleName: 'businessComponents',
  label: '文本',
  preview: () => <span>预览文本</span>,
  render: ({ props, block, styles }) => {
    const { registerRef } = useGlobalProperties();
    return () => (
      <div
        ref={(element) => registerRef(element, block._vid)}
        style={{
          color: props.color,
          fontSize: `${parseFloat(props.size)}px`,
          fontFamily: props.font,
          ...styles,
        }}
      >
        {props.text || '默认文本'}
      </div>
    );
  },
} as VisualEditorComponent;
