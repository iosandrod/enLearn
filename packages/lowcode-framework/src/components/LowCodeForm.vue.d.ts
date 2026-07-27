import type { LowCodeAction, LowCodeField, LowCodeFormSchema } from '../types/lowcode';
type __VLS_Props = {
    schema: LowCodeFormSchema;
    modelValue: Record<string, unknown>;
    optionSources?: Record<string, unknown>;
    loading?: boolean;
};
declare function validate(): boolean;
declare function snapshot(): {
    [x: string]: unknown;
};
declare function handleSubmit(): void;
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {
    submit: typeof handleSubmit;
    validate: typeof validate;
    snapshot: typeof snapshot;
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
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    onSubmit?: ((value: Record<string, unknown>) => any) | undefined;
    onAction?: ((action: LowCodeAction, value: Record<string, unknown>) => any) | undefined;
    "onUpdate:modelValue"?: ((value: Record<string, unknown>) => any) | undefined;
    onFieldChange?: ((payload: {
        field: LowCodeField;
        value: unknown;
        previousValue: unknown;
        values: Record<string, unknown>;
    }) => any) | undefined;
}>, {}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
//# sourceMappingURL=LowCodeForm.vue.d.ts.map