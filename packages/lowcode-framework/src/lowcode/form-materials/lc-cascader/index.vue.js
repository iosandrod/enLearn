/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { useLowCodeFormMaterialModel } from '../useLowCodeFormMaterialModel';
const props = withDefaults(defineProps(), {
    options: () => [],
});
const emit = defineEmits();
const model = useLowCodeFormMaterialModel(props, emit);
const cascaderProps = computed(() => ({
    value: 'value',
    label: 'label',
    children: 'children',
    disabled: 'disabled',
    ...props.field.props?.cascaderProps,
}));
const inputProps = computed(() => {
    const { cascaderProps: _cascaderProps, ...rest } = props.field.props ?? {};
    return rest;
});
const __VLS_defaults = {
    options: () => [],
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
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeCascader | typeof __VLS_components.VxeCascader | typeof __VLS_components['vxe-cascader']} */
vxeCascader;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    id: (__VLS_ctx.field.field),
    modelValue: (__VLS_ctx.model),
    options: (__VLS_ctx.options),
    optionProps: (__VLS_ctx.cascaderProps),
    ...(__VLS_ctx.inputProps),
}));
const __VLS_2 = __VLS_1({
    id: (__VLS_ctx.field.field),
    modelValue: (__VLS_ctx.model),
    options: (__VLS_ctx.options),
    optionProps: (__VLS_ctx.cascaderProps),
    ...(__VLS_ctx.inputProps),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
var __VLS_3;
// @ts-ignore
[field, model, options, cascaderProps, inputProps,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
