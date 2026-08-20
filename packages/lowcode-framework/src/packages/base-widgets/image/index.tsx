/*
 * @Description: 图片组件
 */
import { Image } from '../../../components/LegacyWidgets';
import { Picture } from '../../../visual-editor/components/common/remix-icons';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'image',
  moduleName: 'baseWidgets',
  label: '图片',
  resize: {
    width: true,
    height: true,
  },
  preview: () => (
    <div style="text-align:center;">
      <div style="font-size:20px;background-color:#f2f2f2;color:#ccc;display:inline-flex;width:100px;height:50px;align-items:center;justify-content:center">
        <span class="lc-remix-icon-slot">
          <Picture />
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
  events: [
    { label: 'Click', value: 'click' },
    { label: 'Load', value: 'load' },
    { label: 'Error', value: 'error' },
  ],
} as VisualEditorComponent;
