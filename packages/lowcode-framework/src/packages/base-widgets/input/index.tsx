import { Field } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'input', moduleName: 'baseWidgets', label: 'Input',
  preview: () => <Field name="username" label="Username" labelWidth={50} colon placeholder="Enter username" />,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    let rules = [];
    try { rules = JSON.parse(props.rules); } catch {}
    return () => <div style={styles}><Field ref={(el) => registerRef(el, block._vid)} {...props} v-model={props.modelValue} name={Array.isArray(props.name) ? [...props.name].pop() : props.name} rules={rules} /></div>;
  },
  events: [
    { label: '输入框内容变化时触发', value: 'update:model-value' }, { label: '输入框获得焦点时触发', value: 'focus' },
    { label: '输入框失去焦点时触发', value: 'blur' }, { label: 'Clear', value: 'clear' }, { label: 'Click', value: 'click' },
    { label: 'Click input', value: 'click-input' }, { label: 'Click left icon', value: 'click-left-icon' }, { label: 'Click right icon', value: 'click-right-icon' },
  ],
  resize: { width: true }, model: { default: '绑定字段' },
} as VisualEditorComponent;
