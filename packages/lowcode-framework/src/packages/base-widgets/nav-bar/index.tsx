/*
 * @Author: 鍗滃惎缂?
 * @Date: 2021-05-04 05:36:58
 * @LastEditTime: 2021-07-13 20:34:53
 * @LastEditors: 鍗滃惎缂?
 * @Description: 瀵艰埅鏍?
 * @FilePath: \vite-vue3-lowcode\src\packages\base-widgets\nav-bar\index.tsx
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { NavBar } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { createEditorInputProp, createEditorSwitchProp } from '../../../visual-editor/visual-editor.props';
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
        draggableEl.style.position = 'fixed';
        draggableEl.style.top = '0';
        draggableEl.style.left = '0';
        draggableEl.style.width = '100%';
        dragArea.style.paddingTop = '50px';
      } else {
        document.body.style.paddingTop = '46px';
        const slotEl = compEl?.closest('__slot-item');
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
      if (dragArea) {
        dragArea.style.paddingTop = '';
      }
    });

    return () => <NavBar ref={(el) => registerRef(el, block._vid)} {...props} />;
  },
  props: {
    title: createEditorInputProp({ label: '标题', defaultValue: '标题' }),
    fixed: createEditorSwitchProp({ label: '是否固定', defaultValue: true }),
    // placeholder: createEditorSwitchProp({
    //   label: '鏄惁鐢熸垚鍗犱綅鍏冪礌',
    //   defaultValue: true,
    //   tips: '鍥哄畾鍦ㄩ《閮ㄦ椂锛屾槸鍚﹀湪鏍囩浣嶇疆鐢熸垚涓€涓瓑楂樼殑鍗犱綅鍏冪礌'
    // }),
    zIndex: createEditorInputProp({ label: 'z-index' }),
    border: createEditorSwitchProp({ label: 'Show border', defaultValue: false }),
    leftText: createEditorInputProp({ label: '左侧文案', defaultValue: '返回' }),
    rightText: createEditorInputProp({ label: '右侧文案', defaultValue: '按钮' }),
    leftArrow: createEditorSwitchProp({ label: '是否显示左侧箭头', defaultValue: true }),
  },
  events: [
    { label: 'Click left', value: 'click-left' },
    { label: 'Click right', value: 'click-right' },
  ],
  showStyleConfig: false,
  draggable: false,
  resize: {
    width: true,
  },
} as VisualEditorComponent;
