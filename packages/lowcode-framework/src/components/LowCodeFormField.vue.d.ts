import type { LowCodeField } from '../types/lowcode';
import type { LowCodeResolvedOption } from '../lowcode/form-materials';
type __VLS_Props = {
    field: LowCodeField;
    modelValue: any;
    options?: LowCodeResolvedOption[];
    error?: string;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    change: (payload: {
        field: LowCodeField;
        value: any;
        previousValue: any;
    }) => any;
    "update:modelValue": (value: any) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onChange?: ((payload: {
        field: LowCodeField;
        value: any;
        previousValue: any;
    }) => any) | undefined;
    "onUpdate:modelValue"?: ((value: any) => any) | undefined;
}>, {
    error: string;
    options: LowCodeResolvedOption[];
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
//# sourceMappingURL=LowCodeFormField.vue.d.ts.map