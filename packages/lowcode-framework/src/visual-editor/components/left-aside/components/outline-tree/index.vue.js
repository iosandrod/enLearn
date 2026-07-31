/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed } from 'vue';
import { Operation } from '../../../common/remix-icons';
import { useVisualData } from '../../../../hooks/useVisualData';
import LayerBlockList from './LayerBlockList.vue';
defineOptions({
    name: 'OutlineTree',
    label: '图层',
    order: 1.5,
    icon: Operation,
});
const { currentPage } = useVisualData();
const currentBlocks = computed({
    get: () => currentPage.value.blocks,
    set: (blocks) => {
        currentPage.value.blocks = blocks;
    },
});
const currentOverlays = computed({
    get: () => {
        currentPage.value.overlays ??= [];
        return currentPage.value.overlays;
    },
    set: (blocks) => {
        currentPage.value.overlays = blocks;
    },
});
const totalNodeCount = computed(() => currentPage.value.blocks.length + currentOverlays.value.length);
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "outline-panel" },
});
/** @type {__VLS_StyleScopedClasses['outline-panel']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "outline-panel__header" },
});
/** @type {__VLS_StyleScopedClasses['outline-panel__header']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
(__VLS_ctx.currentPage.title || '当前页面');
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
(__VLS_ctx.totalNodeCount);
if (__VLS_ctx.currentPage.blocks.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "outline-group" },
    });
    /** @type {__VLS_StyleScopedClasses['outline-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "outline-group__title" },
    });
    /** @type {__VLS_StyleScopedClasses['outline-group__title']} */ ;
    const __VLS_0 = LayerBlockList;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        blocks: (__VLS_ctx.currentBlocks),
    }));
    const __VLS_2 = __VLS_1({
        blocks: (__VLS_ctx.currentBlocks),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
}
if (__VLS_ctx.currentOverlays.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "outline-group" },
    });
    /** @type {__VLS_StyleScopedClasses['outline-group']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "outline-group__title" },
    });
    /** @type {__VLS_StyleScopedClasses['outline-group__title']} */ ;
    const __VLS_5 = LayerBlockList;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        blocks: (__VLS_ctx.currentOverlays),
        overlayList: true,
    }));
    const __VLS_7 = __VLS_6({
        blocks: (__VLS_ctx.currentOverlays),
        overlayList: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
}
if (!__VLS_ctx.totalNodeCount) {
    let __VLS_10;
    /** @ts-ignore @type { | typeof __VLS_components.vxeEmpty | typeof __VLS_components.VxeEmpty | typeof __VLS_components['vxe-empty']} */
    vxeEmpty;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        content: "暂无节点",
    }));
    const __VLS_12 = __VLS_11({
        content: "暂无节点",
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
}
// @ts-ignore
[currentPage, currentPage, totalNodeCount, totalNodeCount, currentBlocks, currentOverlays, currentOverlays,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
