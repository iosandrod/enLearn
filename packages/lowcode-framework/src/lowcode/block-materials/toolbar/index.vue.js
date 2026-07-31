/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
const props = defineProps();
const emit = defineEmits();
function handleAction(action) {
    emit('runtimeEvent', {
        name: action.eventName ?? 'toolbar.click',
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
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "content-panel lc-node-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-node-toolbar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
if (__VLS_ctx.block.title) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    (__VLS_ctx.block.title);
}
if (__VLS_ctx.block.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
    (__VLS_ctx.block.description);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-actions" },
});
/** @type {__VLS_StyleScopedClasses['lc-actions']} */ ;
for (const [action] of __VLS_vFor((__VLS_ctx.block.actions))) {
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        ...{ 'onClick': {} },
        key: (action.code),
        status: (action.status),
        disabled: (action.disabled),
    }));
    const __VLS_2 = __VLS_1({
        ...{ 'onClick': {} },
        key: (action.code),
        status: (action.status),
        disabled: (action.disabled),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    let __VLS_5;
    const __VLS_6 = {
        /** @type {typeof __VLS_5.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.handleAction(action));
            // @ts-ignore
            [block, block, block, block, block, handleAction,];
        },
    };
    const { default: __VLS_7 } = __VLS_3.slots;
    (action.label);
    // @ts-ignore
    [];
    var __VLS_3;
    var __VLS_4;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
