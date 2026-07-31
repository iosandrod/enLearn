/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
defineOptions({
    name: 'LowCodeFormLayout'
});
const __VLS_props = defineProps();
const __VLS_slots = defineSlots();
function nodeKey(node, index) {
    return node.kind === 'field' ? `${node.field}-${index}` : `${node.kind}-${index}`;
}
function gapValue(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric >= 0 ? `${numeric}px` : undefined;
}
function columnStyle(column) {
    const span = Number(column.span);
    if (!Number.isFinite(span) || span <= 0) {
        return undefined;
    }
    const basis = `${Math.min(span, 24) / 24 * 100}%`;
    return {
        flex: `0 0 ${basis}`,
        maxWidth: basis
    };
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-form-layout" },
});
/** @type {__VLS_StyleScopedClasses['lc-form-layout']} */ ;
for (const [node, index] of __VLS_vFor((__VLS_ctx.nodes))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (__VLS_ctx.nodeKey(node, index)),
    });
    if (node.kind === 'row') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "lc-form-row" },
            ...{ style: ({ gap: __VLS_ctx.gapValue(node.gutter) }) },
        });
        /** @type {__VLS_StyleScopedClasses['lc-form-row']} */ ;
        for (const [column, columnIndex] of __VLS_vFor((node.columns))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (columnIndex),
                ...{ class: "lc-form-col" },
                ...{ style: (__VLS_ctx.columnStyle(column)) },
            });
            /** @type {__VLS_StyleScopedClasses['lc-form-col']} */ ;
            let __VLS_0;
            /** @ts-ignore @type { | typeof __VLS_components.LowCodeFormLayout | typeof __VLS_components.LowCodeFormLayout} */
            LowCodeFormLayout;
            // @ts-ignore
            const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
                nodes: (column.blocks),
                fieldsByKey: (__VLS_ctx.fieldsByKey),
            }));
            const __VLS_2 = __VLS_1({
                nodes: (column.blocks),
                fieldsByKey: (__VLS_ctx.fieldsByKey),
            }, ...__VLS_functionalComponentArgsRest(__VLS_1));
            const { default: __VLS_5 } = __VLS_3.slots;
            {
                const { field: __VLS_6 } = __VLS_3.slots;
                const [{ field }] = __VLS_vSlot(__VLS_6);
                __VLS_asFunctionalSlot(__VLS_slots.field)({
                    field: (field),
                });
                // @ts-ignore
                [nodes, nodeKey, gapValue, columnStyle, fieldsByKey,];
            }
            // @ts-ignore
            [];
            var __VLS_3;
            // @ts-ignore
            [];
        }
    }
    else if (node.kind === 'stack') {
        let __VLS_8;
        /** @ts-ignore @type { | typeof __VLS_components.LowCodeFormLayout | typeof __VLS_components.LowCodeFormLayout} */
        LowCodeFormLayout;
        // @ts-ignore
        const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
            nodes: (node.blocks),
            fieldsByKey: (__VLS_ctx.fieldsByKey),
        }));
        const __VLS_10 = __VLS_9({
            nodes: (node.blocks),
            fieldsByKey: (__VLS_ctx.fieldsByKey),
        }, ...__VLS_functionalComponentArgsRest(__VLS_9));
        const { default: __VLS_13 } = __VLS_11.slots;
        {
            const { field: __VLS_14 } = __VLS_11.slots;
            const [{ field }] = __VLS_vSlot(__VLS_14);
            __VLS_asFunctionalSlot(__VLS_slots.field)({
                field: (field),
            });
            // @ts-ignore
            [fieldsByKey,];
        }
        // @ts-ignore
        [];
        var __VLS_11;
    }
    else if (__VLS_ctx.fieldsByKey[node.field]) {
        __VLS_asFunctionalSlot(__VLS_slots.field)({
            field: (__VLS_ctx.fieldsByKey[node.field]),
        });
    }
    // @ts-ignore
    [fieldsByKey, fieldsByKey,];
}
// @ts-ignore
[];
const __VLS_base = (await import('vue')).defineComponent({
    __typeProps: {},
});
const __VLS_export = {};
export default {};
