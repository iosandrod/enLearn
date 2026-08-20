import { NoticeBar } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'NoticeBar',
  moduleName: 'baseWidgets',
  label: 'Notice bar',
  preview: () => (
    <NoticeBar style={{ width: '180px' }} leftIcon="volume-o" text="Notice content" />
  ),
  render: ({ block, props, styles }) => {
    const { registerRef } = useGlobalProperties();
    return () => (
      <div style={styles}>
        <NoticeBar ref={(el) => registerRef(el, block._vid)} style={{ width: '100%' }} {...props} />
      </div>
    );
  },
  events: [
    { label: '点击通知栏时触发', value: 'click' },
    { label: '关闭通知栏时触发', value: 'close' },
    { label: '每当滚动栏重新开始滚动时触发', value: 'replay' },
  ],
  resize: { width: true },
  model: { default: '绑定字段' },
} as VisualEditorComponent;
