import { Field, Rate } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
export default {
  key: 'rate', moduleName: 'baseWidgets', label: '表单项类型 - 评分', preview: () => <Field name="rate" label="评分" labelWidth={50} v-slots={{ input: () => <Rate modelValue={3} /> }} />,
  render: ({ styles, block, props }) => { const { registerRef } = useGlobalProperties(); return () => <div style={styles}><Field {...props} modelValue="" name={Array.isArray(props.name) ? [...props.name].pop() : props.name} v-slots={{ input: () => <Rate ref={(el) => registerRef(el, block._vid)} {...props} v-model={props.modelValue} /> }} /></div>; },
  resize: { width: true }, model: { default: '绑定字段' },
} as VisualEditorComponent;
