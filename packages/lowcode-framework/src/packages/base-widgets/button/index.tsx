import { Button } from '../../../components/VantFree';
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
  label: '鎸夐挳',
  preview: () => <Button type={'primary'}>鎸夐挳</Button>,
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
    { label: '鐐瑰嚮鎸夐挳锛屼笖鎸夐挳鐘舵€佷笉涓哄姞杞芥垨绂佺敤鏃惰Е鍙?, value: 'click' },
    { label: '寮€濮嬭Е鎽告寜閽椂瑙﹀彂', value: 'touchstart' },
  ],
  props: {
    text: createEditorInputProp({ label: '鎸夐挳鏂囧瓧', defaultValue: '鎸夐挳' }),
    type: createEditorSelectProp({
      label: '鎸夐挳绫诲瀷',
      options: [
        {
          label: '涓昏鎸夐挳',
          value: 'primary',
        },
        {
          label: '鎴愬姛鎸夐挳',
          value: 'success',
        },
        {
          label: '榛樿鎸夐挳',
          value: 'default',
        },
        {
          label: '璀﹀憡鎸夐挳',
          value: 'warning',
        },
        {
          label: '鍗遍櫓鎸夐挳',
          value: 'danger',
        },
      ],
      defaultValue: 'default',
    }),
    size: createEditorSelectProp({
      label: '鎸夐挳灏哄',
      options: [
        {
          label: '澶у瀷',
          value: 'large',
        },
        {
          label: '鏅€?,
          value: 'normal',
        },
        {
          label: '灏忓瀷',
          value: 'small',
        },
        {
          label: '杩蜂綘',
          value: 'mini',
        },
      ],
      defaultValue: 'normal',
    }),
    'native-type': createEditorSelectProp({
      label: '鍘熺敓button鐨則ype灞炴€?,
      options: [
        { label: '鏅€歜utton', value: 'button' },
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
    plain: createEditorSwitchProp({ label: '鏄惁涓烘湸绱犳寜閽? }),
    replace: createEditorSwitchProp({ label: '鏄惁鍦ㄨ烦杞椂鏇挎崲褰撳墠椤甸潰鍘嗗彶' }),
    round: createEditorSwitchProp({ label: '鏄惁涓哄渾褰㈡寜閽? }),
    square: createEditorSwitchProp({ label: '鏄惁涓烘柟褰㈡寜閽? }),
    block: createEditorSwitchProp({ label: '鏄惁涓哄潡绾у厓绱?, defaultValue: false }),
    color: createEditorInputProp({
      label: '鎸夐挳棰滆壊',
      tips: '鎸夐挳棰滆壊锛屾敮鎸佷紶鍏?linear-gradient 娓愬彉鑹?,
    }),
    disabled: createEditorSwitchProp({ label: '鏄惁绂佺敤鎸夐挳' }),
    hairline: createEditorSwitchProp({ label: '鏄惁浣跨敤 0.5px 杈规' }),
    icon: createEditorInputProp({ label: '宸︿晶鍥炬爣鍚嶇О鎴栧浘鐗囬摼鎺? }),
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
      label: '鍥炬爣绫诲悕鍓嶇紑',
      tips: '鍥炬爣绫诲悕鍓嶇紑锛屽悓 Icon 缁勪欢鐨?class-prefix 灞炴€?,
    }),
    loading: createEditorSwitchProp({ label: '鏄惁鏄剧ず涓哄姞杞界姸鎬? }),
    'loading-size': createEditorInputProp({ label: '鍔犺浇鍥炬爣澶у皬' }),
    'loading-text': createEditorInputProp({ label: '鍔犺浇鐘舵€佹彁绀烘枃瀛? }),
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
