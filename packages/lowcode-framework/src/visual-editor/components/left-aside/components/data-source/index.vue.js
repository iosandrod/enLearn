/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { DataBoard } from '../../../common/remix-icons';
import DataModel from './data-model.vue';
import DataFetch from './data-fetch.vue';
defineOptions({
    label: '数据源',
    order: 2,
    icon: DataBoard,
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeTabs | typeof __VLS_components.VxeTabs | typeof __VLS_components['vxe-tabs'] | typeof __VLS_components.vxeTabs | typeof __VLS_components.VxeTabs | typeof __VLS_components['vxe-tabs']} */
vxeTabs;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    type: "card",
    ...{ class: "data-source" },
}));
const __VLS_2 = __VLS_1({
    type: "card",
    ...{ class: "data-source" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
/** @type {__VLS_StyleScopedClasses['data-source']} */ ;
const { default: __VLS_6 } = __VLS_3.slots;
let __VLS_7;
/** @ts-ignore @type { | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane'] | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane']} */
vxeTabPane;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
    title: "数据模型",
    name: "model",
    lazy: true,
}));
const __VLS_9 = __VLS_8({
    title: "数据模型",
    name: "model",
    lazy: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
const { default: __VLS_12 } = __VLS_10.slots;
const __VLS_13 = DataModel;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({}));
const __VLS_15 = __VLS_14({}, ...__VLS_functionalComponentArgsRest(__VLS_14));
var __VLS_10;
let __VLS_18;
/** @ts-ignore @type { | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane'] | typeof __VLS_components.vxeTabPane | typeof __VLS_components.VxeTabPane | typeof __VLS_components['vxe-tab-pane']} */
vxeTabPane;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
    title: "数据接口",
    name: "fetch",
    lazy: true,
}));
const __VLS_20 = __VLS_19({
    title: "数据接口",
    name: "fetch",
    lazy: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
const { default: __VLS_23 } = __VLS_21.slots;
const __VLS_24 = DataFetch;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({}));
const __VLS_26 = __VLS_25({}, ...__VLS_functionalComponentArgsRest(__VLS_25));
var __VLS_21;
var __VLS_3;
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
