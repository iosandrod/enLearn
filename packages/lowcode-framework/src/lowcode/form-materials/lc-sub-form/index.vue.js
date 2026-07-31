/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, defineAsyncComponent } from 'vue';
const LowCodeForm = defineAsyncComponent(() => import('../../../components/LowCodeForm.vue'));
const props = defineProps();
const emit = defineEmits();
const fieldProps = computed(() => isRecord(props.field.props) ? props.field.props : {});
const subFields = computed(() => Array.isArray(fieldProps.value.fields)
    ? fieldProps.value.fields.filter(isRecord)
    : []);
const subLayout = computed(() => Array.isArray(fieldProps.value.layout)
    ? fieldProps.value.layout
    : undefined);
const subSchema = computed(() => ({
    fields: subFields.value,
    ...(subLayout.value?.length ? { layout: subLayout.value } : {}),
    actions: [],
}));
const objectValue = computed(() => createFlatObject(isRecord(props.modelValue) ? props.modelValue : {}, createDefaultObject()));
function handleUpdate(value) {
    const nextValue = isRecord(props.modelValue) ? cloneRecord(props.modelValue) : {};
    subFields.value.forEach((field) => {
        setPathValue(nextValue, field.field, value[field.field]);
    });
    emit('update:modelValue', nextValue);
}
function createDefaultObject() {
    return subFields.value.reduce((model, field) => {
        if (Object.prototype.hasOwnProperty.call(field, 'defaultValue')) {
            setPathValue(model, field.field, cloneValue(field.defaultValue));
        }
        return model;
    }, {});
}
function createFlatObject(value, defaultValue) {
    return subFields.value.reduce((model, field) => {
        const currentValue = readPathValue(value, field.field);
        model[field.field] =
            typeof currentValue === 'undefined'
                ? readPathValue(defaultValue, field.field)
                : currentValue;
        return model;
    }, {});
}
function readPathValue(value, path) {
    if (!path.includes('.'))
        return value[path];
    return path.split('.').reduce((result, key) => {
        return isRecord(result) ? result[key] : undefined;
    }, value);
}
function setPathValue(target, path, value) {
    const keys = path.split('.').filter(Boolean);
    if (!keys.length)
        return;
    const lastKey = keys.pop();
    const parent = keys.reduce((result, key) => {
        if (!isRecord(result[key])) {
            result[key] = {};
        }
        return result[key];
    }, target);
    parent[lastKey] = value;
}
function cloneRecord(value) {
    return cloneValue(value);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function cloneValue(value) {
    if (!isRecord(value) && !Array.isArray(value))
        return value;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return value;
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
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-field']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-form-grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-form-layout']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-field']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-field']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-json-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['vxe-textarea']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "lc-sub-form" },
});
/** @type {__VLS_StyleScopedClasses['lc-sub-form']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.LowCodeForm} */
LowCodeForm;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    schema: (__VLS_ctx.subSchema),
    modelValue: (__VLS_ctx.objectValue),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    schema: (__VLS_ctx.subSchema),
    modelValue: (__VLS_ctx.objectValue),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.'update:modelValue'} */
    'onUpdate:modelValue': (__VLS_ctx.handleUpdate),
};
var __VLS_3;
var __VLS_4;
// @ts-ignore
[subSchema, objectValue, handleUpdate,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
