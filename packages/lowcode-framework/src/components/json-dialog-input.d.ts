import type { DefineComponent, PropType } from 'vue';

export type JsonDialogInputRootType = 'any' | 'object' | 'array';
export type JsonDialogInputValueMode = 'parsed' | 'string' | 'preserve';

declare const JsonDialogInput: DefineComponent<{
  modelValue: PropType<unknown>;
  name: { type: StringConstructor; default: string };
  label: { type: StringConstructor; default: string };
  title: { type: StringConstructor; default: string };
  placeholder: { type: StringConstructor; default: string };
  disabled: { type: BooleanConstructor; default: boolean };
  readonly: { type: BooleanConstructor; default: boolean };
  rows: { type: NumberConstructor; default: number };
  standalone: { type: BooleanConstructor; default: boolean };
  rootType: {
    type: PropType<JsonDialogInputRootType>;
    default: JsonDialogInputRootType;
  };
  valueMode: {
    type: PropType<JsonDialogInputValueMode>;
    default: JsonDialogInputValueMode;
  };
  inputProps: {
    type: PropType<Record<string, unknown>>;
    default: () => Record<string, unknown>;
  };
}>;

export default JsonDialogInput;
