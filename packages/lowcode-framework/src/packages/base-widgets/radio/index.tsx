/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 17:14:55
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 鍗曢€夋
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\radio\index.tsx
 */
import { Field, Radio, RadioGroup } from '../../../components/VantFree';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorCrossSortableProp,
  createEditorInputProp,
  createEditorModelBindProp,
  createEditorSelectProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'radio',
  moduleName: 'baseWidgets',
  label: '琛ㄥ崟椤圭被鍨?- 鍗曢€夋',
  preview: () => (
    <RadioGroup modelValue={'1'} direction={'horizontal'}>
      <Radio name="1">one</Radio>
      <Radio name="2">two</Radio>
    </RadioGroup>
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();

    return () => (
      <div style={styles}>
        <Field
          {...props}
          modelValue={''}
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{
            input: () => (
              <RadioGroup
                ref={(el) => registerRef(el, block._vid)}
                {...props}
                v-model={props.modelValue}
              >
                {props.options?.map((item) => (
                  <Radio name={item.value} style={{ marginBottom: '5px' }}>
                    {item.label}
                  </Radio>
                ))}
              </RadioGroup>
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputProp({ label: '榛樿鍊?, defaultValue: '' }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: '杈撳叆妗嗗乏渚ф枃鏈?, defaultValue: '鍗曢€夋' }),
    options: createEditorCrossSortableProp({
      label: '榛樿閫夐」',
      labelPosition: 'top',
      multiple: false,
      defaultValue: [
        { label: '鑳¤悵鍗?, value: 'carrot' },
        { label: '鐧借彍', value: 'cabbage' },
        { label: '鐚?, value: 'pig' },
      ],
    }),
    direction: createEditorSelectProp({
      label: '鎺掑垪鏂瑰悜',
      options: [
        {
          label: '姘村钩',
          value: 'horizontal',
        },
        {
          label: '鍨傜洿',
          value: 'vertical',
        },
      ],
      defaultValue: 'horizontal',
    }),
    ...createFieldProps(),
  },
  events: [{ label: '鐐瑰嚮鍗曢€夋鏃惰Е鍙?, value: 'click' }],
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
