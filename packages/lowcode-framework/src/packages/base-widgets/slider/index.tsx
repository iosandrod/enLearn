/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 17:15:15
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 婊戝潡
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\slider\index.tsx
 */
import { Field, Slider } from '../../../components/LegacyWidgets';
import { omit } from 'lodash-es';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorInputNumberProp,
  createEditorInputProp,
  createEditorModelBindProp,
  createEditorSwitchProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'slider',
  moduleName: 'baseWidgets',
  label: '琛ㄥ崟椤圭被鍨?- 婊戝潡',
  preview: () => (
    <Field
      name="rate"
      label="婊戝潡"
      labelWidth={50}
      v-slots={{ input: () => <Slider modelValue={3} /> }}
    ></Field>
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
              <Slider
                ref={(el) => registerRef(el, block._vid)}
                {...props}
                v-model={props.modelValue}
              ></Slider>
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputNumberProp({ label: 'Default value', defaultValue: 0 }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Slider' }),
    min: createEditorInputNumberProp({ label: 'Min value' }),
    max: createEditorInputNumberProp({ label: 'Max value', defaultValue: 10 }),
    size: createEditorInputNumberProp({ label: '鍥炬爣澶у皬' }),
    range: createEditorSwitchProp({ label: '鏄惁寮€鍚弻婊戝潡妯″紡' }),
    ...createFieldProps(),
  },
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
