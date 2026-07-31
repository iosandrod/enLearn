/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, watch } from 'vue';
const props = defineProps();
const emit = defineEmits();
const textValue = ref(formatValue(props.modelValue));
const jsonError = ref('');
watch(() => props.modelValue, (value) => {
    if (jsonError.value)
        return;
    textValue.value = formatValue(value);
}, { deep: true });
function formatValue(value) {
    if (typeof value === 'string')
        return value;
    if (value === undefined)
        return '';
    try {
        return JSON.stringify(value, null, 2);
    }
    catch {
        return String(value ?? '');
    }
}
function commitText() {
    const value = textValue.value.trim();
    if (!value) {
        jsonError.value = '';
        emit('update:modelValue', undefined);
        return;
    }
    try {
        jsonError.value = '';
        emit('update:modelValue', JSON.parse(value));
    }
    catch {
        jsonError.value = 'JSON 格式不正确';
    }
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
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-json-editor" },
});
/** @type {__VLS_StyleScopedClasses['lc-json-editor']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeTextarea | typeof __VLS_components.VxeTextarea | typeof __VLS_components['vxe-textarea']} */
vxeTextarea;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onBlur': {} },
    id: (__VLS_ctx.field.field),
    modelValue: (__VLS_ctx.textValue),
    status: (__VLS_ctx.jsonError ? 'error' : undefined),
    ...(__VLS_ctx.field.props),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onBlur': {} },
    id: (__VLS_ctx.field.field),
    modelValue: (__VLS_ctx.textValue),
    status: (__VLS_ctx.jsonError ? 'error' : undefined),
    ...(__VLS_ctx.field.props),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.blur} */
    onBlur: (__VLS_ctx.commitText),
};
var __VLS_3;
var __VLS_4;
if (__VLS_ctx.jsonError) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "lc-error" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-error']} */ ;
    (__VLS_ctx.jsonError);
}
// @ts-ignore
[field, field, textValue, jsonError, jsonError, jsonError, commitText,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
