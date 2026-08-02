/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 17:14:55
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 鍗曢€夋
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\radio\index.tsx
 */
import { Field, Radio, RadioGroup } from '../../../components/LegacyWidgets';
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
  label: '表单项类型 - 单选框',
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
    modelValue: createEditorInputProp({ label: 'Default value', defaultValue: '' }),
    name: createEditorModelBindProp({ label: '字段绑定', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Radio' }),
    options: createEditorCrossSortableProp({
      label: '默认选项',
      labelPosition: 'top',
      multiple: false,
      defaultValue: [
        { label: 'Carrot', value: 'carrot' },
        { label: '白菜', value: 'cabbage' },
        { label: 'Pig', value: 'pig' },
      ],
    }),
    direction: createEditorSelectProp({
      label: '排列方向',
      options: [
        {
          label: '水平',
          value: 'horizontal',
        },
        {
          label: '垂直',
          value: 'vertical',
        },
      ],
      defaultValue: 'horizontal',
    }),
    ...createFieldProps(),
  },
  events: [{ label: 'Click', value: 'click' }],
  resize: {
    width: true,
  },
  model: {
    default: '绑定字段',
  },
} as VisualEditorComponent;
