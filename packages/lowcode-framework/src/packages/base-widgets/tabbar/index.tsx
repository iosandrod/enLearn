/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-05-04 05:36:58
 * @LastEditTime: 2021-07-13 20:34:46
 * @LastEditors: 鍗滃惎缂?
 * @Description: 瀵艰埅鏍?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\tabbar\index.tsx
 */
import { onMounted, onBeforeUnmount } from 'vue';
import { Tabbar, TabbarItem } from '../../../components/VantFree';
import { getTabbarItem } from './tabbar-item';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorCrossSortableProp,
  createEditorInputProp,
  createEditorSwitchProp,
  createEditorColorProp,
} from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import { createNewBlock } from '../../../visual-editor/visual-editor.utils';
import { BASE_URL } from '../../../visual-editor/utils';

const defaultTabbarItems = [
  {
    icon: 'home-o',
    title: '棣栭〉',
  },
  {
    icon: 'apps-o',
    title: '瀵艰埅',
  },
  {
    icon: 'user-o',
    title: '鎴戠殑',
  },
];

export default {
  key: 'tabbar',
  moduleName: 'baseWidgets',
  label: '搴曢儴鏍囩鏍?,
  preview: () => (
    <Tabbar>
      {defaultTabbarItems.map((item) => (
        <TabbarItem icon={item.icon}>{item.title}</TabbarItem>
      ))}
    </Tabbar>
  ),
  render: ({ props, block }) => {
    const { registerRef } = useGlobalProperties();

    onMounted(() => {
      const compEl = window.$$refs[block._vid]?.$el;
      const draggableEl = compEl?.closest('div[data-draggable]');
      const dragArea: HTMLDivElement = document.querySelector(
        '.simulator-editor-content > .dragArea ',
      )!;
      const tabbarEl = draggableEl?.querySelector('.van-tabbar') as HTMLDivElement;
      if (draggableEl && tabbarEl && dragArea) {
        tabbarEl.style.position = 'unset';
        draggableEl.style.position = 'fixed';
        draggableEl.style.bottom = '0';
        draggableEl.style.left = '0';
        draggableEl.style.width = '100%';
        draggableEl.style.zIndex = '1000';
        dragArea.style.paddingBottom = '56px';
      } else {
        document.body.style.paddingBottom = '50px';
        const slotEl = compEl?.closest('__slot-item');
        if (slotEl) {
          slotEl.style.position = 'fixed';
          slotEl.style.bottom = '0';
        }
      }
    });

    onBeforeUnmount(() => {
      const dragArea: HTMLDivElement = document.querySelector(
        '.simulator-editor-content > .dragArea ',
      )!;
      if (dragArea) {
        dragArea.style.paddingBottom = '';
      }
    });

    return () => (
      <Tabbar ref={(el) => registerRef(el, block._vid)} v-model={props.modelValue} {...props}>
        {props.tabs?.map((item) => {
          const itemProps = item.block?.props;
          const url = `${BASE_URL}${props.baseUrl}${itemProps.url}`.replace(/\/{2,}/g, '/');
          return (
            <TabbarItem name={item.value} key={item.value} {...itemProps} url={url}>
              {item.label}
            </TabbarItem>
          );
        })}
      </Tabbar>
    );
  },
  props: {
    modelValue: createEditorInputProp({
      label: '褰撳墠閫変腑鏍囩鐨勫悕绉版垨绱㈠紩鍊?,
      defaultValue: '',
    }),
    tabs: createEditorCrossSortableProp({
      label: '榛樿閫夐」',
      labelPosition: 'top',
      multiple: false,
      showItemPropsConfig: true,
      defaultValue: defaultTabbarItems.map((item) => {
        const block = createNewBlock(getTabbarItem());
        block.props.icon = item.icon;
        return { label: item.title, value: item.icon, component: getTabbarItem(), block };
      }),
    }),
    fixed: createEditorSwitchProp({ label: '鏄惁鍥哄畾鍦ㄥ簳閮?, defaultValue: true }),
    border: createEditorSwitchProp({ label: '鏄惁鏄剧ず澶栬竟妗?, defaultValue: true }),
    zIndex: createEditorInputProp({ label: '鍏冪礌 z-index', defaultValue: '1' }),
    baseUrl: createEditorInputProp({ label: '璺敱璺緞鍓嶇紑', defaultValue: '/preview/#/' }),
    activeColor: createEditorColorProp({ label: '閫変腑鏍囩鐨勯鑹?, defaultValue: '#1989fa' }),
    inactiveColor: createEditorColorProp({ label: '鏈€変腑鏍囩鐨勯鑹?, defaultValue: '#7d7e80' }),
    route: createEditorSwitchProp({ label: '鏄惁寮€鍚矾鐢辨ā寮?, defaultValue: false }),
    // placeholder: createEditorSwitchProp({
    //   label: '鍥哄畾鍦ㄥ簳閮ㄦ椂锛屾槸鍚﹀湪鏍囩浣嶇疆鐢熸垚涓€涓瓑楂樼殑鍗犱綅鍏冪礌',
    //   defaultValue: true
    // }),
    safeAreaInsetBottom: createEditorSwitchProp({
      label: '鏄惁寮€鍚簳閮ㄥ畨鍏ㄥ尯閫傞厤锛岃缃?fixed 鏃堕粯璁ゅ紑鍚?,
      defaultValue: false,
    }),
  },
  events: [
    { label: '鐐瑰嚮宸︿晶鎸夐挳鏃惰Е鍙?, value: 'click-left' },
    { label: '鐐瑰嚮鍙充晶鎸夐挳鏃惰Е鍙?, value: 'click-right' },
  ],
  draggable: false,
  resize: {
    width: true,
  },
} as VisualEditorComponent;
