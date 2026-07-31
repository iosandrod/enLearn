/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * @description 左侧边栏
 */
import { computed, ref, watch } from 'vue';
import components from './components';
defineOptions({
    name: 'LeftAside',
});
const props = withDefaults(defineProps(), {
    excludeLabels: () => [],
    includeLabels: () => [],
});
const tabs = computed(() => Object.entries(components)
    .map(([name, component]) => {
    const { label, icon, order } = component;
    return { label, icon, name, order, comp: component };
})
    .filter((tab) => {
    const includeLabels = props.includeLabels;
    const excludeLabels = props.excludeLabels;
    if (includeLabels.length && !includeLabels.includes(tab.label)) {
        return false;
    }
    return !excludeLabels.includes(tab.label);
})
    .sort((a, b) => a.order - b.order));
const activeName = ref('');
watch(tabs, (nextTabs) => {
    if (!nextTabs.some((tab) => tab.name === activeName.value)) {
        activeName.value =
            nextTabs.find((tab) => tab.label === '图层')?.name || nextTabs[0]?.name || '';
    }
}, { immediate: true });
const __VLS_defaults = {
    excludeLabels: () => [],
    includeLabels: () => [],
};
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeTabs | typeof __VLS_components.VxeTabs | typeof __VLS_components['vxe-tabs'] | typeof __VLS_components.vxeTabs | typeof __VLS_components.VxeTabs | typeof __VLS_components['vxe-tabs']} */
vxeTabs;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.activeName),
    position: "left",
    ...{ class: "left-aside" },
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.activeName),
    position: "left",
    ...{ class: "left-aside" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
/** @type {__VLS_StyleScopedClasses['left-aside']} */ ;
const { default: __VLS_6 } = __VLS_3.slots;
for (const [tabItem] of __VLS_vFor((__VLS_ctx.tabs))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (tabItem.name),
    });
    let __VLS_7;
    /** @ts-ignore @type { | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane'] | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane']} */
    vxeTabPane;
    // @ts-ignore
    const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
        name: (tabItem.name),
        title: (tabItem.label),
        lazy: true,
    }));
    const __VLS_9 = __VLS_8({
        name: (tabItem.name),
        title: (tabItem.label),
        lazy: true,
    }, ...__VLS_functionalComponentArgsRest(__VLS_8));
    const { default: __VLS_12 } = __VLS_10.slots;
    {
        const { title: __VLS_13 } = __VLS_10.slots;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "tab-item" },
        });
        /** @type {__VLS_StyleScopedClasses['tab-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "tab-icon" },
        });
        /** @type {__VLS_StyleScopedClasses['tab-icon']} */ ;
        const __VLS_14 = (tabItem.icon);
        // @ts-ignore
        const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({}));
        const __VLS_16 = __VLS_15({}, ...__VLS_functionalComponentArgsRest(__VLS_15));
        (tabItem.label);
        // @ts-ignore
        [activeName, tabs,];
    }
    const __VLS_19 = (tabItem.comp);
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({}));
    const __VLS_21 = __VLS_20({}, ...__VLS_functionalComponentArgsRest(__VLS_20));
    (__VLS_ctx.$attrs);
    // @ts-ignore
    [$attrs,];
    var __VLS_10;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
    props: {},
});
export default {};
