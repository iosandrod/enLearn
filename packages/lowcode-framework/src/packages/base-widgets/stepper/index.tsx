import { watchEffect } from 'vue';
import { Field, Stepper } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'stepper',
  moduleName: 'baseWidgets',
  label: 'Stepper',
  preview: () => (
    <Field name="stepper" label="Stepper" labelWidth={50} v-slots={{ input: () => <Stepper modelValue={3} /> }} />
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    watchEffect(() => {
      props.name = Array.isArray(props.name) ? [...props.name].pop() : props.name;
    });
    return () => (
      <div style={styles}>
        <Field
          {...props}
          modelValue=""
          v-slots={{
            input: () => (
              <Stepper ref={(el) => registerRef(el, block._vid)} v-model={props.modelValue} {...props} />
            ),
          }}
        />
      </div>
    );
  },
  resize: { width: true },
  model: { default: '绑定字段' },
} as VisualEditorComponent;
