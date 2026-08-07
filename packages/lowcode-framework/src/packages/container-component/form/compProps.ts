import {
  createEditorInputProp,
  createEditorSelectProp,
  createEditorSwitchProp,
  createEditorTableProp,
} from '../../../visual-editor/visual-editor.props';

const alignOptions = [
  {
    label: '左对齐',
    value: 'left',
  },
  {
    label: '右对齐',
    value: 'right',
  },
  {
    label: '居中对齐',
    value: 'center',
  },
];

const defaultFields = [
  {
    field: 'username',
    label: '用户名',
    component: 'vxe-input',
    placeholder: '请输入用户名',
    required: true,
  },
  {
    field: 'password',
    label: '密码',
    component: 'vxe-password-input',
    placeholder: '请输入密码',
    required: true,
  },
] as unknown as { label: string; value: string }[];

const formComponentOptions = [
  { label: '输入框', value: 'vxe-input' },
  { label: '多行文本', value: 'vxe-textarea' },
  { label: '下拉选择', value: 'vxe-select' },
  { label: '开关', value: 'vxe-switch' },
  { label: '密码框', value: 'vxe-password-input' },
  { label: '数字输入', value: 'lc-number-input' },
  { label: 'JSON 编辑器', value: 'lc-json-editor' },
  { label: '代码编辑器', value: 'lc-monaco-editor' },
  { label: '表格输入', value: 'lc-array-table' },
  { label: '子表单', value: 'lc-sub-form' },
];

export const compProps = {
  blockId: createEditorInputProp({
    label: 'Block ID',
    defaultValue: 'edit-form',
  }),
  title: createEditorInputProp({
    label: '标题',
    defaultValue: '普通表单',
  }),
  sourceKey: createEditorInputProp({
    label: '数据源',
    defaultValue: 'record',
  }),
  submitSourceKey: createEditorInputProp({
    label: '提交数据源',
    defaultValue: 'record',
  }),
  /* columns: createEditorInputNumberProp({
    label: '列数',
    defaultValue: 1,
    min: 1,
    max: 6,
  }), */
  fields: createEditorTableProp({
    label: '表单字段',
    option: {
      options: [
        { label: '字段', field: 'field' },
        { label: '标签', field: 'label' },
        {
          label: '组件',
          field: 'component',
          component: 'vxe-select',
          minWidth: 132,
          options: formComponentOptions,
        },
        { label: '占位提示', field: 'placeholder' },
        { label: '必填', field: 'required', component: 'vxe-switch', width: 72 },
        { label: '跨列', field: 'span' },
        { label: '帮助文本', field: 'help' },
        {
          label: '选项 JSON',
          field: 'optionsJson',
          component: 'lc-json-editor',
          minWidth: 220,
          placeholder: '[{"label":"A","value":"a"}]',
        },
        {
          label: '属性 JSON',
          field: 'propsJson',
          component: 'lc-json-editor',
          minWidth: 240,
          placeholder: '{"columns":[]}',
        },
      ],
      showKey: 'label',
    },
    defaultValue: defaultFields,
  }),
  'slots.default.children': createEditorTableProp({
    label: '插槽表单项',
    option: {
      options: [
        { label: '显示值', field: 'label' },
        { label: '绑定值', field: 'value' },
        { label: '备注', field: 'comments' },
      ],
      showKey: 'label',
    },
    defaultValue: [],
  }),
  colon: createEditorSwitchProp({ label: '是否在 label 后面添加冒号' }),
  disabled: createEditorSwitchProp({ label: '是否禁用表单中的所有输入框' }),
  errorMessageAlign: createEditorSelectProp({
    label: '错误提示文案对齐方式',
    defaultValue: 'left',
    options: alignOptions,
  }),
  inputAlign: createEditorSelectProp({
    label: '输入框对齐方式',
    defaultValue: 'left',
    options: alignOptions,
  }),
  labelAlign: createEditorSelectProp({
    label: '表单项 label 对齐方式',
    defaultValue: 'left',
    options: alignOptions,
  }),
  labelWidth: createEditorInputProp({ label: '表单项 label 宽度，默认单位为 px' }),
  readonly: createEditorSwitchProp({ label: '是否将表单中的所有输入框设置为只读状态' }),
  scrollToError: createEditorSwitchProp({
    label: '提交表单且校验不通过时是否滚动至错误表单项',
  }),
  showError: createEditorSwitchProp({ label: '校验不通过时是否标红输入框' }),
  showErrorMessage: createEditorSwitchProp({
    label: '校验不通过时是否在输入框下方展示错误提示',
  }),
  submitOnEnter: createEditorSwitchProp({ label: '按下回车键时是否提交表单' }),
  validateFirst: createEditorSwitchProp({ label: '某一项校验不通过时是否停止校验' }),
  validateTrigger: createEditorSelectProp({
    label: '表单校验触发时机',
    options: [
      {
        label: 'onChange',
        value: 'onChange',
      },
      {
        label: 'onSubmit',
        value: 'onSubmit',
      },
      {
        label: 'onBlur',
        value: 'onBlur',
      },
    ],
    defaultValue: 'onBlur',
  }),
};
