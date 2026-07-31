/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import LowCodeForm from '../../../components/LowCodeForm.vue';
const props = defineProps();
const emit = defineEmits();
function emitRuntimeEvent(name, payload) {
    emit('runtimeEvent', {
        name,
        blockId: props.block.id,
        blockKind: props.block.kind,
        timestamp: Date.now(),
        payload,
    });
}
function handleSubmit(values) {
    const action = props.block.schema.actions.find((item) => item.type === 'submit' || item.code === 'submit');
    emitRuntimeEvent(action?.eventName ?? 'form.submit', {
        action,
        actionCode: action?.code ?? 'submit',
        values,
        directives: action?.directives ?? [],
    });
    emit('formSubmit', { block: props.block, values });
}
function handleAction(action, values) {
    emitRuntimeEvent(action.eventName ?? 'form.action', {
        action,
        actionCode: action.code,
        values,
        directives: action.directives ?? [],
    });
    emit('formAction', { block: props.block, action, values });
}
function handleFieldChange(payload) {
    emitRuntimeEvent('form.fieldChange', {
        ...payload,
        field: payload.field.field,
        fieldConfig: payload.field,
        directives: payload.field.events?.change ?? payload.field.events?.onChange ?? [],
    });
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ class: "content-panel" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
if (__VLS_ctx.block.title || __VLS_ctx.block.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "lc-node-header" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-node-header']} */ ;
    if (__VLS_ctx.block.title) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.block.title);
    }
    if (__VLS_ctx.block.description) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.block.description);
    }
}
const __VLS_0 = LowCodeForm;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onSubmit': {} },
    ...{ 'onAction': {} },
    ...{ 'onFieldChange': {} },
    modelValue: (__VLS_ctx.formModels[__VLS_ctx.block.id]),
    schema: (__VLS_ctx.block.schema),
    optionSources: (__VLS_ctx.resolvedData),
    loading: (__VLS_ctx.loadingBlockId === __VLS_ctx.block.id),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onSubmit': {} },
    ...{ 'onAction': {} },
    ...{ 'onFieldChange': {} },
    modelValue: (__VLS_ctx.formModels[__VLS_ctx.block.id]),
    schema: (__VLS_ctx.block.schema),
    optionSources: (__VLS_ctx.resolvedData),
    loading: (__VLS_ctx.loadingBlockId === __VLS_ctx.block.id),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.submit} */
    onSubmit: (__VLS_ctx.handleSubmit),
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.action} */
    onAction: (__VLS_ctx.handleAction),
};
const __VLS_8 = {
    /** @type {typeof __VLS_5.fieldChange} */
    onFieldChange: (__VLS_ctx.handleFieldChange),
};
var __VLS_3;
var __VLS_4;
// @ts-ignore
[block, block, block, block, block, block, block, block, block, formModels, resolvedData, loadingBlockId, handleSubmit, handleAction, handleFieldChange,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
