/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
const props = withDefaults(defineProps(), {
    options: () => [],
});
const emit = defineEmits();
const isMultiple = computed(() => Boolean(props.field.props?.multiple));
const selectedValue = computed({
    get() {
        if (isMultiple.value && Array.isArray(props.modelValue)) {
            return props.modelValue
                .map((value) => findOptionByRawValue(value)?.value)
                .filter((value) => value !== undefined);
        }
        return findOptionByRawValue(props.modelValue)?.value ?? '';
    },
    set(value) {
        if (Array.isArray(value)) {
            emit('update:modelValue', value.map((item) => cloneValue(readRawValueByKey(item))));
            return;
        }
        emit('update:modelValue', cloneValue(readRawValueByKey(value)));
    },
});
function readRawValue(option) {
    return Object.prototype.hasOwnProperty.call(option, 'rawValue')
        ? option.rawValue
        : option.value;
}
function readRawValueByKey(value) {
    const option = props.options.find((item) => item.value === value);
    return option ? readRawValue(option) : value;
}
function findOptionByRawValue(value) {
    return props.options.find((option) => isSameValue(readRawValue(option), value));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSameValue(prev, next) {
    if (isRecord(prev) && isRecord(next) && 'value' in prev && 'value' in next) {
        return prev.value === next.value;
    }
    if (Object.is(prev, next))
        return true;
    try {
        return JSON.stringify(prev) === JSON.stringify(next);
    }
    catch {
        return false;
    }
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
/** @ts-ignore @type { | typeof __VLS_components.vxeSelect | typeof __VLS_components.VxeSelect | typeof __VLS_components['vxe-select'] | typeof __VLS_components.vxeSelect | typeof __VLS_components.VxeSelect | typeof __VLS_components['vxe-select']} */
vxeSelect;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    id: (__VLS_ctx.field.field),
    modelValue: (__VLS_ctx.selectedValue),
    multiple: (__VLS_ctx.isMultiple),
    ...(__VLS_ctx.field.props),
}));
const __VLS_2 = __VLS_1({
    id: (__VLS_ctx.field.field),
    modelValue: (__VLS_ctx.selectedValue),
    multiple: (__VLS_ctx.isMultiple),
    ...(__VLS_ctx.field.props),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
const { default: __VLS_6 } = __VLS_3.slots;
for (const [option] of __VLS_vFor((__VLS_ctx.options))) {
    let __VLS_7;
    /** @ts-ignore @type { | typeof __VLS_components.vxeOption | typeof __VLS_components.VxeOption | typeof __VLS_components['vxe-option']} */
    vxeOption;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        key: (String(option.value)),
        label: (option.label),
        value: (option.value),
        disabled: (option.disabled),
    }));
    const __VLS_9 = __VLS_8({
        key: (String(option.value)),
        label: (option.label),
        value: (option.value),
        disabled: (option.disabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    // @ts-ignore
    [field, field, selectedValue, isMultiple, options,];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
export default {};
