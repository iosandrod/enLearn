import { reactive, useAttrs } from 'vue';
import { Field, Popup, Picker } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'picker',
  moduleName: 'baseWidgets',
  label: 'Picker',
  preview: () => <Field name="picker" label="Picker" placeholder="Select" />,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();
    const attrs = useAttrs();
    const state = reactive({ showPicker: false, text: '', defaultIndex: 0 });
    const customFieldName = { text: 'label', value: 'value' };

    const onConfirm = (value) => {
      props.modelValue = value.value;
      state.text = value[props.valueKey || 'text'];
      state.showPicker = false;
    };

    return () => {
      if (props.modelValue) {
        state.defaultIndex = props.columns?.findIndex((item) => item.value == props.modelValue);
        state.text = props.columns[state.defaultIndex]?.label;
      }
      return (
        <div style={styles}>
          <Field
            v-model={props.modelValue}
            {...props}
            readonly
            clickable
            onClick={() => (state.showPicker = true)}
            name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          >
            {{
              input: () => state.text?.trim() === ''
                ? <span class="placeholder">{props.placeholder}</span>
                : state.text,
            }}
          </Field>
          <Popup v-model={[state.showPicker, 'show']} position="bottom">
            <Picker
              ref={(el) => registerRef(el, block._vid)}
              {...props}
              {...attrs}
              defaultIndex={state.defaultIndex}
              columnsFieldNames={customFieldName}
              onConfirm={onConfirm}
              onCancel={() => (state.showPicker = false)}
            />
          </Popup>
        </div>
      );
    };
  },
  events: [
    { label: 'Confirm', value: 'confirm' },
    { label: 'Cancel', value: 'cancel' },
    { label: 'Change', value: 'change' },
  ],
  resize: { width: true },
  model: { default: '绑定字段' },
} as VisualEditorComponent;
