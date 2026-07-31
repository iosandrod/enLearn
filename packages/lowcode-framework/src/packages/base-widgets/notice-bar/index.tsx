/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-14 12:24:12
 * @LastEditTime: 2021-07-13 17:14:20
 * @LastEditors: 鍗滃惎缂?
 * @Description:
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\notice-bar\index.tsx
 */
import { NoticeBar } from '../../../components/VantFree';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'NoticeBar',
  moduleName: 'baseWidgets',
  label: '閫氱煡鏍?,
  preview: () => (
    <NoticeBar
      style={{ width: '180px' }}
      leftIcon={'volume-o'}
      text={'鍦ㄤ唬鐮侀槄璇昏繃绋嬩腑浜轰滑璇磋剰璇濈殑棰戠巼鏄　閲忎唬鐮佽川閲忕殑鍞竴鏍囧噯銆?}
    />
  ),
  render: ({ block, props, styles }) => {
    const { registerRef } = useGlobalProperties();

    return () => (
      <div style={styles}>
        <NoticeBar ref={(el) => registerRef(el, block._vid)} style={{ width: '100%' }} {...props} />
      </div>
    );
  },
  events: [
    { label: '鐐瑰嚮閫氱煡鏍忔椂瑙﹀彂', value: 'click' },
    { label: '鍏抽棴閫氱煡鏍忔椂瑙﹀彂', value: 'close' },
    { label: '姣忓綋婊氬姩鏍忛噸鏂板紑濮嬫粴鍔ㄦ椂瑙﹀彂', value: 'replay' },
  ],
  props: createFieldProps(),
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
