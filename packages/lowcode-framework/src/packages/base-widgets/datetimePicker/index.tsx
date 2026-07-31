import { useAttrs, reactive } from 'vue';
import { Field, Popup, DatetimePicker } from '../../../components/VantFree';
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
  label: '琛ㄥ崟椤圭被鍨?- 鏃堕棿閫夋嫨鍣?,
  preview: () => <Field name="datetimePicker" label="鏃堕棿閫夋嫨鍣? placeholder={'鐐瑰嚮閫夋嫨'}></Field>,
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
    modelValue: createEditorInputProp({ label: '榛樿鍊? }),
    name: createEditorModelBindProp({ label: '瀛楁缁戝畾', defaultValue: '' }),
    label: createEditorInputProp({ label: '杈撳叆妗嗗乏渚ф枃鏈?, defaultValue: '鏃堕棿閫夋嫨鍣? }),
    title: createEditorInputProp({ label: '椤堕儴鏍忔爣棰?, defaultValue: '閫夋嫨鏃堕棿' }),
    type: createEditorSelectProp({
      label: '鏃堕棿绫诲瀷',
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
      label: '鑷畾涔夋棩鏈熸牸寮忓寲鍊?,
      tips: 'YYYY-MM-DD HH:mm:ss',
      defaultValue: '',
    }),
    cancelButtonText: createEditorInputProp({ label: '鍙栨秷鎸夐挳鏂囧瓧' }),
    columnsOrder: createEditorInputProp({
      label: '鑷畾涔夊垪鎺掑簭鏁扮粍',
      tips: '鍙€夊€间负锛歽ear銆乵onth銆乨ay銆乭our銆乵inute锛屼紶澶氫釜鍊间互鑻辨枃閫楀彿闅斿紑',
    }),
    confirmButtonText: createEditorInputProp({ label: '纭鎸夐挳鏂囧瓧' }),
    filter: createEditorInputProp({ label: '閫夐」杩囨护鍑芥暟' }),
    formatter: createEditorInputProp({ label: '閫夐」鏍煎紡鍖栧嚱鏁? }),
    itemHeight: createEditorInputProp({
      label: '閫夐」楂樺害',
      tips: '鏀寔 px vw vh rem 鍗曚綅锛岄粯璁?px',
    }),
    loading: createEditorSwitchProp({ label: '鏄惁鏄剧ず鍔犺浇鐘舵€? }),
    showToolbar: createEditorSwitchProp({ label: '鏄惁鏄剧ず椤堕儴鏍? }),
    swipeDuration: createEditorInputProp({ label: '蹇€熸粦鍔ㄦ椂鎯€ф粴鍔ㄧ殑鏃堕暱锛屽崟浣峬s' }),
    visibleItemCount: createEditorInputNumberProp({ label: '鍙鐨勯€夐」涓暟', defaultValue: 6 }),
    placeholder: createEditorInputProp({ label: '鍗犱綅绗?, defaultValue: '璇烽€夋嫨' }),
    ...createFieldProps(),
  },
  events: [
    { label: '褰撳€煎彉鍖栨椂瑙﹀彂鐨勪簨浠?, value: 'change' },
    { label: '鐐瑰嚮瀹屾垚鎸夐挳鏃惰Е鍙戠殑浜嬩欢', value: 'confirm' },
    { label: '鐐瑰嚮鍙栨秷鎸夐挳鏃惰Е鍙戠殑浜嬩欢', value: 'cancel' },
  ],
  resize: {
    width: true,
  },
  model: {
    default: '缁戝畾瀛楁',
  },
} as VisualEditorComponent;
