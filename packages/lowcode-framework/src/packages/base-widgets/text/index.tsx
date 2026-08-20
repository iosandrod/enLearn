import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
export default {
  key: 'text', moduleName: 'baseWidgets', label: '文本', preview: () => <span>预览文本</span>,
  render: ({ props, block, styles }) => { const { registerRef } = useGlobalProperties(); return () => <div ref={(el) => registerRef(el, block._vid)} style={{ color: props.color, fontSize: `${parseFloat(props.size)}px`, fontFamily: props.font, ...styles }}>{props.text || '默认文本'}</div>; },
} as VisualEditorComponent;
