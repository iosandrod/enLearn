export enum VisualEditorPropsType {
  /** 输入框 */
  input = 'input',
  /** 数字输入框 */
  inputNumber = 'InputNumber',
  /** 颜色选择器 */
  color = 'color',
  /** 下拉选择器 */
  select = 'select',
  /** 表格 */
  table = 'table',
  /** 开关 */
  switch = 'switch',
  /** 模型绑定选择器 */
  modelBind = 'ModelBind',
  /** 可拖拽项 */
  crossSortable = 'CrossSortable',
  /** JSON / object */
  json = 'json',
}

export type VisualEditorJsonRootType = 'any' | 'object' | 'array';
export type VisualEditorJsonValueMode = 'parsed' | 'string' | 'preserve';

export type VisualEditorProps = {
  type: VisualEditorPropsType;
  /** 表单项标签名称 */
  label: string;
  /** 表单项提示说明 */
  tips?: string;
  /** 表单域标签的位置 */
  labelPosition?: string;
  /** 表单项默认值 */
  defaultValue?: any;
} & {
  /** 可选项 */
  options?: VisualEditorSelectOptions;
  /** 是否可以多选 */
  multiple?: boolean;
  /** 项属性配置 */
  showItemPropsConfig?: boolean;
} & {
  max?: number;
  min?: number;
} & {
  jsonRootType?: VisualEditorJsonRootType;
  jsonValueMode?: VisualEditorJsonValueMode;
} & {
  table?: VisualEditorTableOption;
};

/*---------------------------------------modelBind-------------------------------------------*/
interface EditorModelBindProp {
  label: string;
  defaultValue?: any;
  tips?: string;
}

export function createEditorModelBindProp({
  label = '字段绑定',
  defaultValue,
  tips,
}: EditorModelBindProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.modelBind,
    label,
    tips,
    defaultValue,
  };
}

/*---------------------------------------switch-------------------------------------------*/
interface EditorSwitchProp {
  label: string;
  defaultValue?: boolean;
  tips?: string;
}

export function createEditorSwitchProp({
  label,
  defaultValue,
  tips,
}: EditorSwitchProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.switch,
    label,
    tips,
    defaultValue,
  };
}

/*---------------------------------------input-------------------------------------------*/

interface EditorInputProp {
  label: string;
  defaultValue?: any;
  tips?: string;
}

interface EditorJsonProp extends EditorInputProp {
  rootType?: VisualEditorJsonRootType;
  valueMode?: VisualEditorJsonValueMode;
}

export function createEditorInputProp({
  label,
  defaultValue,
  tips,
}: EditorInputProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.input,
    label,
    tips,
    defaultValue,
  };
}

export function createEditorJsonProp({
  label,
  defaultValue,
  tips,
  rootType,
  valueMode,
}: EditorJsonProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.json,
    label,
    tips,
    defaultValue,
    jsonRootType: rootType,
    jsonValueMode: valueMode,
  };
}
/*---------------------------------------InputNumber -------------------------------------------*/

interface EditorInputNumberProp {
  label: string;
  defaultValue?: any;
  tips?: string;
  max?: number;
  min?: number;
}

export function createEditorInputNumberProp({
  label,
  defaultValue,
  max,
  min,
  tips,
}: EditorInputNumberProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.inputNumber,
    label,
    tips,
    max,
    min,
    defaultValue,
  };
}

/*---------------------------------------color-------------------------------------------*/

interface EditorColorProp {
  label: string;
  defaultValue?: string;
}

export function createEditorColorProp({ label, defaultValue }: EditorColorProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.color,
    label,
    defaultValue,
  };
}

/*---------------------------------------select-------------------------------------------*/

export type VisualEditorSelectOptions = {
  label: string;
  value: string | number | boolean | object;
  [prop: string]: any;
}[];

interface EditorSelectProp {
  label: string;
  options: VisualEditorSelectOptions;
  defaultValue?: any;
  multiple?: boolean;
  tips?: string;
}

export function createEditorSelectProp({
  label,
  options,
  defaultValue,
  tips,
  multiple,
}: EditorSelectProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.select,
    label,
    defaultValue,
    tips,
    options,
    multiple,
  };
}

/*---------------------------------------table-------------------------------------------*/

export type VisualEditorTableOption = {
  options: VisualEditorTableColumnOption[];
  showKey: string;
};

export type VisualEditorTableColumnOption = {
  label: string; // 列显示文本
  field: string; // 列绑定的字段
  component?:
    | 'vxe-input'
    | 'vxe-textarea'
    | 'vxe-select'
    | 'vxe-switch'
    | 'vxe-password-input'
    | 'lc-number-input'
    | 'lc-json-editor'
    | 'lc-monaco-editor'
    | 'lc-option-select'
    | 'lc-sub-form'
    | (string & {});
  width?: number | string;
  minWidth?: number | string;
  placeholder?: string;
  defaultValue?: unknown;
  props?: Record<string, unknown>;
  options?: VisualEditorSelectOptions;
  optionsCode?: string;
};

interface EditorTableProp {
  label: string;
  option: VisualEditorTableOption;
  defaultValue?: Record<string, any>[];
}

export function createEditorTableProp({
  label,
  option,
  defaultValue,
}: EditorTableProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.table,
    label,
    table: option,
    defaultValue,
  };
}

/*---------------------------------------CrossSortableOptions-------------------------------------------*/

interface EditorCrossSortableProp {
  label: string;
  labelPosition: 'top' | '';
  multiple?: boolean;
  showItemPropsConfig?: boolean;
  defaultValue?: string[] | VisualEditorSelectOptions;
}

export function createEditorCrossSortableProp({
  label,
  labelPosition,
  multiple,
  showItemPropsConfig,
  defaultValue,
}: EditorCrossSortableProp): VisualEditorProps {
  return {
    type: VisualEditorPropsType.crossSortable,
    label,
    multiple,
    showItemPropsConfig,
    labelPosition,
    defaultValue,
  };
}
