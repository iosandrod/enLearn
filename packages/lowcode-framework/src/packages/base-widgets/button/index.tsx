import { Button } from '../../../components/LegacyWidgets';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import {
  createEditorInputProp,
  createEditorSelectProp,
  createEditorSwitchProp,
} from '../../../visual-editor/visual-editor.props';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';

export default {
  key: 'button',
  moduleName: 'baseWidgets',
  label: 'Button',
  preview: () => <Button type={'primary'}>Button</Button>,
  render: ({ props, block, styles }) => {
    const { registerRef } = useGlobalProperties();

    return () => (
      <div style={styles}>
        <Button ref={(el) => registerRef(el, block._vid)} {...props}></Button>
      </div>
    );
  },
  resize: {
    height: true,
    width: true,
  },
  events: [
    { label: 'Click', value: 'click' },
    { label: 'Touch start', value: 'touchstart' },
  ],
  props: {
    text: createEditorInputProp({ label: 'Button text', defaultValue: 'Button' }),
    type: createEditorSelectProp({
      label: 'Button type',
      options: [
        {
          label: 'Primary',
          value: 'primary',
        },
        {
          label: 'Success',
          value: 'success',
        },
        {
          label: 'Default',
          value: 'default',
        },
        {
          label: 'Warning',
          value: 'warning',
        },
        {
          label: 'Danger',
          value: 'danger',
        },
      ],
      defaultValue: 'default',
    }),
    size: createEditorSelectProp({
      label: 'Button size',
      options: [
        {
          label: 'Large',
          value: 'large',
        },
        {
          label: 'Normal',
          value: 'normal',
        },
        {
          label: 'Small',
          value: 'small',
        },
        {
          label: 'Mini',
          value: 'mini',
        },
      ],
      defaultValue: 'normal',
    }),
    'native-type': createEditorSelectProp({
      label: 'Native button type',
      options: [
        { label: 'Button', value: 'button' },
        {
          label: '表单提交按钮',
          value: 'submit',
        },
        {
          label: '表单重置按钮',
          value: 'reset',
        },
      ],
      defaultValue: 'button',
    }),
    to: createEditorInputProp({ label: '路由跳转' }),
    url: createEditorInputProp({ label: '跳转链接' }),
    plain: createEditorSwitchProp({ label: 'Plain' }),
    replace: createEditorSwitchProp({ label: '是否在跳转时替换当前页面历史' }),
    round: createEditorSwitchProp({ label: 'Round' }),
    square: createEditorSwitchProp({ label: 'Square' }),
    block: createEditorSwitchProp({ label: 'Block', defaultValue: false }),
    color: createEditorInputProp({
      label: 'Button color',
      tips: 'Supports color strings and linear-gradient values',
    }),
    disabled: createEditorSwitchProp({ label: '是否禁用按钮' }),
    hairline: createEditorSwitchProp({ label: '是否使用 0.5px 边框' }),
    icon: createEditorInputProp({ label: 'Icon' }),
    'icon-position': createEditorSelectProp({
      label: '图标显示位置',
      options: [
        {
          label: '左侧',
          value: 'left',
        },
        {
          label: '右侧',
          value: 'right',
        },
      ],
    }),
    'icon-prefix': createEditorInputProp({
      label: 'Icon prefix',
      tips: 'Icon class prefix',
    }),
    loading: createEditorSwitchProp({ label: 'Loading' }),
    'loading-size': createEditorInputProp({ label: '加载图标大小' }),
    'loading-text': createEditorInputProp({ label: 'Loading text' }),
    'loading-type': createEditorSelectProp({
      label: '加载图标类型',
      options: [
        { label: 'circular', value: 'circular' },
        { label: 'spinner', value: 'spinner' },
      ],
      defaultValue: 'circular',
    }),
  },
} as VisualEditorComponent;
