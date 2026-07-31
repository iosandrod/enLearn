/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import LowCodeBlockChildren from '../../../components/LowCodeBlockChildren.vue';
import { containerStyle } from '../helpers';
const __VLS_props = defineProps();
const emit = defineEmits();
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
    ...{ class: (['lc-node-container', { 'content-panel': __VLS_ctx.block.panel === true }]) },
    ...{ style: (__VLS_ctx.containerStyle(__VLS_ctx.block)) },
});
/** @type {__VLS_StyleScopedClasses['lc-node-container']} */ ;
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
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
const __VLS_0 = LowCodeBlockChildren;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onFormSubmit': {} },
    ...{ 'onFormAction': {} },
    ...{ 'onGridEdit': {} },
    ...{ 'onGridDelete': {} },
    ...{ 'onToolbarAction': {} },
    ...{ 'onSearchSubmit': {} },
    ...{ 'onSearchAction': {} },
    ...{ 'onRuntimeEvent': {} },
    blocks: (__VLS_ctx.block.blocks),
    resolvedData: (__VLS_ctx.resolvedData),
    formModels: (__VLS_ctx.formModels),
    searchFilters: (__VLS_ctx.searchFilters),
    loadingBlockId: (__VLS_ctx.loadingBlockId),
    loadingGridId: (__VLS_ctx.loadingGridId),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onFormSubmit': {} },
    ...{ 'onFormAction': {} },
    ...{ 'onGridEdit': {} },
    ...{ 'onGridDelete': {} },
    ...{ 'onToolbarAction': {} },
    ...{ 'onSearchSubmit': {} },
    ...{ 'onSearchAction': {} },
    ...{ 'onRuntimeEvent': {} },
    blocks: (__VLS_ctx.block.blocks),
    resolvedData: (__VLS_ctx.resolvedData),
    formModels: (__VLS_ctx.formModels),
    searchFilters: (__VLS_ctx.searchFilters),
    loadingBlockId: (__VLS_ctx.loadingBlockId),
    loadingGridId: (__VLS_ctx.loadingGridId),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.formSubmit} */
    onFormSubmit: ((payload) => __VLS_ctx.emit('formSubmit', payload)),
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.formAction} */
    onFormAction: ((payload) => __VLS_ctx.emit('formAction', payload)),
};
const __VLS_8 = {
    /** @type {typeof __VLS_5.gridEdit} */
    onGridEdit: ((payload) => __VLS_ctx.emit('gridEdit', payload)),
};
const __VLS_9 = {
    /** @type {typeof __VLS_5.gridDelete} */
    onGridDelete: ((payload) => __VLS_ctx.emit('gridDelete', payload)),
};
const __VLS_10 = {
    /** @type {typeof __VLS_5.toolbarAction} */
    onToolbarAction: ((payload) => __VLS_ctx.emit('toolbarAction', payload)),
};
const __VLS_11 = {
    /** @type {typeof __VLS_5.searchSubmit} */
    onSearchSubmit: ((payload) => __VLS_ctx.emit('searchSubmit', payload)),
};
const __VLS_12 = {
    /** @type {typeof __VLS_5.searchAction} */
    onSearchAction: ((payload) => __VLS_ctx.emit('searchAction', payload)),
};
const __VLS_13 = {
    /** @type {typeof __VLS_5.runtimeEvent} */
    onRuntimeEvent: ((event) => __VLS_ctx.emit('runtimeEvent', event)),
};
var __VLS_3;
var __VLS_4;
// @ts-ignore
[block, block, block, block, block, block, block, block, block, containerStyle, resolvedData, formModels, searchFilters, loadingBlockId, loadingGridId, emit, emit, emit, emit, emit, emit, emit, emit,];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
