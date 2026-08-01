/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 20:26:04
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 澶嶉€夋
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\checkbox\index.tsx
 */
import { computed } from 'vue';
import { Field, Checkbox, CheckboxGroup } from '../../../components/LegacyWidgets';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorInputProp,
  createEditorSelectProp,
  createEditorCrossSortableProp,
  createEditorModelBindProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'checkbox',
  moduleName: 'baseWidgets',
  label: '琛ㄥ崟椤圭被鍨?- 澶嶉€夋',
  preview: () => (
    <CheckboxGroup modelValue={['1']} direction={'horizontal'}>
      <Checkbox name="1" shape="square">
        one
      </Checkbox>
      <Checkbox name="2" shape="square">
        two
      </Checkbox>
    </CheckboxGroup>
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();

    const checkList = computed({
      get() {
        return typeof props.modelValue === 'string'
          ? props.modelValue.split(',')
          : props.modelValue;
      },
      set: (val) => (props.modelValue = val),
    });

    return () => (
      <div style={styles}>
        <Field
          {...props}
          modelValue={''}
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{
            input: () => (
              <CheckboxGroup
                ref={(el) => registerRef(el, block._vid)}
                {...props}
                v-model={checkList.value}
              >
                {props.options?.map((item) => (
                  <Checkbox name={item.value} style={{ marginBottom: '5px' }} shape="square">
                    {item.label}
                  </Checkbox>
                ))}
              </CheckboxGroup>
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputProp({
      label: 'Default value',
      defaultValue: [],
    }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Checkbox' }),
    options: createEditorCrossSortableProp({
      label: '榛樿閫夐」',
      labelPosition: 'top',
      multiple: true,
      defaultValue: [
        { label: 'Carrot', value: 'carrot' },
        { label: '鐧借彍', value: 'cabbage' },
        { label: 'Pig', value: 'pig' },
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
  events: [
    { label: 'Change', value: 'change' },
    { label: 'Click', value: 'click' },
  ],
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
