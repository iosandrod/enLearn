import { Field, Radio, RadioGroup } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
export default {
  key: 'radio', moduleName: 'baseWidgets', label: '表单项类型 - 单选框', preview: () => <RadioGroup modelValue="1" direction="horizontal"><Radio name="1">one</Radio><Radio name="2">two</Radio></RadioGroup>,
  render: ({ styles, block, props }) => { const { registerRef } = useGlobalProperties(); return () => <div style={styles}><Field {...props} modelValue="" name={Array.isArray(props.name) ? [...props.name].pop() : props.name} v-slots={{ input: () => <RadioGroup ref={(el) => registerRef(el, block._vid)} {...props} v-model={props.modelValue}>{props.options?.map((item) => <Radio name={item.value} style={{ marginBottom: '5px' }}>{item.label}</Radio>)}</RadioGroup> }} /></div>; },
  events: [{ label: 'Click', value: 'click' }], resize: { width: true }, model: { default: '绑定字段' },
} as VisualEditorComponent;
