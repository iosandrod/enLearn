import { useAttrs, reactive } from 'vue';
import { Field, Popup, DatetimePicker } from '../../../components/LegacyWidgets';
import dayjs from 'dayjs';
import type { VisualEditorComponent } from '../../../visual-editor/visual-editor.utils';
import { useGlobalProperties } from '../../../hooks/useGlobalProperties';
import { isDate } from '../../../visual-editor/utils/is';
const dateType = { 'month-day': 'MM-DD', 'year-month': 'YYYY-MM', date: 'YYYY-MM-DD', datehour: 'YYYY-MM-DD HH', datetime: 'YYYY-MM-DD HH:mm:ss' };
export default {
  key: 'datetimePicker', moduleName: 'baseWidgets', label: 'Datetime picker',
  preview: () => <Field name="datetimePicker" label="Datetime" placeholder="Select datetime" />,
  render: ({ styles, block, props }) => {
    const { registerRef } = useGlobalProperties(); const attrs = useAttrs();
    const state = reactive({ showPicker: false, text: '', currentDate: new Date() });
    const onConfirm = (value) => { const date = isDate(value) ? dayjs(value).format(props.format || dateType[props.type]) : value; props.modelValue = date; state.text = date; state.showPicker = false; };
    return () => <div style={styles}><Field v-model={props.modelValue} {...props} readonly clickable onClick={() => (state.showPicker = true)} name={Array.isArray(props.name) ? [...props.name].pop() : props.name} v-slots={{ input: () => state.text?.trim() === '' ? <span class="placeholder">{props.placeholder}</span> : state.text }} /><Popup v-model={[state.showPicker, 'show']} position="bottom" teleport="body"><DatetimePicker ref={(el) => registerRef(el, block._vid)} {...props} {...attrs} v-model={state.currentDate} onConfirm={onConfirm} onCancel={() => (state.showPicker = false)} /></Popup></div>;
  },
  events: [{ label: 'Change', value: 'change' }, { label: '点击完成按钮时触发', value: 'confirm' }, { label: '点击取消按钮时触发', value: 'cancel' }], resize: { width: true }, model: { default: '绑定字段' },
} as VisualEditorComponent;
