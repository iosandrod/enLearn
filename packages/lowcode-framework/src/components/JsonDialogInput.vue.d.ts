type JsonRootType = 'any' | 'object' | 'array';
type JsonValueMode = 'parsed' | 'string' | 'preserve';
type __VLS_Props = {
    modelValue?: unknown;
    name?: string;
    label?: string;
    title?: string;
    placeholder?: string;
    disabled?: boolean;
    readonly?: boolean;
    rows?: number;
    standalone?: boolean;
    rootType?: JsonRootType;
    valueMode?: JsonValueMode;
    inputProps?: Record<string, unknown>;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: unknown) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    "onUpdate:modelValue"?: ((value: unknown) => any) | undefined;
}>, {
    name: string;
    title: string;
    disabled: boolean;
    rows: number;
    standalone: boolean;
    label: string;
    readonly: boolean;
    inputProps: Record<string, unknown>;
    placeholder: string;
    rootType: JsonRootType;
    valueMode: JsonValueMode;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
