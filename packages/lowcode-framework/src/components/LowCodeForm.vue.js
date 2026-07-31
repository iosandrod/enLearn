/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, reactive, ref, watch } from 'vue';
import LowCodeFormField from './LowCodeFormField.vue';
import LowCodeFormLayout from './LowCodeFormLayout.vue';
const props = defineProps();
const emit = defineEmits();
const formData = reactive({ ...props.modelValue });
const errors = reactive({});
const initialModel = ref({ ...props.modelValue });
const fieldsByKey = computed(() => props.schema.fields.reduce((prev, field) => {
    prev[field.field] = field;
    return prev;
}, {}));
watch(() => props.modelValue, (nextValue) => {
    Object.keys(formData).forEach((key) => delete formData[key]);
    Object.assign(formData, nextValue);
    initialModel.value = { ...nextValue };
}, { deep: true });
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeOption(option, field) {
    if (!isRecord(option)) {
        return {
            label: String(option),
            value: String(option)
        };
    }
    const labelKey = String(field.optionProps?.label ?? 'label');
    const valueKey = String(field.optionProps?.value ?? 'value');
    const childrenKey = String(field.optionProps?.children ?? 'children');
    const label = option[labelKey] ?? option.name ?? option.title ?? option.code ?? option.id ?? '';
    const value = option[valueKey] ?? option.code ?? option.id ?? label;
    const normalized = {
        ...option,
        label: label,
        value: value
    };
    if (Array.isArray(option[childrenKey])) {
        normalized.children = option[childrenKey].map((child) => normalizeOption(child, field));
    }
    return normalized;
}
function resolveOptions(field) {
    if (field.optionsSourceKey) {
        const source = props.optionSources?.[field.optionsSourceKey];
        if (Array.isArray(source)) {
            return source.map((option) => normalizeOption(option, field));
        }
    }
    return field.options ?? [];
}
function setFieldValue(field, value) {
    formData[field.field] = value;
    emit('update:modelValue', { ...formData });
}
function handleFieldChange(payload) {
    emit('fieldChange', {
        ...payload,
        values: { ...formData },
    });
}
function checkRule(value, rule) {
    if (rule.required &&
        (value === undefined || value === null || String(value).trim() === '')) {
        return rule.message;
    }
    if (rule.min && String(value ?? '').length < rule.min) {
        return rule.message;
    }
    return '';
}
function validate() {
    Object.keys(errors).forEach((key) => delete errors[key]);
    for (const field of props.schema.fields) {
        for (const rule of field.rules ?? []) {
            const message = checkRule(formData[field.field], rule);
            if (message) {
                errors[field.field] = message;
                break;
            }
        }
    }
    return Object.keys(errors).length === 0;
}
function snapshot() {
    const value = { ...formData };
    emit('update:modelValue', value);
    return value;
}
function handleSubmit() {
    if (!validate())
        return;
    emit('submit', snapshot());
}
function handleAction(action) {
    if (action.type === 'submit') {
        handleSubmit();
        return;
    }
    if (action.type === 'reset') {
        Object.keys(formData).forEach((key) => {
            delete formData[key];
        });
        Object.assign(formData, initialModel.value);
    }
    emit('action', action, snapshot());
}
const __VLS_exposed = {
    submit: handleSubmit,
    validate,
    snapshot
};
defineExpose(__VLS_exposed);
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
__VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
    ...{ onSubmit: (__VLS_ctx.handleSubmit) },
    ...{ class: "lc-form" },
});
/** @type {__VLS_StyleScopedClasses['lc-form']} */ ;
if (__VLS_ctx.schema.layout?.length) {
    const __VLS_0 = LowCodeFormLayout || LowCodeFormLayout;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        nodes: (__VLS_ctx.schema.layout),
        fieldsByKey: (__VLS_ctx.fieldsByKey),
    }));
    const __VLS_2 = __VLS_1({
        nodes: (__VLS_ctx.schema.layout),
        fieldsByKey: (__VLS_ctx.fieldsByKey),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const { default: __VLS_5 } = __VLS_3.slots;
    {
        const { field: __VLS_6 } = __VLS_3.slots;
        const [{ field }] = __VLS_vSlot(__VLS_6);
        const __VLS_7 = LowCodeFormField;
        // @ts-ignore
        const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onChange': {} },
            field: (field),
            modelValue: (__VLS_ctx.formData[field.field]),
            options: (__VLS_ctx.resolveOptions(field)),
            error: (__VLS_ctx.errors[field.field]),
        }));
        const __VLS_9 = __VLS_8({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onChange': {} },
            field: (field),
            modelValue: (__VLS_ctx.formData[field.field]),
            options: (__VLS_ctx.resolveOptions(field)),
            error: (__VLS_ctx.errors[field.field]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_8));
        let __VLS_12;
        const __VLS_13 = {
            /** @type {typeof __VLS_12.'update:modelValue'} */
            'onUpdate:modelValue': ((value) => __VLS_ctx.setFieldValue(field, value)),
        };
        const __VLS_14 = {
            /** @type {typeof __VLS_12.change} */
            onChange: (__VLS_ctx.handleFieldChange),
        };
        var __VLS_10;
        var __VLS_11;
        // @ts-ignore
        [handleSubmit, schema, schema, fieldsByKey, formData, resolveOptions, errors, setFieldValue, handleFieldChange,];
    }
    // @ts-ignore
    [];
    var __VLS_3;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lc-form-grid" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-form-grid']} */ ;
    for (const [field] of __VLS_vFor((__VLS_ctx.schema.fields))) {
        const __VLS_15 = LowCodeFormField;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onChange': {} },
            key: (field.field),
            field: (field),
            modelValue: (__VLS_ctx.formData[field.field]),
            options: (__VLS_ctx.resolveOptions(field)),
            error: (__VLS_ctx.errors[field.field]),
        }));
        const __VLS_17 = __VLS_16({
            ...{ 'onUpdate:modelValue': {} },
            ...{ 'onChange': {} },
            key: (field.field),
            field: (field),
            modelValue: (__VLS_ctx.formData[field.field]),
            options: (__VLS_ctx.resolveOptions(field)),
            error: (__VLS_ctx.errors[field.field]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        let __VLS_20;
        const __VLS_21 = {
            /** @type {typeof __VLS_20.'update:modelValue'} */
            'onUpdate:modelValue': ((value) => __VLS_ctx.setFieldValue(field, value)),
        };
        const __VLS_22 = {
            /** @type {typeof __VLS_20.change} */
            onChange: (__VLS_ctx.handleFieldChange),
        };
        var __VLS_18;
        var __VLS_19;
        // @ts-ignore
        [schema, formData, resolveOptions, errors, setFieldValue, handleFieldChange,];
    }
}
if (__VLS_ctx.schema.actions.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lc-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-actions']} */ ;
    for (const [action] of __VLS_vFor((__VLS_ctx.schema.actions))) {
        let __VLS_23;
        /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
        vxeButton;
        // @ts-ignore
        const __VLS_24 = __VLS_asFunctionalComponent1(__VLS_23, new __VLS_23({
            ...{ 'onClick': {} },
            key: (action.code),
            status: (action.status),
            loading: (__VLS_ctx.loading && action.type === 'submit'),
            disabled: (action.disabled || (__VLS_ctx.loading && action.type !== 'submit')),
        }));
        const __VLS_25 = __VLS_24({
            ...{ 'onClick': {} },
            key: (action.code),
            status: (action.status),
            loading: (__VLS_ctx.loading && action.type === 'submit'),
            disabled: (action.disabled || (__VLS_ctx.loading && action.type !== 'submit')),
        }, ...__VLS_functionalComponentArgsRest(__VLS_24));
        let __VLS_28;
        const __VLS_29 = {
            /** @type {typeof __VLS_28.click} */
            onClick: (...[$event]) => {
                if (!(__VLS_ctx.schema.actions.length))
                    throw 0;
                return (__VLS_ctx.handleAction(action));
                // @ts-ignore
                [schema, schema, loading, loading, handleAction,];
            },
        };
        const { default: __VLS_30 } = __VLS_26.slots;
        (action.label);
        // @ts-ignore
        [];
        var __VLS_26;
        var __VLS_27;
        // @ts-ignore
        [];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
    __typeProps: {},
});
export default {};
