/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { textToneClass } from '../helpers';
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
    ...{ class: "content-panel" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
if (__VLS_ctx.block.title) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "section-kicker" },
    });
    /** @type {__VLS_StyleScopedClasses['section-kicker']} */ ;
    (__VLS_ctx.block.title);
}
__VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
    ...{ class: (__VLS_ctx.textToneClass(__VLS_ctx.block.tone)) },
});
(__VLS_ctx.block.content);
// @ts-ignore
[block, block, block, block, textToneClass,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
