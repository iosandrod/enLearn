import { Field, Switch } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'switch',
  moduleName: 'baseWidgets',
  label: 'Switch',
  preview: () => <Field name="switch" label="Switch" v-slots={{ input: () => <Switch size={20} /> }} />,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    return () => (
      <div style={styles}>
        <Field
          {...props}
          modelValue=""
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{
            input: () => <Switch ref={(el) => registerRef(el, block._vid)} {...props} v-model={props.modelValue} />,
          }}
        />
      </div>
    );
  },
  events: [
    { label: '开关状态切换时触发', value: 'change' },
    { label: 'Click', value: 'click' },
  ],
  resize: { width: true },
  model: { default: '绑定字段' },
} as VisualEditorComponent;
