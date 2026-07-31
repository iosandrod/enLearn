/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
const props = defineProps();
const children = computed(() => Array.isArray(props.row[props.childrenField])
    ? props.row[props.childrenField]
    : []);
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
    ...{ class: "lc-tree-item" },
});
/** @type {__VLS_StyleScopedClasses['lc-tree-item']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.row[__VLS_ctx.titleField] ?? __VLS_ctx.row.label ?? __VLS_ctx.row.name ?? __VLS_ctx.row.code ?? __VLS_ctx.row.id);
if (__VLS_ctx.children.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({});
    for (const [child] of __VLS_vFor((__VLS_ctx.children))) {
        let __VLS_0;
        /** @ts-ignore @type { | typeof __VLS_components.LowCodeTreeItem} */
        LowCodeTreeItem;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            key: (String(child.id ?? child[__VLS_ctx.titleField])),
            row: (child),
            titleField: (__VLS_ctx.titleField),
            childrenField: (__VLS_ctx.childrenField),
        }));
        const __VLS_2 = __VLS_1({
            key: (String(child.id ?? child[__VLS_ctx.titleField])),
            row: (child),
            titleField: (__VLS_ctx.titleField),
            childrenField: (__VLS_ctx.childrenField),
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        // @ts-ignore
        [row, row, row, row, row, titleField, titleField, titleField, children, children, childrenField,];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
