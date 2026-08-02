/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 17:15:05
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 璇勫垎
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\rate\index.tsx
 */
import { Field, Rate } from '../../../components/LegacyWidgets';
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
  key: 'rate',
  moduleName: 'baseWidgets',
  label: '表单项类型 - 评分',
  preview: () => (
    <Field
      name="rate"
      label="评分"
      labelWidth={50}
      v-slots={{ input: () => <Rate modelValue={3} /> }}
    ></Field>
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
              <Rate
                ref={(el) => registerRef(el, block._vid)}
                {...props}
                v-model={props.modelValue}
              ></Rate>
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputNumberProp({ label: 'Default value', defaultValue: 0 }),
    name: createEditorModelBindProp({ label: '字段绑定', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Rate' }),
    count: createEditorInputNumberProp({ label: '图标总数', defaultValue: 5 }),
    size: createEditorInputProp({ label: '图标大小' }),
    'allow-half': createEditorSwitchProp({ label: 'Allow half' }),
    ...createFieldProps(),
  },
  resize: {
    width: true,
  },
  model: {
    default: '绑定字段',
  },
} as VisualEditorComponent;
