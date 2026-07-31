/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { getLowCodeFormMaterial } from '../lowcode/form-materials';
const props = withDefaults(defineProps(), {
    options: () => [],
    error: '',
});
const emit = defineEmits();
const materialComponent = computed(() => getLowCodeFormMaterial(props.field.component).component);
function handleUpdate(value) {
    const previousValue = props.modelValue;
    emit('update:modelValue', value);
    emit('change', {
        field: props.field,
        value,
        previousValue,
    });
}
const __VLS_defaults = {
    options: () => [],
    error: '',
};
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-field" },
});
/** @type {__VLS_StyleScopedClasses['lc-field']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
    for: (__VLS_ctx.field.field),
});
(__VLS_ctx.field.label);
const __VLS_0 = (__VLS_ctx.materialComponent);
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    field: (__VLS_ctx.field),
    modelValue: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.options),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    field: (__VLS_ctx.field),
    modelValue: (__VLS_ctx.modelValue),
    options: (__VLS_ctx.options),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.'update:modelValue'} */
    'onUpdate:modelValue': (__VLS_ctx.handleUpdate),
};
var __VLS_3;
var __VLS_4;
if (__VLS_ctx.field.help) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "lc-help" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-help']} */ ;
    (__VLS_ctx.field.help);
}
if (__VLS_ctx.error) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "lc-error" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-error']} */ ;
    (__VLS_ctx.error);
}
// @ts-ignore
[field, field, field, field, field, materialComponent, modelValue, options, handleUpdate, error, error,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
