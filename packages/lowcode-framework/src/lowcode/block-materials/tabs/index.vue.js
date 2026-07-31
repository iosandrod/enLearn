/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref } from 'vue';
import LowCodeBlockChildren from '../../../components/LowCodeBlockChildren.vue';
const props = defineProps();
const emit = defineEmits();
const localActiveKey = ref('');
const isFillRemaining = computed(() => props.block.layout?.fillRemaining === true);
const tabsHeight = computed(() => (isFillRemaining.value ? '100%' : undefined));
const activeTabKey = computed(() => {
    const firstKey = props.block.tabs[0]?.key ?? '';
    return localActiveKey.value || props.block.defaultKey || firstKey;
});
function setActiveTab(key) {
    localActiveKey.value = key;
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
    ...{ class: "content-panel lc-node-tabs" },
});
/** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-node-tabs']} */ ;
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
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeTabs | typeof __VLS_components.VxeTabs | typeof __VLS_components['vxe-tabs'] | typeof __VLS_components.vxeTabs | typeof __VLS_components.VxeTabs | typeof __VLS_components['vxe-tabs']} */
vxeTabs;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.activeTabKey),
    height: (__VLS_ctx.tabsHeight),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onUpdate:modelValue': {} },
    modelValue: (__VLS_ctx.activeTabKey),
    height: (__VLS_ctx.tabsHeight),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.'update:modelValue'} */
    'onUpdate:modelValue': ((key) => __VLS_ctx.setActiveTab(String(key))),
};
const { default: __VLS_7 } = __VLS_3.slots;
for (const [tab] of __VLS_vFor((__VLS_ctx.block.tabs))) {
    let __VLS_8;
    /** @ts-ignore @type { | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane'] | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane']} */
    vxeTabPane;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
        key: (tab.key),
        title: (tab.label),
        name: (tab.key),
    }));
    const __VLS_10 = __VLS_9({
        key: (tab.key),
        title: (tab.label),
        name: (tab.key),
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    const { default: __VLS_13 } = __VLS_11.slots;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "lc-node-stack lc-tab-pane-stack" },
    });
    /** @type {__VLS_StyleScopedClasses['lc-node-stack']} */ ;
    /** @type {__VLS_StyleScopedClasses['lc-tab-pane-stack']} */ ;
    const __VLS_14 = LowCodeBlockChildren;
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
        blocks: (tab.blocks),
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
        blocks: (tab.blocks),
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
    // @ts-ignore
    [block, block, block, block, block, block, block, activeTabKey, tabsHeight, setActiveTab, resolvedData, formModels, searchFilters, loadingBlockId, loadingGridId, emit, emit, emit, emit, emit, emit, emit, emit,];
    var __VLS_11;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
var __VLS_4;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
