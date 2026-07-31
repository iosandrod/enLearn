/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 21:12:46
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 閫夋嫨鍣?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\picker\index.tsx
 */
import { reactive, useAttrs } from 'vue';
import { Field, Popup, Picker } from '../../../components/VantFree';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorCrossSortableProp,
  createEditorInputProp,
  createEditorModelBindProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'picker',
  moduleName: 'baseWidgets',
  label: '琛ㄥ崟椤圭被鍨?- 閫夋嫨鍣?,
  preview: () => <Field name="picker" label="閫夋嫨鍣? placeholder={'鐐瑰嚮閫夋嫨'}></Field>,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();

    const attrs = useAttrs();

    const state = reactive({
      showPicker: false,
      text: '',
      defaultIndex: 0,
    });
    const customFieldName = {
      text: 'label',
      value: 'value',
    };

    const onConfirm = (value) => {
      props.modelValue = value.value;
      state.text = value[props.valueKey || 'text'];
      state.showPicker = false;
      console.log(props);
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
              input: () =>
                state.text?.trim() == '' ? (
                  <span class={'placeholder'}>{props.placeholder}</span>
                ) : (
                  state.text
                ),
            }}
          </Field>
          <Popup v-model={[state.showPicker, 'show']} position={'bottom'}>
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
  props: {
    modelValue: createEditorInputProp({ label: '榛樿鍊? }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: '杈撳叆妗嗗乏渚ф枃鏈?, defaultValue: '閫夋嫨鍣? }),
    columns: createEditorCrossSortableProp({
      label: '榛樿閫夐」',
      labelPosition: 'top',
      multiple: false,
      defaultValue: [
        { label: '鏉窞', value: 'hangzhou' },
        { label: '涓婃捣', value: 'shanghai' },
      ],
    }),
    placeholder: createEditorInputProp({ label: '鍗犱綅绗?, defaultValue: '璇烽€夋嫨' }),
    ...createFieldProps(),
  },
  events: [
    { label: '鐐瑰嚮瀹屾垚鎸夐挳鏃惰Е鍙?, value: 'confirm' },
    { label: '鐐瑰嚮鍙栨秷鎸夐挳鏃惰Е鍙?, value: 'cancel' },
    { label: '閫夐」鏀瑰彉鏃惰Е鍙?, value: 'change' },
  ],
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
