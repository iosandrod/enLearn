import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
export const getTabbarItem = (): VisualEditorComponent => ({
  key: 'tabbar-item', moduleName: 'baseWidgets', label: '底部标签栏', preview: () => <></>, render: () => () => <></>,
  events: [{ label: '点击左侧按钮时触发', value: 'click-left' }, { label: '点击右侧按钮时触发', value: 'click-right' }], draggable: false,
});
