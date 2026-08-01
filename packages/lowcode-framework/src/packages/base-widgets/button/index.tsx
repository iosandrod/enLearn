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
          label: '琛ㄥ崟鎻愪氦鎸夐挳',
          value: 'submit',
        },
        {
          label: '琛ㄥ崟閲嶇疆鎸夐挳',
          value: 'reset',
        },
      ],
      defaultValue: 'button',
    }),
    to: createEditorInputProp({ label: '璺敱璺宠浆' }),
    url: createEditorInputProp({ label: '璺宠浆閾炬帴' }),
    plain: createEditorSwitchProp({ label: 'Plain' }),
    replace: createEditorSwitchProp({ label: '鏄惁鍦ㄨ烦杞椂鏇挎崲褰撳墠椤甸潰鍘嗗彶' }),
    round: createEditorSwitchProp({ label: 'Round' }),
    square: createEditorSwitchProp({ label: 'Square' }),
    block: createEditorSwitchProp({ label: 'Block', defaultValue: false }),
    color: createEditorInputProp({
      label: 'Button color',
      tips: 'Supports color strings and linear-gradient values',
    }),
    disabled: createEditorSwitchProp({ label: '鏄惁绂佺敤鎸夐挳' }),
    hairline: createEditorSwitchProp({ label: '鏄惁浣跨敤 0.5px 杈规' }),
    icon: createEditorInputProp({ label: 'Icon' }),
    'icon-position': createEditorSelectProp({
      label: '鍥炬爣灞曠ず浣嶇疆',
      options: [
        {
          label: '宸︿晶',
          value: 'left',
        },
        {
          label: '鍙充晶',
          value: 'right',
        },
      ],
    }),
    'icon-prefix': createEditorInputProp({
      label: 'Icon prefix',
      tips: 'Icon class prefix',
    }),
    loading: createEditorSwitchProp({ label: 'Loading' }),
    'loading-size': createEditorInputProp({ label: '鍔犺浇鍥炬爣澶у皬' }),
    'loading-text': createEditorInputProp({ label: 'Loading text' }),
    'loading-type': createEditorSelectProp({
      label: '鍔犺浇鍥炬爣绫诲瀷',
      options: [
        { label: 'circular', value: 'circular' },
        { label: 'spinner', value: 'spinner' },
      ],
      defaultValue: 'circular',
    }),
  },
} as VisualEditorComponent;
