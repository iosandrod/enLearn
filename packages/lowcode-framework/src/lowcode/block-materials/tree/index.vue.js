/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import LowCodeTreeItem from '../../../components/LowCodeTreeItem.vue';
import { resolveTreeRows } from '../helpers';
const __VLS_props = defineProps();
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
    ...{ class: "content-panel lc-tree-node" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-tree-node']} */ ;
if (__VLS_ctx.block.title || __VLS_ctx.block.description) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "lc-node-header" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-node-header']} */ ;
    if (__VLS_ctx.block.title) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (__VLS_ctx.block.title);
    }
    if (__VLS_ctx.block.description) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        (__VLS_ctx.block.description);
    }
}
__VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({});
for (const [row] of __VLS_vFor((__VLS_ctx.resolveTreeRows(__VLS_ctx.block.rows, __VLS_ctx.block.sourceKey, __VLS_ctx.resolvedData)))) {
    const __VLS_0 = LowCodeTreeItem;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        key: (String(row[__VLS_ctx.block.keyField ?? 'id'] ?? row[__VLS_ctx.block.titleField ?? 'title'])),
        row: (row),
        titleField: (__VLS_ctx.block.titleField ?? 'title'),
        childrenField: (__VLS_ctx.block.childrenField ?? 'children'),
    }));
    const __VLS_2 = __VLS_1({
        key: (String(row[__VLS_ctx.block.keyField ?? 'id'] ?? row[__VLS_ctx.block.titleField ?? 'title'])),
        row: (row),
        titleField: (__VLS_ctx.block.titleField ?? 'title'),
        childrenField: (__VLS_ctx.block.childrenField ?? 'children'),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    // @ts-ignore
    [block, block, block, block, block, block, block, block, block, block, block, block, resolveTreeRows, resolvedData,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
