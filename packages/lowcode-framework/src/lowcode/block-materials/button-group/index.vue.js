/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const emit = defineEmits();
const justifyContentMap = {
    left: 'flex-start',
    center: 'center',
    right: 'flex-end',
    'space-between': 'space-between',
};
const groupStyle = computed(() => ({
    justifyContent: justifyContentMap[props.block.align || 'left'] ?? 'flex-start',
    gap: toCssGap(props.block.gap),
}));
function toCssGap(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return `${value}px`;
    if (typeof value === 'string' && value.trim()) {
        const trimmed = value.trim();
        return /^\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
    }
    return '8px';
}
function hasChildren(action) {
    return Array.isArray(action.children) && action.children.length > 0;
}
function buttonClass(action) {
    return [
        'lc-button',
        action.status ? `lc-button--${action.status}` : '',
        {
            'is-plain': action.plain,
            'is-text': action.text,
        },
    ];
}
function guardDisabled(action, event) {
    if (!action.disabled)
        return;
    event.preventDefault();
}
function handleAction(action) {
    if (action.disabled)
        return;
    emit('runtimeEvent', {
        name: action.eventName ?? 'buttonGroup.click',
        blockId: props.block.id,
        blockKind: props.block.kind,
        timestamp: Date.now(),
        payload: {
            action,
            actionCode: action.code,
            directives: action.directives ?? [],
        },
    });
    emit('toolbarAction', { block: props.block, action });
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
/** @type {__VLS_StyleScopedClasses['lc-button-group__header']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__header']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__menu-item']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-button-group__menu-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "content-panel lc-node-button-group" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-node-button-group']} */ ;
if (__VLS_ctx.block.title || __VLS_ctx.block.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lc-button-group__header" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-button-group__header']} */ ;
    if (__VLS_ctx.block.title) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.block.title);
    }
    if (__VLS_ctx.block.description) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.block.description);
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-button-group" },
    ...{ style: (__VLS_ctx.groupStyle) },
});
/** @type {__VLS_StyleScopedClasses['lc-button-group']} */ ;
for (const [action] of __VLS_vFor((__VLS_ctx.block.actions))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (action.code),
    });
    if (__VLS_ctx.hasChildren(action)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
            ...{ class: "lc-button-group__dropdown" },
            ...{ class: ({ 'is-disabled': action.disabled }) },
        });
        /** @type {__VLS_StyleScopedClasses['lc-button-group__dropdown']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.hasChildren(action)))
                        throw 0;
                    return (__VLS_ctx.guardDisabled(action, $event));
                    // @ts-ignore
                    [block, block, block, block, block, block, block, groupStyle, hasChildren, guardDisabled,];
                } },
            ...{ class: (__VLS_ctx.buttonClass(action)) },
        });
        if (action.icon) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ class: (action.icon) },
                'aria-hidden': "true",
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (action.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ class: "ri-arrow-down-s-line" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['ri-arrow-down-s-line']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "lc-button-group__menu" },
        });
        /** @type {__VLS_StyleScopedClasses['lc-button-group__menu']} */ ;
        for (const [child] of __VLS_vFor((action.children))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        if (!(__VLS_ctx.hasChildren(action)))
                            throw 0;
                        return (__VLS_ctx.handleAction(child));
                        // @ts-ignore
                        [buttonClass, handleAction,];
                    } },
                key: (child.code),
                type: "button",
                ...{ class: "lc-button-group__menu-item" },
                disabled: (child.disabled),
            });
            /** @type {__VLS_StyleScopedClasses['lc-button-group__menu-item']} */ ;
            if (child.icon) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                    ...{ class: (child.icon) },
                    'aria-hidden': "true",
                });
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (child.label);
            // @ts-ignore
            [];
        }
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(__VLS_ctx.hasChildren(action)))
                        throw 0;
                    return (__VLS_ctx.handleAction(action));
                    // @ts-ignore
                    [handleAction,];
                } },
            type: "button",
            ...{ class: (__VLS_ctx.buttonClass(action)) },
            disabled: (action.disabled),
        });
        if (action.icon) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ class: (action.icon) },
                'aria-hidden': "true",
            });
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (action.label);
    }
    // @ts-ignore
    [buttonClass,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
