export type LowCodeFormOption = {
  label: string;
  value: string | number;
  rawValue?: unknown;
  disabled?: boolean;
};

export type LowCodeFormRule = {
  required?: boolean;
  min?: number;
  message: string;
};

export type LowCodeFormField = {
  field: string;
  label: string;
  component: string;
  showTitle?: boolean;
  help?: string;
  props?: Record<string, unknown>;
  options?: LowCodeFormOption[];
  optionsCode?: string;
  optionsSourceKey?: string;
  optionProps?: Record<string, unknown>;
  rules?: LowCodeFormRule[];
  span?: number;
  [key: string]: unknown;
};

export type LowCodeFormLayoutNode =
  | { kind: 'field'; field: string }
  | { kind: 'row'; gutter?: number | string; columns: Array<{ span?: number | string; blocks: LowCodeFormLayoutNode[] }> }
  | { kind: 'stack'; blocks: LowCodeFormLayoutNode[] }
  | {
      kind: 'tabs';
      fillRemaining?: boolean;
      defaultKey?: string;
      tabs: Array<{ key: string; label: string; blocks: LowCodeFormLayoutNode[] }>;
    };

export type LowCodeFormAction = {
  code: string;
  label: string;
  [key: string]: unknown;
};

export type LowCodeFormSchema = {
  title?: string;
  columns?: number;
  fields: LowCodeFormField[];
  layout?: LowCodeFormLayoutNode[];
  actions?: LowCodeFormAction[];
};

type LowCodeFormModel = Record<string, unknown>;
type LowCodeFormProps = {
  schema: LowCodeFormSchema;
  modelValue: LowCodeFormModel;
  optionSources?: Record<string, unknown>;
  loading?: boolean;
  size?: string;
  collapseStatus?: boolean;
  span?: number | string;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  border?: boolean;
  titleBackground?: boolean;
  titleBold?: boolean;
  titleAlign?: 'left' | 'center' | 'right';
  titleWidth?: number | string;
  titleColon?: boolean;
  titleAsterisk?: boolean;
  titleOverflow?: boolean | 'ellipsis' | 'title' | 'tooltip';
  vertical?: boolean;
  padding?: boolean;
  className?: string;
  readonly?: boolean;
  disabled?: boolean;
  mode?: 'scan' | 'edit' | 'add';
  rules?: Record<string, unknown[]>;
  fieldValidator?: (
    field: LowCodeFormField,
    value: unknown,
    values: Record<string, unknown>
  ) => Promise<true | string> | true | string;
  preventSubmit?: boolean;
  validConfig?: Record<string, unknown>;
  tooltipConfig?: Record<string, unknown>;
  collapseConfig?: Record<string, unknown>;
  params?: Record<string, unknown>;
  labelContextMenu?: boolean;
};

declare function validate(): Promise<boolean>;
declare function setValues(values: Record<string, unknown>): void;
declare function clearValidation(): Promise<void>;
declare function snapshot(): Record<string, unknown>;
declare function handleSubmit(): Promise<boolean>;

declare const LowCodeForm: import('vue').DefineComponent<
  LowCodeFormProps,
  {
    submit: typeof handleSubmit;
    validate: typeof validate;
    setValues: typeof setValues;
    snapshot: typeof snapshot;
    clearValidation: typeof clearValidation;
  },
  {},
  {},
  {},
  import('vue').ComponentOptionsMixin,
  import('vue').ComponentOptionsMixin,
  {
    submit: (value: Record<string, unknown>) => unknown;
    action: (action: LowCodeFormAction, value: Record<string, unknown>) => unknown;
    'update:modelValue': (value: Record<string, unknown>) => unknown;
    fieldChange: (payload: {
      field: LowCodeFormField;
      value: unknown;
      previousValue: unknown;
      values: Record<string, unknown>;
    }) => unknown;
    relateSelect: (payload: {
      field: LowCodeFormField;
      row: Record<string, unknown>;
      values: Record<string, unknown>;
      formValues: Record<string, unknown>;
    }) => unknown;
    labelContextMenu: (event: MouseEvent, field: LowCodeFormField) => unknown;
  }
>;

export default LowCodeForm;
