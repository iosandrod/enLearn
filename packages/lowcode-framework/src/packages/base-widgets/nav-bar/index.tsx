import { onBeforeUnmount, onMounted } from 'vue';
import { NavBar } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'nav-bar',
  moduleName: 'baseWidgets',
  label: 'Nav bar',
  preview: () => (
    <NavBar title="标题" left-text="返回" right-text="按钮" left-arrow style={{ width: '100%' }} />
  ),
  render: ({ props, block }) => {
    const { registerRef } = useGlobalProperties();

    onMounted(() => {
      const compEl = window.$$refs[block._vid]?.$el;
      const draggableEl = compEl?.closest('div[data-draggable]');
      const navbarEl = draggableEl?.querySelector('.van-nav-bar--fixed') as HTMLDivElement;
      const dragArea = document.querySelector(
        '.simulator-editor-content > .dragArea ',
      ) as HTMLDivElement;
      if (draggableEl && navbarEl && dragArea) {
        navbarEl.style.position = 'unset';
        (draggableEl as HTMLElement).style.position = 'fixed';
        (draggableEl as HTMLElement).style.top = '0';
        (draggableEl as HTMLElement).style.left = '0';
        (draggableEl as HTMLElement).style.width = '100%';
        dragArea.style.paddingTop = '50px';
      } else {
        document.body.style.paddingTop = '46px';
        const slotEl = compEl?.closest('__slot-item') as HTMLElement | null;
        if (slotEl) {
          slotEl.style.position = 'fixed';
          slotEl.style.bottom = '0';
        }
      }
    });

    onBeforeUnmount(() => {
      const dragArea = document.querySelector(
        '.simulator-editor-content > .dragArea ',
      ) as HTMLDivElement;
      if (dragArea) dragArea.style.paddingTop = '';
    });

    return () => <NavBar ref={(el) => registerRef(el, block._vid)} {...props} />;
  },
  events: [
    { label: 'Click left', value: 'click-left' },
    { label: 'Click right', value: 'click-right' },
  ],
  showStyleConfig: false,
  draggable: false,
  resize: { width: true },
} as VisualEditorComponent;
