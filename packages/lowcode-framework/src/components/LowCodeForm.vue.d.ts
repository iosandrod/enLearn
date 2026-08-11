import type { VxeFormProps } from 'vxe-pc-ui';
import type { LowCodeAction, LowCodeField, LowCodeFormSchema } from '../types/lowcode';
type LowCodeFormModel = Record<string, unknown>;
type VxeLowCodeFormProps = VxeFormProps<LowCodeFormModel>;
type LowCodeFormProps = {
    schema: LowCodeFormSchema;
    modelValue: LowCodeFormModel;
    optionSources?: Record<string, unknown>;
    loading?: VxeLowCodeFormProps['loading'];
    size?: VxeLowCodeFormProps['size'];
    collapseStatus?: VxeLowCodeFormProps['collapseStatus'];
    span?: VxeLowCodeFormProps['span'];
    align?: VxeLowCodeFormProps['align'];
    verticalAlign?: VxeLowCodeFormProps['verticalAlign'];
    border?: VxeLowCodeFormProps['border'];
    titleBackground?: VxeLowCodeFormProps['titleBackground'];
    titleBold?: VxeLowCodeFormProps['titleBold'];
    titleAlign?: VxeLowCodeFormProps['titleAlign'];
    titleWidth?: VxeLowCodeFormProps['titleWidth'];
    titleColon?: VxeLowCodeFormProps['titleColon'];
    titleAsterisk?: VxeLowCodeFormProps['titleAsterisk'];
    titleOverflow?: VxeLowCodeFormProps['titleOverflow'];
    vertical?: VxeLowCodeFormProps['vertical'];
    padding?: VxeLowCodeFormProps['padding'];
    className?: VxeLowCodeFormProps['className'];
    readonly?: VxeLowCodeFormProps['readonly'];
    disabled?: VxeLowCodeFormProps['disabled'];
    rules?: VxeLowCodeFormProps['rules'];
    fieldValidator?: (field: LowCodeField, value: unknown, values: Record<string, unknown>) => Promise<true | string> | true | string;
    preventSubmit?: VxeLowCodeFormProps['preventSubmit'];
    validConfig?: VxeLowCodeFormProps['validConfig'];
    tooltipConfig?: VxeLowCodeFormProps['tooltipConfig'];
    collapseConfig?: VxeLowCodeFormProps['collapseConfig'];
    params?: VxeLowCodeFormProps['params'];
    labelContextMenu?: boolean;
};
declare function validate(): Promise<boolean>;
declare function setValues(values: Record<string, unknown>): void;
declare function clearValidation(): Promise<void>;
declare function snapshot(): {
    [x: string]: unknown;
};
declare function handleSubmit(): Promise<boolean>;
declare const __VLS_export: import("vue").DefineComponent<LowCodeFormProps, {
    submit: typeof handleSubmit;
    validate: typeof validate;
    setValues: typeof setValues;
    snapshot: typeof snapshot;
    clearValidation: typeof clearValidation;
}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    submit: (value: Record<string, unknown>) => any;
    action: (action: LowCodeAction, value: Record<string, unknown>) => any;
    "update:modelValue": (value: Record<string, unknown>) => any;
    fieldChange: (payload: {
        field: LowCodeField;
        value: unknown;
        previousValue: unknown;
        values: Record<string, unknown>;
    }) => any;
    labelContextMenu: (event: MouseEvent, field: LowCodeField) => any;
}, string, import("vue").PublicProps, Readonly<LowCodeFormProps> & Readonly<{
    onSubmit?: (value: Record<string, unknown>) => any;
    onAction?: (action: LowCodeAction, value: Record<string, unknown>) => any;
    "onUpdate:modelValue"?: (value: Record<string, unknown>) => any;
    onFieldChange?: (payload: {
        field: LowCodeField;
        value: unknown;
        previousValue: unknown;
        values: Record<string, unknown>;
    }) => any;
    onLabelContextMenu?: (event: MouseEvent, field: LowCodeField) => any;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
