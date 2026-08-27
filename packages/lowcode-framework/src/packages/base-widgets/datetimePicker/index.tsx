import { useAttrs, reactive } from 'vue';
import { Field, Popup, DatetimePicker } from '../../../components/LegacyWidgets';
import dayjs from 'dayjs';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import { isDate } from '../../../visual-editor/utils/is';
const dateType = { 'month-day': 'MM-DD', 'year-month': 'YYYY-MM', date: 'YYYY-MM-DD', datehour: 'YYYY-MM-DD HH', datetime: 'YYYY-MM-DD HH:mm:ss' };
const defaultDateFormat = 'YYYY-MM-DD HH:mm:ss';

function dateFormat(props: Record<string, any>) {
  return props.format || dateType[props.type] || defaultDateFormat;
}

function toDatetimeLocal(value: unknown) {
  const parsed = dayjs(value as any);
  return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm:ss') : '';
}

function formatDisplayValue(value: unknown, props: Record<string, any>) {
  if (value === null || value === undefined || value === '') return '';
  const parsed = dayjs(value as any);
  return parsed.isValid() ? parsed.format(dateFormat(props)) : String(value);
}

export default {
  key: 'datetimePicker', moduleName: 'baseWidgets', label: 'Datetime picker',
  preview: () => <Field name="datetimePicker" label="Datetime" placeholder="Select datetime" />,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties(); const attrs = useAttrs();
    const state = reactive({
      showPicker: false,
      text: formatDisplayValue(props.modelValue, props),
      currentDate: toDatetimeLocal(props.modelValue) || toDatetimeLocal(new Date()),
    });
    const openPicker = () => {
      state.currentDate = toDatetimeLocal(props.modelValue) || toDatetimeLocal(new Date());
      state.showPicker = true;
    };
    const onConfirm = (value) => {
      const date = isDate(value) ? dayjs(value).format(dateFormat(props)) : formatDisplayValue(value, props);
      props.modelValue = date;
      state.currentDate = toDatetimeLocal(value);
      state.text = date;
      state.showPicker = false;
    };
    return () => <div style={styles}><Field v-model={props.modelValue} {...props} readonly clickable onClick={openPicker} name={Array.isArray(props.name) ? [...props.name].pop() : props.name} v-slots={{ input: () => { const text = formatDisplayValue(props.modelValue, props) || state.text; return text.trim() === '' ? <span class="placeholder">{props.placeholder}</span> : text; } }} /><Popup v-model={[state.showPicker, 'show']} position="bottom" teleport="body"><DatetimePicker ref={(el) => registerRef(el, block._vid)} {...props} {...attrs} v-model={state.currentDate} onConfirm={onConfirm} onCancel={() => (state.showPicker = false)} /></Popup></div>;
  },
  events: [{ label: 'Change', value: 'change' }, { label: '点击完成按钮时触发', value: 'confirm' }, { label: '点击取消按钮时触发', value: 'cancel' }], resize: { width: true }, model: { default: '绑定字段' },
} as VisualEditorComponent;
