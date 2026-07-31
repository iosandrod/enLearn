/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, useSlots } from 'vue';
import Header from './components/header/index.vue';
import LeftAside from './components/left-aside/index.vue';
import SimulatorEditor from './components/simulator-editor/simulator-editor.vue';
const __VLS_props = withDefaults(defineProps(), {
    showHeader: true,
    leftExcludeLabels: () => ['页面'],
    leftWidth: '340px',
    allowFormDesign: true,
    showPageSetting: true,
    workbenchMode: 'page',
});
const slots = useSlots();
const hasMetaSlot = computed(() => Boolean(slots.meta));
const hasActionsSlot = computed(() => Boolean(slots.actions));
const __VLS_defaults = {
    showHeader: true,
    leftExcludeLabels: () => ['页面'],
    leftWidth: '340px',
    allowFormDesign: true,
    showPageSetting: true,
    workbenchMode: 'page',
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
/** @type {__VLS_StyleScopedClasses['visual-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['visual-editor-workspace']} */ ;
/** @type {__VLS_StyleScopedClasses['visual-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['visual-editor-sidebar']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "visual-editor-shell" },
    ...{ class: ({
            'is-without-header': !__VLS_ctx.showHeader,
            'is-form-workbench': __VLS_ctx.workbenchMode === 'form',
        }) },
});
/** @type {__VLS_StyleScopedClasses['visual-editor-shell']} */ ;
/** @type {__VLS_StyleScopedClasses['is-without-header']} */ ;
/** @type {__VLS_StyleScopedClasses['is-form-workbench']} */ ;
if (__VLS_ctx.showHeader) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
        ...{ class: "visual-editor-header" },
    });
    /** @type {__VLS_StyleScopedClasses['visual-editor-header']} */ ;
    const __VLS_0 = Header || Header;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const { default: __VLS_5 } = __VLS_3.slots;
    if (__VLS_ctx.hasMetaSlot) {
        {
            const { meta: __VLS_6 } = __VLS_3.slots;
            var __VLS_7 = {};
            // @ts-ignore
            [showHeader, showHeader, workbenchMode, hasMetaSlot,];
        }
    }
    if (__VLS_ctx.hasActionsSlot) {
        {
            const { actions: __VLS_9 } = __VLS_3.slots;
            var __VLS_10 = {};
            // @ts-ignore
            [hasActionsSlot,];
        }
    }
    // @ts-ignore
    [];
    var __VLS_3;
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "visual-editor-workspace" },
});
/** @type {__VLS_StyleScopedClasses['visual-editor-workspace']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
    ...{ class: "visual-editor-sidebar" },
    ...{ style: ({ width: __VLS_ctx.leftWidth }) },
});
/** @type {__VLS_StyleScopedClasses['visual-editor-sidebar']} */ ;
const __VLS_12 = LeftAside;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
    excludeLabels: (__VLS_ctx.leftExcludeLabels),
}));
const __VLS_14 = __VLS_13({
    excludeLabels: (__VLS_ctx.leftExcludeLabels),
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "visual-editor-main" },
});
/** @type {__VLS_StyleScopedClasses['visual-editor-main']} */ ;
const __VLS_17 = SimulatorEditor;
// @ts-ignore
const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
    allowFormDesign: (__VLS_ctx.allowFormDesign),
    workbenchMode: (__VLS_ctx.workbenchMode),
}));
const __VLS_19 = __VLS_18({
    allowFormDesign: (__VLS_ctx.allowFormDesign),
    workbenchMode: (__VLS_ctx.workbenchMode),
}, ...__VLS_functionalComponentArgsRest(__VLS_18));
let __VLS_22;
/** @ts-ignore @type { | typeof __VLS_components.rightAttributePanel | typeof __VLS_components.RightAttributePanel | typeof __VLS_components['right-attribute-panel']} */
rightAttributePanel;
// @ts-ignore
const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
    showPageSetting: (__VLS_ctx.showPageSetting),
}));
const __VLS_24 = __VLS_23({
    showPageSetting: (__VLS_ctx.showPageSetting),
}, ...__VLS_functionalComponentArgsRest(__VLS_23));
// @ts-ignore
var __VLS_8 = __VLS_7, __VLS_11 = __VLS_10;
// @ts-ignore
[workbenchMode, leftWidth, leftExcludeLabels, allowFormDesign, showPageSetting,];
const __VLS_base = (await import('vue')).defineComponent({
    __typeProps: {},
    props: {},
});
const __VLS_export = {};
export default {};
