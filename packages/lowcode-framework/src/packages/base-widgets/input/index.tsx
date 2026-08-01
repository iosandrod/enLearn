/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-05-04 05:36:58
 * @LastEditTime: 2021-07-14 10:31:10
 * @LastEditors: 鍗滃惎缂?
 * @Description: 琛ㄥ崟椤圭被鍨?- 杈撳叆妗?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\input\index.tsx
 */
import { Field } from '../../../components/LegacyWidgets';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'input',
  moduleName: 'baseWidgets',
  label: 'Input',
  preview: () => (
    <Field name="username" label="Username" labelWidth={50} colon placeholder="Enter username" />
  ),
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();

    let rules = [];
    try {
      rules = JSON.parse(props.rules);
    } catch (e) {}

    return () => (
      <div style={styles}>
        <Field
          ref={(el) => registerRef(el, block._vid)}
          {...props}
          v-model={props.modelValue}
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          rules={rules}
        />
      </div>
    );
  },
  events: [
    { label: '杈撳叆妗嗗唴瀹瑰彉鍖栨椂瑙﹀彂', value: 'update:model-value' },
    { label: '杈撳叆妗嗚幏寰楃劍鐐规椂瑙﹀彂', value: 'focus' },
    { label: '杈撳叆妗嗗け鍘荤劍鐐规椂瑙﹀彂', value: 'blur' },
    { label: 'Clear', value: 'clear' },
    { label: 'Click', value: 'click' },
    { label: 'Click input', value: 'click-input' },
    { label: 'Click left icon', value: 'click-left-icon' },
    { label: 'Click right icon', value: 'click-right-icon' },
  ],
  props: createFieldProps(),
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
