import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import type { TriggerWorkflowIssue, TriggerWorkflowModel } from '../schema/types';
type __VLS_Props = {
    modelValue?: TriggerWorkflowModel;
    readonly?: boolean;
    height?: string;
};
declare const __VLS_export: import("vue").DefineComponent<__VLS_Props, {}, {}, {}, {}, import("vue").ComponentOptionsMixin, import("vue").ComponentOptionsMixin, {
    "update:modelValue": (value: TriggerWorkflowModel) => any;
    change: (value: TriggerWorkflowModel) => any;
    validation: (issues: TriggerWorkflowIssue[]) => any;
    compile: (value: import("../index.js").TriggerWorkflowExecutionPlan) => any;
    export: (value: TriggerWorkflowModel) => any;
}, string, import("vue").PublicProps, Readonly<__VLS_Props> & Readonly<{
    "onUpdate:modelValue"?: ((value: TriggerWorkflowModel) => any) | undefined;
    onChange?: ((value: TriggerWorkflowModel) => any) | undefined;
    onValidation?: ((issues: TriggerWorkflowIssue[]) => any) | undefined;
    onCompile?: ((value: import("../index.js").TriggerWorkflowExecutionPlan) => any) | undefined;
    onExport?: ((value: TriggerWorkflowModel) => any) | undefined;
}>, {
    readonly: boolean;
    height: string;
}, {}, {}, {}, string, import("vue").ComponentProvideOptions, false, {}, any>;
declare const _default: typeof __VLS_export;
export default _default;
