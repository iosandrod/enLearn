import { onMounted, onBeforeUnmount } from 'vue';
import { Tabbar, TabbarItem } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import { BASE_URL } from '../../../visual-editor/utils';

const defaultTabbarItems = [
  { icon: 'home-o', title: '首页' },
  { icon: 'apps-o', title: '导航' },
  { icon: 'user-o', title: '我的' },
];

export default {
  key: 'tabbar',
  moduleName: 'baseWidgets',
  label: 'Tabbar',
  preview: () => (
    <Tabbar>
      {defaultTabbarItems.map((item) => <TabbarItem icon={item.icon}>{item.title}</TabbarItem>)}
    </Tabbar>
  ),
  render: ({ props, block }) => {
    const { registerRef } = useGlobalProperties();
    onMounted(() => {
      const compEl = window.$$refs[block._vid]?.$el;
      const draggableEl = compEl?.closest('div[data-draggable]') as HTMLElement | null;
      const dragArea = document.querySelector('.simulator-editor-content > .dragArea ') as HTMLDivElement;
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
        const slotEl = compEl?.closest('__slot-item') as HTMLElement | null;
        if (slotEl) {
          slotEl.style.position = 'fixed';
          slotEl.style.bottom = '0';
        }
      }
    });
    onBeforeUnmount(() => {
      const dragArea = document.querySelector('.simulator-editor-content > .dragArea ') as HTMLDivElement;
      if (dragArea) dragArea.style.paddingBottom = '';
    });
    return () => (
      <Tabbar ref={(el) => registerRef(el, block._vid)} v-model={props.modelValue} {...props}>
        {props.tabs?.map((item) => {
          const itemProps = item.block?.props;
          const url = `${BASE_URL}${props.baseUrl}${itemProps.url}`.replace(/\/{2,}/g, '/');
          return <TabbarItem name={item.value} key={item.value} {...itemProps} url={url}>{item.label}</TabbarItem>;
        })}
      </Tabbar>
    );
  },
  events: [
    { label: 'Click left', value: 'click-left' },
    { label: 'Click right', value: 'click-right' },
  ],
  draggable: false,
  resize: { width: true },
} as VisualEditorComponent;
