/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-14 10:32:21
 * @LastEditors: 鍗滃惎缂?
 * @Description: '琛ㄥ崟椤圭被鍨?- 姝ヨ繘鍣?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\stepper\index.tsx
 */
import { watchEffect } from 'vue';
import { Field, Stepper } from '../../../components/VantFree';
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
  label: '琛ㄥ崟椤圭被鍨?- 姝ヨ繘鍣?,
  preview: () => (
    <Field
      name="stepper"
      label="姝ヨ繘鍣?
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
    modelValue: createEditorInputNumberProp({ label: '榛樿鍊?, defaultValue: 0 }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: '杈撳叆妗嗗乏渚ф枃鏈?, defaultValue: '姝ヨ繘鍣? }),
    min: createEditorInputNumberProp({ label: '鏈€灏忓€?, defaultValue: 0 }),
    max: createEditorInputNumberProp({ label: '鏈€澶у€?, defaultValue: 10 }),
    ...createFieldProps(),
    allowEmpty: createEditorSwitchProp({ label: '鏄惁鍏佽杈撳叆鐨勫€间负绌?, defaultValue: false }),
    buttonSize: createEditorInputProp({
      label: '鎸夐挳澶у皬浠ュ強杈撳叆妗嗛珮搴︼紝榛樿鍗曚綅涓?px',
      defaultValue: '28px',
    }),
    decimalLength: createEditorInputProp({ label: '鍥哄畾鏄剧ず鐨勫皬鏁颁綅鏁?, defaultValue: '' }),
    defaultValue: createEditorInputProp({
      label: '鍒濆鍊硷紝褰?v-model 涓虹┖鏃剁敓鏁?,
      defaultValue: '1',
    }),
    disableInput: createEditorSwitchProp({ label: '鏄惁绂佺敤杈撳叆妗?, defaultValue: false }),
    disableMinus: createEditorSwitchProp({ label: '鏄惁绂佺敤鍑忓皯鎸夐挳', defaultValue: false }),
    disablePlus: createEditorSwitchProp({ label: '鏄惁绂佺敤澧炲姞鎸夐挳', defaultValue: false }),
    disabled: createEditorSwitchProp({ label: '鏄惁绂佺敤姝ヨ繘鍣?, defaultValue: false }),
    inputWidth: createEditorInputProp({ label: '杈撳叆妗嗗搴︼紝榛樿鍗曚綅涓?px', defaultValue: '32px' }),
    integer: createEditorSwitchProp({ label: '鏄惁鍙厑璁歌緭鍏ユ暣鏁?, defaultValue: false }),
    longPress: createEditorSwitchProp({ label: '鏄惁寮€鍚暱鎸夋墜鍔?, defaultValue: true }),
    placeholder: createEditorInputProp({ label: '杈撳叆妗嗗崰浣嶆彁绀烘枃瀛?, defaultValue: '' }),
    showInput: createEditorSwitchProp({ label: '鏄惁鏄剧ず杈撳叆妗?, defaultValue: true }),
    showMinus: createEditorSwitchProp({ label: '鏄惁鏄剧ず鍑忓皯鎸夐挳', defaultValue: true }),
    showPlus: createEditorSwitchProp({ label: '鏄惁鏄剧ず澧炲姞鎸夐挳', defaultValue: true }),
    step: createEditorInputProp({ label: '姝ラ暱锛屾瘡娆＄偣鍑绘椂鏀瑰彉鐨勫€?, defaultValue: '1' }),
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
