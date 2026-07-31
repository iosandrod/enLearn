/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { resolveStatValue } from '../helpers';
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
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "lc-stat-grid" },
});
/** @type {__VLS_StyleScopedClasses['lc-stat-grid']} */ ;
for (const [item] of __VLS_vFor((__VLS_ctx.block.items))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.article, __VLS_intrinsics.article)({
        key: (item.label),
        ...{ class: "content-panel lc-stat-card" },
    });
    /** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
    /** @type {__VLS_StyleScopedClasses['lc-stat-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (item.label);
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.resolveStatValue(__VLS_ctx.block, item, __VLS_ctx.resolvedData));
    if (item.suffix) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (item.suffix);
    }
    // @ts-ignore
    [block, block, resolveStatValue, resolvedData,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
