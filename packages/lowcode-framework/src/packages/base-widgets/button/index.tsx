import { Button } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'button',
  moduleName: 'baseWidgets',
  label: 'Button',
  preview: () => <Button type={'primary'}>Button</Button>,
  render: ({ props, block, styles }) => {
    const { registerRef } = useGlobalProperties();

    return () => (
      <div style={styles}>
        <Button ref={(el) => registerRef(el, block._vid)} {...props}></Button>
      </div>
    );
  },
  resize: {
    height: true,
    width: true,
  },
  events: [
    { label: 'Click', value: 'click' },
    { label: 'Touch start', value: 'touchstart' },
  ],
} as VisualEditorComponent;
