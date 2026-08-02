import { useAttrs, reactive } from 'vue';
import { Field, Popup, DatetimePicker } from '../../../components/LegacyWidgets';
import dayjs from 'dayjs';
import { createFieldProps } from './createFieldProps';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import {
  createEditorInputNumberProp,
  createEditorInputProp,
  createEditorModelBindProp,
  createEditorSelectProp,
  createEditorSwitchProp,
} from '../../../visual-editor/visual-editor.props';
import { isDate } from '../../../visual-editor/utils/is';

const dateType = {
  'month-day': 'MM-DD',
  'year-month': 'YYYY-MM',
  date: 'YYYY-MM-DD',
  datehour: 'YYYY-MM-DD HH',
  datetime: 'YYYY-MM-DD HH:mm:ss',
};

export default {
  key: 'datetimePicker',
  moduleName: 'baseWidgets',
  label: 'Datetime picker',
  preview: () => <Field name="datetimePicker" label="Datetime" placeholder={'Select datetime'}></Field>,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties();

    const attrs = useAttrs();

    const state = reactive({
      showPicker: false,
      text: '',
      currentDate: new Date(),
    });

    const onConfirm = (value) => {
      const date = isDate(value)
        ? dayjs(value).format(props.format || dateType[props.type])
        : value;
      props.modelValue = date;
      state.text = date;
      state.showPicker = false;
      console.log(props);
    };

    return () => (
      <div style={styles}>
        <Field
          v-model={props.modelValue}
          {...props}
          readonly
          clickable
          onClick={() => (state.showPicker = true)}
          name={Array.isArray(props.name) ? [...props.name].pop() : props.name}
          v-slots={{
            input: () =>
              state.text?.trim() == '' ? (
                <span class={'placeholder'}>{props.placeholder}</span>
              ) : (
                state.text
              ),
          }}
        />
        <Popup v-model={[state.showPicker, 'show']} position={'bottom'} teleport="body">
          <DatetimePicker
            ref={(el) => registerRef(el, block._vid)}
            {...props}
            {...attrs}
            v-model={state.currentDate}
            onConfirm={onConfirm}
            onCancel={() => (state.showPicker = false)}
          />
        </Popup>
      </div>
    );
  },
  props: {
    modelValue: createEditorInputProp({ label: 'Default value' }),
    name: createEditorModelBindProp({ label: '字段绑定', defaultValue: '' }),
    label: createEditorInputProp({ label: 'Label', defaultValue: 'Datetime picker' }),
    title: createEditorInputProp({ label: 'Title', defaultValue: 'Select datetime' }),
    type: createEditorSelectProp({
      label: '时间类型',
      options: [
        {
          label: 'date',
          value: 'date',
        },
        {
          label: 'datetime',
          value: 'datetime',
        },
        {
          label: 'year-month',
          value: 'year-month',
        },
        {
          label: 'month-day',
          value: 'month-day',
        },
        {
          label: 'datehour',
          value: 'datehour',
        },
      ],
      defaultValue: 'datetime',
    }),
    format: createEditorInputProp({
      label: 'Custom date format',
      tips: 'YYYY-MM-DD HH:mm:ss',
      defaultValue: '',
    }),
    cancelButtonText: createEditorInputProp({ label: '取消按钮文字' }),
    columnsOrder: createEditorInputProp({
      label: '自定义列排序数组',
      tips: '可选值为 year、month、day、hour、minute，多个值用英文逗号分隔',
    }),
    confirmButtonText: createEditorInputProp({ label: '确认按钮文字' }),
    filter: createEditorInputProp({ label: '选项过滤函数' }),
    formatter: createEditorInputProp({ label: 'Formatter' }),
    itemHeight: createEditorInputProp({
      label: '选项高度',
      tips: '支持 px、vw、vh、rem 单位，默认 px',
    }),
    loading: createEditorSwitchProp({ label: 'Loading' }),
    showToolbar: createEditorSwitchProp({ label: 'Show toolbar' }),
    swipeDuration: createEditorInputProp({ label: '快速滑动时惯性滚动的时长，单位 ms' }),
    visibleItemCount: createEditorInputNumberProp({ label: '可见的选项个数', defaultValue: 6 }),
    placeholder: createEditorInputProp({ label: 'Placeholder', defaultValue: 'Select' }),
    ...createFieldProps(),
  },
  events: [
    { label: 'Change', value: 'change' },
    { label: '点击完成按钮时触发', value: 'confirm' },
    { label: '点击取消按钮时触发', value: 'cancel' },
  ],
  resize: {
    width: true,
  },
  model: {
    default: '绑定字段',
  },
} as VisualEditorComponent;
