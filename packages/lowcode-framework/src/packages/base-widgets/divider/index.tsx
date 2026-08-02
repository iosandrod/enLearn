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
  preview: () => <Divider style="width:190px">文本</Divider>,
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
    text: createEditorInputProp({ label: '展示文本', defaultValue: '文本' }),
    'content-position': createEditorSelectProp({
      label: '文本位置',
      options: [
        { label: '左边', value: 'left' },
        { label: '中间', value: 'center' },
        { label: '右边', value: 'right' },
      ],
      defaultValue: 'center',
    }),
    dashed: createEditorSwitchProp({ label: 'Dashed' }),
    'text-color': createEditorColorProp({ label: '文本颜色' }),
    'divider-color': createEditorColorProp({ label: 'Divider color' }),
  },
} as VisualEditorComponent;
