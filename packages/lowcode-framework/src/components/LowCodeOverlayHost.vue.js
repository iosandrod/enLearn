/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import LowCodeBlockRenderer from './LowCodeBlockRenderer.vue';
defineOptions({
    name: 'LowCodeOverlayHost',
});
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
for (const [overlay] of __VLS_vFor((__VLS_ctx.overlays))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (overlay.id),
    });
    if (overlay.open !== false) {
        const __VLS_0 = LowCodeBlockRenderer;
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
            block: (overlay),
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
            block: (overlay),
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
    }
    if (overlay.open !== false && overlay.overlays?.length) {
        let __VLS_14;
        /** @ts-ignore @type { | typeof __VLS_components.LowCodeOverlayHost} */
        LowCodeOverlayHost;
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
            ...{ 'onFormSubmit': {} },
            ...{ 'onFormAction': {} },
            ...{ 'onGridEdit': {} },
            ...{ 'onGridDelete': {} },
            ...{ 'onToolbarAction': {} },
            ...{ 'onSearchSubmit': {} },
            ...{ 'onSearchAction': {} },
            ...{ 'onRuntimeEvent': {} },
            overlays: (overlay.overlays),
            resolvedData: (__VLS_ctx.resolvedData),
            formModels: (__VLS_ctx.formModels),
            searchFilters: (__VLS_ctx.searchFilters),
            loadingBlockId: (__VLS_ctx.loadingBlockId),
            loadingGridId: (__VLS_ctx.loadingGridId),
        }));
        const __VLS_16 = __VLS_15({
            ...{ 'onFormSubmit': {} },
            ...{ 'onFormAction': {} },
            ...{ 'onGridEdit': {} },
            ...{ 'onGridDelete': {} },
            ...{ 'onToolbarAction': {} },
            ...{ 'onSearchSubmit': {} },
            ...{ 'onSearchAction': {} },
            ...{ 'onRuntimeEvent': {} },
            overlays: (overlay.overlays),
            resolvedData: (__VLS_ctx.resolvedData),
            formModels: (__VLS_ctx.formModels),
            searchFilters: (__VLS_ctx.searchFilters),
            loadingBlockId: (__VLS_ctx.loadingBlockId),
            loadingGridId: (__VLS_ctx.loadingGridId),
        }, ...__VLS_functionalComponentArgsRest(__VLS_15));
        let __VLS_19;
        const __VLS_20 = {
            /** @type {typeof __VLS_19.formSubmit} */
            onFormSubmit: ((payload) => __VLS_ctx.emit('formSubmit', payload)),
        };
        const __VLS_21 = {
            /** @type {typeof __VLS_19.formAction} */
            onFormAction: ((payload) => __VLS_ctx.emit('formAction', payload)),
        };
        const __VLS_22 = {
            /** @type {typeof __VLS_19.gridEdit} */
            onGridEdit: ((payload) => __VLS_ctx.emit('gridEdit', payload)),
        };
        const __VLS_23 = {
            /** @type {typeof __VLS_19.gridDelete} */
            onGridDelete: ((payload) => __VLS_ctx.emit('gridDelete', payload)),
        };
        const __VLS_24 = {
            /** @type {typeof __VLS_19.toolbarAction} */
            onToolbarAction: ((payload) => __VLS_ctx.emit('toolbarAction', payload)),
        };
        const __VLS_25 = {
            /** @type {typeof __VLS_19.searchSubmit} */
            onSearchSubmit: ((payload) => __VLS_ctx.emit('searchSubmit', payload)),
        };
        const __VLS_26 = {
            /** @type {typeof __VLS_19.searchAction} */
            onSearchAction: ((payload) => __VLS_ctx.emit('searchAction', payload)),
        };
        const __VLS_27 = {
            /** @type {typeof __VLS_19.runtimeEvent} */
            onRuntimeEvent: ((event) => __VLS_ctx.emit('runtimeEvent', event)),
        };
        var __VLS_17;
        var __VLS_18;
    }
    // @ts-ignore
    [overlays, resolvedData, resolvedData, formModels, formModels, searchFilters, searchFilters, loadingBlockId, loadingBlockId, loadingGridId, loadingGridId, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit, emit,];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
