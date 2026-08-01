/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 17:14:05
 * @LastEditors: 鍗滃惎缂?
 * @Description: 鍥剧墖缁勪欢
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\image\index.tsx
 */
import { Image } from '../../../components/LegacyWidgets';
import { Picture } from '../../../visual-editor/components/common/remix-icons';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorSelectProp,
  createEditorSwitchProp,
} from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'image',
  moduleName: 'baseWidgets',
  label: '鍥剧墖',
  resize: {
    width: true,
    height: true,
  },
  preview: () => (
    <div style="text-align:center;">
      <div style="font-size:20px;background-color:#f2f2f2;color:#ccc;display:inline-flex;width:100px;height:50px;align-items:center;justify-content:center">
        <span class="lc-remix-icon-slot">
          <Picture></Picture>
        </span>
      </div>
    </div>
  ),
  render: ({ props, block, styles }) => {
    const { registerRef } = useGlobalProperties();

    return () => (
      <div style={styles}>
        <Image ref={(el) => registerRef(el, block._vid)} {...props} />
      </div>
    );
  },
  props: {
    src: createEditorInputProp({
      label: '鍥剧墖閾炬帴',
      defaultValue: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=600&q=80',
    }),
    width: createEditorInputProp({ label: '瀹藉害', defaultValue: 100 }),
    height: createEditorInputProp({ label: '楂樺害', defaultValue: 100 }),
    errorIcon: createEditorInputProp({ label: 'Error icon' }),
    fit: createEditorSelectProp({
      label: '鍥剧墖濉厖妯″紡',
      options: [
        {
          label: '淇濇寔瀹介珮缂╂斁鍥剧墖锛屼娇鍥剧墖鐨勯暱杈硅兘瀹屽叏鏄剧ず鍑烘潵',
          value: 'contain',
        },
        {
          label: 'Cover image and crop overflow',
          value: 'cover',
        },
        {
          label: '鎷変几鍥剧墖锛屼娇鍥剧墖濉弧鍏冪礌',
          value: 'fill',
        },
        {
          label: '淇濇寔鍥剧墖鍘熸湁灏哄',
          value: 'none',
        },
        {
          label: 'Scale down',
          value: 'scale-down',
        },
      ],
      defaultValue: 'fill',
    }),
    iconPrefix: createEditorInputProp({
      label: '鍥炬爣绫诲悕鍓嶇紑',
      tips: 'Icon class prefix',
    }),
    iconSize: createEditorInputProp({ label: '鍔犺浇鍥炬爣鍜屽け璐ュ浘鏍囩殑澶у皬' }),
    deferLoad: createEditorSwitchProp({
      label: '鏄惁寮€鍚浘鐗囨噿鍔犺浇',
      tips: '启用图片懒加载',
    }),
    loadingIcon: createEditorInputProp({ label: 'Loading icon' }),
    radius: createEditorInputProp({ label: '鍦嗚澶у皬', tips: '榛樿鍗曚綅涓?px' }),
    round: createEditorSwitchProp({ label: 'Round' }),
    'show-error': createEditorSwitchProp({ label: '鏄惁灞曠ず鍥剧墖鍔犺浇澶辫触鎻愮ず' }),
    'show-loading': createEditorSwitchProp({ label: 'Show loading' }),
    alt: createEditorInputProp({ label: '鏇夸唬鏂囨湰' }),
  },
  events: [
    { label: 'Click', value: 'click' },
    { label: 'Load', value: 'load' },
    { label: 'Error', value: 'error' },
  ],
} as VisualEditorComponent;
