import { Field, Slider } from '../../../components/LegacyWidgets';
import { omit } from 'lodash-es';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'slider',
  moduleName: 'baseWidgets',
  label: '表单项类型 - 滑块',
  preview: () => (
    <Field name="rate" label="滑块" labelWidth={50} v-slots={{ input: () => <Slider modelValue={3} /> }} />
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    return () => (
      <div style={styles}>
        <Field
          {...omit(props, 'size')}
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{
            input: () => (
              <Slider ref={(el) => registerRef(el, block._vid)} {...props} v-model={props.modelValue} />
            ),
          }}
        />
      </div>
    );
  },
  resize: { width: true },
  model: { default: '绑定字段' },
} as VisualEditorComponent;
