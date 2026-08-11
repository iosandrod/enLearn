import type { LowCodeField } from '../types/lowcode';
import type { LowCodeFormMaterialPatchPayload, LowCodeFormMaterialSelectPayload, LowCodeResolvedOption } from '../lowcode/form-materials';
type __VLS_Props = {
    field: LowCodeField;
    modelValue: any;
    options?: LowCodeResolvedOption[];
    error?: string;
    showLabel?: boolean;
    disabled?: boolean;
    readonly?: boolean;
    formValues?: Record<string, unknown>;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: any) => any;
    change: (payload: {
        field: LowCodeField;
        value: any;
        previousValue: any;
    }) => any;
    patchModel: (payload: LowCodeFormMaterialPatchPayload) => any;
    relateSelect: (payload: LowCodeFormMaterialSelectPayload) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    "onUpdate:modelValue"?: (value: any) => any;
    onChange?: (payload: {
        field: LowCodeField;
        value: any;
        previousValue: any;
    }) => any;
    onPatchModel?: (payload: LowCodeFormMaterialPatchPayload) => any;
    onRelateSelect?: (payload: LowCodeFormMaterialSelectPayload) => any;
}>, {
    error: string;
    disabled: boolean;
    options: LowCodeResolvedOption[];
    showLabel: boolean;
    readonly: boolean;
    formValues: Record<string, unknown>;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
