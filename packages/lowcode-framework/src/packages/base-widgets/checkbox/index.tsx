import { computed } from 'vue';
import { Field, Checkbox, CheckboxGroup } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'checkbox', moduleName: 'baseWidgets', label: '表单项类型 - 复选框',
  preview: () => <CheckboxGroup modelValue={['1']} direction="horizontal"><Checkbox name="1" shape="square">one</Checkbox><Checkbox name="2" shape="square">two</Checkbox></CheckboxGroup>,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    const checkList = computed({ get: () => typeof props.modelValue === 'string' ? props.modelValue.split(',') : props.modelValue, set: (value) => (props.modelValue = value) });
    return () => <div style={styles}><Field {...props} modelValue="" name={Array.isArray(props.name) ? [...props.name].pop() : props.name} v-slots={{ input: () => <CheckboxGroup ref={(el) => registerRef(el, block._vid)} {...props} v-model={checkList.value}>{props.options?.map((item) => <Checkbox name={item.value} style={{ marginBottom: '5px' }} shape="square">{item.label}</Checkbox>)}</CheckboxGroup> }} /></div>;
  },
  events: [{ label: 'Change', value: 'change' }, { label: 'Click', value: 'click' }], resize: { width: true }, model: { default: '绑定字段' },
} as VisualEditorComponent;
