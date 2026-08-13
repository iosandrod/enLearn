import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import type { TriggerWorkflowIssue, TriggerWorkflowModel } from '../schema/types';
import { type TriggerInspectorFormSchema, type TriggerNodeFormSchemaOverrides } from '../inspector-form';
type __VLS_Props = {
    modelValue?: TriggerWorkflowModel;
    readonly?: boolean;
    height?: string;
    busy?: boolean;
    canRun?: boolean;
    nodeFormSchemas?: TriggerNodeFormSchemaOverrides;
    edgeFormSchema?: TriggerInspectorFormSchema;
    inspectorSchemasLoading?: boolean;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: TriggerWorkflowModel) => any;
    change: (value: TriggerWorkflowModel) => any;
    validation: (issues: TriggerWorkflowIssue[]) => any;
    compile: (value: import("../index.js").TriggerWorkflowExecutionPlan) => any;
    export: (value: TriggerWorkflowModel) => any;
    save: () => any;
    restore: () => any;
    copy: () => any;
    enable: () => any;
    run: () => any;
    refresh: () => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    "onUpdate:modelValue"?: ((value: TriggerWorkflowModel) => any) | undefined;
    onChange?: ((value: TriggerWorkflowModel) => any) | undefined;
    onValidation?: ((issues: TriggerWorkflowIssue[]) => any) | undefined;
    onCompile?: ((value: import("../index.js").TriggerWorkflowExecutionPlan) => any) | undefined;
    onExport?: ((value: TriggerWorkflowModel) => any) | undefined;
    onSave?: (() => any) | undefined;
    onRestore?: (() => any) | undefined;
    onCopy?: (() => any) | undefined;
    onEnable?: (() => any) | undefined;
    onRun?: (() => any) | undefined;
    onRefresh?: (() => any) | undefined;
}>, {
    readonly: boolean;
    height: string;
    busy: boolean;
    canRun: boolean;
    inspectorSchemasLoading: boolean;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
