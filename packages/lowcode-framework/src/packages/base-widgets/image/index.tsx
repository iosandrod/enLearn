/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-06-01 09:45:21
 * @LastEditTime: 2021-07-13 17:14:05
 * @LastEditors: 鍗滃惎缂?
 * @Description: 鍥剧墖缁勪欢
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\image\index.tsx
 */
import { Image } from '../../../components/VantFree';
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
      defaultValue: 'https://img.yzcdn.cn/vant/cat.jpeg',
    }),
    width: createEditorInputProp({ label: '瀹藉害', defaultValue: 100 }),
    height: createEditorInputProp({ label: '楂樺害', defaultValue: 100 }),
    errorIcon: createEditorInputProp({ label: '澶辫触鏃舵彁绀虹殑鍥炬爣鍚嶇О鎴栧浘鐗囬摼鎺? }),
    fit: createEditorSelectProp({
      label: '鍥剧墖濉厖妯″紡',
      options: [
        {
          label: '淇濇寔瀹介珮缂╂斁鍥剧墖锛屼娇鍥剧墖鐨勯暱杈硅兘瀹屽叏鏄剧ず鍑烘潵',
          value: 'contain',
        },
        {
          label: '淇濇寔瀹介珮缂╂斁鍥剧墖锛屼娇鍥剧墖鐨勭煭杈硅兘瀹屽叏鏄剧ず鍑烘潵锛岃鍓暱杈?,
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
          label: '鍙?none 鎴?contain 涓緝灏忕殑涓€涓?,
          value: 'scale-down',
        },
      ],
      defaultValue: 'fill',
    }),
    iconPrefix: createEditorInputProp({
      label: '鍥炬爣绫诲悕鍓嶇紑',
      tips: '鍥炬爣绫诲悕鍓嶇紑锛屽悓 Icon 缁勪欢鐨?class-prefix 灞炴€?,
    }),
    iconSize: createEditorInputProp({ label: '鍔犺浇鍥炬爣鍜屽け璐ュ浘鏍囩殑澶у皬' }),
    lazyLoad: createEditorSwitchProp({
      label: '鏄惁寮€鍚浘鐗囨噿鍔犺浇',
      tips: '椤婚厤鍚?Lazyload 缁勪欢浣跨敤',
    }),
    loadingIcon: createEditorInputProp({ label: '鍔犺浇鏃舵彁绀虹殑鍥炬爣鍚嶇О鎴栧浘鐗囬摼鎺? }),
    radius: createEditorInputProp({ label: '鍦嗚澶у皬', tips: '榛樿鍗曚綅涓?px' }),
    round: createEditorSwitchProp({ label: '鏄惁鏄剧ず涓哄渾褰? }),
    'show-error': createEditorSwitchProp({ label: '鏄惁灞曠ず鍥剧墖鍔犺浇澶辫触鎻愮ず' }),
    'show-loading': createEditorSwitchProp({ label: '鏄惁灞曠ず鍥剧墖鍔犺浇涓彁绀? }),
    alt: createEditorInputProp({ label: '鏇夸唬鏂囨湰' }),
  },
  events: [
    { label: '鐐瑰嚮鍥剧墖鏃惰Е鍙?, value: 'click' },
    { label: '鍥剧墖鍔犺浇瀹屾瘯鏃惰Е鍙?, value: 'load' },
    { label: '鍥剧墖鍔犺浇澶辫触鏃惰Е鍙?, value: 'error' },
  ],
} as VisualEditorComponent;
