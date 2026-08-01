/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 18:51:58
 * @LastEditors: 鍗滃惎缂?
 * @Description: 鍒嗗壊绾?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\divider\index.tsx
 */
import { computed } from 'vue';
import { Divider } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorColorProp,
  createEditorSwitchProp,
  createEditorInputProp,
  createEditorSelectProp,
} from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'divider',
  moduleName: 'baseWidgets',
  label: 'Divider',
  preview: () => <Divider style="width:190px">鏂囨湰</Divider>,
  render: ({ props, block, styles }) => {
    const { registerRef } = useGlobalProperties();

    const style = computed(() => ({
      width: '100%',
      color: props['text-color'],
      borderColor: props['divider-color'],
    }));

    return () => (
      <div style={styles}>
        <Divider ref={(el) => registerRef(el, block._vid)} {...props} style={style.value}>
          {{
            default: () => props.text,
          }}
        </Divider>
      </div>
    );
  },
  props: {
    text: createEditorInputProp({ label: '灞曠ず鏂囨湰', defaultValue: '鏂囨湰' }),
    'content-position': createEditorSelectProp({
      label: '鏂囨湰浣嶇疆',
      options: [
        { label: '宸﹁竟', value: 'left' },
        { label: '涓棿', value: 'center' },
        { label: '鍙宠竟', value: 'right' },
      ],
      defaultValue: 'center',
    }),
    dashed: createEditorSwitchProp({ label: 'Dashed' }),
    'text-color': createEditorColorProp({ label: '鏂囨湰棰滆壊' }),
    'divider-color': createEditorColorProp({ label: 'Divider color' }),
  },
} as VisualEditorComponent;
