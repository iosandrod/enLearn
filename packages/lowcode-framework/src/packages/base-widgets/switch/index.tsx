/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 18:20:55
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 寮€鍏?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\switch\index.tsx
 */
import { Field, Switch } from '../../../components/LegacyWidgets';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorInputProp,
  createEditorSwitchProp,
  createEditorColorProp,
  createEditorModelBindProp,
} from '../../../visual-editor/visual-editor.props';

export default {
  key: 'switch',
  moduleName: 'baseWidgets',
  label: 'Switch',
  preview: () => (
    <Field name="switch" label="Switch" v-slots={{ input: () => <Switch size={20} /> }} />
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
              <Switch
                ref={(el) => registerRef(el, block._vid)}
                {...props}
                v-model={props.modelValue}
              />
            ),
          }}
        />
      </div>
    );
  },
  props: {
    modelValue: createEditorInputProp({ label: 'Default value', defaultValue: 'false' }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Switch' }),
    activeColor: createEditorColorProp({ label: 'Active color' }),
    activeValue: createEditorInputProp({ label: 'Active value', defaultValue: 'true' }),
    inactiveColor: createEditorColorProp({ label: 'Inactive color' }),
    inactiveValue: createEditorInputProp({ label: 'Inactive value', defaultValue: 'false' }),
    disabled: createEditorSwitchProp({ label: 'Disabled' }),
    loading: createEditorSwitchProp({ label: 'Loading' }),
    size: createEditorInputProp({ label: 'Size', defaultValue: '20px' }),
    ...createFieldProps(),
  },
  events: [
    { label: '寮€鍏崇姸鎬佸垏鎹㈡椂瑙﹀彂', value: 'change' },
    { label: 'Click', value: 'click' },
  ],
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
