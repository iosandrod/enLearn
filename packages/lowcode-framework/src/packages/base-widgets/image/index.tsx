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
  label: '图片',
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
      label: '图片链接',
      defaultValue: 'https://images.unsplash.com/photo-1518791841217-8f162f1e1131?auto=format&fit=crop&w=600&q=80',
    }),
    width: createEditorInputProp({ label: '宽度', defaultValue: 100 }),
    height: createEditorInputProp({ label: '高度', defaultValue: 100 }),
    errorIcon: createEditorInputProp({ label: 'Error icon' }),
    fit: createEditorSelectProp({
      label: '图片填充模式',
      options: [
        {
          label: '保持宽高缩放图片，使图片的长边能完全显示出来',
          value: 'contain',
        },
        {
          label: 'Cover image and crop overflow',
          value: 'cover',
        },
        {
          label: '拉伸图片，使图片填满元素',
          value: 'fill',
        },
        {
          label: '保持图片原有尺寸',
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
      label: '图标类名前缀',
      tips: 'Icon class prefix',
    }),
    iconSize: createEditorInputProp({ label: '加载图标和失败图标的大小' }),
    deferLoad: createEditorSwitchProp({
      label: '是否开启图片懒加载',
      tips: '启用图片懒加载',
    }),
    loadingIcon: createEditorInputProp({ label: 'Loading icon' }),
    radius: createEditorInputProp({ label: '圆角大小', tips: '默认单位为 px' }),
    round: createEditorSwitchProp({ label: 'Round' }),
    'show-error': createEditorSwitchProp({ label: '是否显示图片加载失败提示' }),
    'show-loading': createEditorSwitchProp({ label: 'Show loading' }),
    alt: createEditorInputProp({ label: '替代文本' }),
  },
  events: [
    { label: 'Click', value: 'click' },
    { label: 'Load', value: 'load' },
    { label: 'Error', value: 'error' },
  ],
} as VisualEditorComponent;
