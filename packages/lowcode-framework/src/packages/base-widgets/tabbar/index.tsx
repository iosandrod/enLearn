/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-05-04 05:36:58
 * @LastEditTime: 2021-07-13 20:34:46
 * @LastEditors: 鍗滃惎缂?
 * @Description: 瀵艰埅鏍?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\tabbar\index.tsx
 */
import { onMounted, onBeforeUnmount } from 'vue';
import { Tabbar, TabbarItem } from '../../../components/LegacyWidgets';
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
    title: '首页',
  },
  {
    icon: 'apps-o',
    title: '导航',
  },
  {
    icon: 'user-o',
    title: '我的',
  },
];

export default {
  key: 'tabbar',
  moduleName: 'baseWidgets',
  label: 'Tabbar',
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
      label: 'Active tab name or index',
      defaultValue: '',
    }),
    tabs: createEditorCrossSortableProp({
      label: '默认选项',
      labelPosition: 'top',
      multiple: false,
      showItemPropsConfig: true,
      defaultValue: defaultTabbarItems.map((item) => {
        const block = createNewBlock(getTabbarItem());
        block.props.icon = item.icon;
        return { label: item.title, value: item.icon, component: getTabbarItem(), block };
      }),
    }),
    fixed: createEditorSwitchProp({ label: 'Fixed bottom', defaultValue: true }),
    border: createEditorSwitchProp({ label: 'Show border', defaultValue: true }),
    zIndex: createEditorInputProp({ label: '元素 z-index', defaultValue: '1' }),
    baseUrl: createEditorInputProp({ label: '路由路径前缀', defaultValue: '/preview/#/' }),
    activeColor: createEditorColorProp({ label: 'Active color', defaultValue: '#1989fa' }),
    inactiveColor: createEditorColorProp({ label: 'Inactive color', defaultValue: '#7d7e80' }),
    route: createEditorSwitchProp({ label: 'Route mode', defaultValue: false }),
    // placeholder: createEditorSwitchProp({
    //   label: '鍥哄畾鍦ㄥ簳閮ㄦ椂锛屾槸鍚﹀湪鏍囩浣嶇疆鐢熸垚涓€涓瓑楂樼殑鍗犱綅鍏冪礌',
    //   defaultValue: true
    // }),
    safeAreaInsetBottom: createEditorSwitchProp({
      label: 'Enable bottom safe area inset',
      defaultValue: false,
    }),
  },
  events: [
    { label: 'Click left', value: 'click-left' },
    { label: 'Click right', value: 'click-right' },
  ],
  draggable: false,
  resize: {
    width: true,
  },
} as VisualEditorComponent;
