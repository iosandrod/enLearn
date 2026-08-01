/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-14 10:32:21
 * @LastEditors: 鍗滃惎缂?
 * @Description: '琛ㄥ崟椤圭被鍨?- 姝ヨ繘鍣?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\stepper\index.tsx
 */
import { watchEffect } from 'vue';
import { Field, Stepper } from '../../../components/LegacyWidgets';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorInputNumberProp,
  createEditorInputProp,
  createEditorSwitchProp,
  createEditorSelectProp,
  createEditorModelBindProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'stepper',
  moduleName: 'baseWidgets',
  label: 'Stepper',
  preview: () => (
    <Field
      name="stepper"
      label="Stepper"
      labelWidth={50}
      v-slots={{ input: () => <Stepper modelValue={3} /> }}
    ></Field>
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
          modelValue={''}
          v-slots={{
            input: () => (
              <Stepper
                ref={(el) => registerRef(el, block._vid)}
                v-model={props.modelValue}
                {...props}
              ></Stepper>
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputNumberProp({ label: 'Default value', defaultValue: 0 }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Stepper' }),
    min: createEditorInputNumberProp({ label: 'Min value', defaultValue: 0 }),
    max: createEditorInputNumberProp({ label: 'Max value', defaultValue: 10 }),
    ...createFieldProps(),
    allowEmpty: createEditorSwitchProp({ label: 'Allow empty', defaultValue: false }),
    buttonSize: createEditorInputProp({
      label: '鎸夐挳澶у皬浠ュ強杈撳叆妗嗛珮搴︼紝榛樿鍗曚綅涓?px',
      defaultValue: '28px',
    }),
    decimalLength: createEditorInputProp({ label: 'Decimal length', defaultValue: '' }),
    defaultValue: createEditorInputProp({
      label: 'Initial value when v-model is empty',
      defaultValue: '1',
    }),
    disableInput: createEditorSwitchProp({ label: 'Disable input', defaultValue: false }),
    disableMinus: createEditorSwitchProp({ label: '鏄惁绂佺敤鍑忓皯鎸夐挳', defaultValue: false }),
    disablePlus: createEditorSwitchProp({ label: '鏄惁绂佺敤澧炲姞鎸夐挳', defaultValue: false }),
    disabled: createEditorSwitchProp({ label: 'Disabled', defaultValue: false }),
    inputWidth: createEditorInputProp({ label: '杈撳叆妗嗗搴︼紝榛樿鍗曚綅涓?px', defaultValue: '32px' }),
    integer: createEditorSwitchProp({ label: 'Integer only', defaultValue: false }),
    longPress: createEditorSwitchProp({ label: 'Long press', defaultValue: true }),
    placeholder: createEditorInputProp({ label: 'Placeholder', defaultValue: '' }),
    showInput: createEditorSwitchProp({ label: 'Show input', defaultValue: true }),
    showMinus: createEditorSwitchProp({ label: '鏄惁鏄剧ず鍑忓皯鎸夐挳', defaultValue: true }),
    showPlus: createEditorSwitchProp({ label: '鏄惁鏄剧ず澧炲姞鎸夐挳', defaultValue: true }),
    step: createEditorInputProp({ label: 'Step', defaultValue: '1' }),
    theme: createEditorSelectProp({
      label: '鏍峰紡椋庢牸',
      options: [
        {
          label: '榛樿',
          value: '',
        },
        { label: '鍦嗚椋庢牸', value: 'round' },
      ],
      defaultValue: '',
    }),
  },
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
