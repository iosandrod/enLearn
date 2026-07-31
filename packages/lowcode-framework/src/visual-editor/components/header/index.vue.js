/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, unref, useSlots } from 'vue';
import { Link as LinkIcon, Promotion, VideoPlay } from '../common/remix-icons';
import Preview from './preview.vue';
import { useTools } from './useTools';
import { useVisualData, localKey } from '../../hooks/useVisualData';
defineOptions({
    name: 'PageHeader',
});
const isShowH5Preview = ref(false);
const tools = useTools();
const slots = useSlots();
const hasActionsSlot = computed(() => Boolean(slots.actions));
const { jsonData, undoHistory, redoHistory } = useVisualData();
const isToolDisabled = (toolItem) => unref(toolItem.disabled) === true;
const handleToolClick = (toolItem) => {
    if (isToolDisabled(toolItem))
        return;
    toolItem.onClick();
};
const runPreview = () => {
    sessionStorage.setItem(localKey, JSON.stringify(jsonData));
    localStorage.setItem(localKey, JSON.stringify(jsonData));
    isShowH5Preview.value = true;
};
const isEditableShortcutTarget = (target) => {
    if (!(target instanceof HTMLElement))
        return false;
    const tagName = target.tagName.toLowerCase();
    return (target.isContentEditable ||
        ['input', 'textarea', 'select'].includes(tagName) ||
        Boolean(target.closest('.monaco-editor')));
};
const handleHistoryShortcut = (event) => {
    if (isEditableShortcutTarget(event.target))
        return;
    if (!event.ctrlKey && !event.metaKey)
        return;
    const key = event.key.toLowerCase();
    const handled = key === 'z'
        ? event.shiftKey
            ? redoHistory()
            : undoHistory()
        : key === 'y'
            ? redoHistory()
            : false;
    if (handled) {
        event.preventDefault();
        event.stopPropagation();
    }
};
onMounted(() => {
    window.addEventListener('keydown', handleHistoryShortcut);
});
onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleHistoryShortcut);
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-icon']} */ ;
/** @type {__VLS_StyleScopedClasses['visual-editor-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-link']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['repo-dropdown']} */ ;
/** @type {__VLS_StyleScopedClasses['toolbar-icon']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "visual-editor-toolbar" },
    ...{ class: ({
            'has-actions': __VLS_ctx.hasActionsSlot,
        }) },
});
/** @type {__VLS_StyleScopedClasses['visual-editor-toolbar']} */ ;
/** @type {__VLS_StyleScopedClasses['has-actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "toolbar-tools" },
});
/** @type {__VLS_StyleScopedClasses['toolbar-tools']} */ ;
for (const [toolItem, toolIndex] of __VLS_vFor((__VLS_ctx.tools))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (toolIndex),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.handleToolClick(toolItem));
                // @ts-ignore
                [hasActionsSlot, tools, handleToolClick,];
            } },
        ...{ class: "tool-item" },
        ...{ class: ({ 'is-disabled': __VLS_ctx.isToolDisabled(toolItem) }) },
        type: "button",
        disabled: (__VLS_ctx.isToolDisabled(toolItem)),
    });
    /** @type {__VLS_StyleScopedClasses['tool-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-disabled']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "toolbar-icon" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-icon']} */ ;
    const __VLS_0 = (toolItem.icon);
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "title" },
    });
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    (toolItem.title);
    // @ts-ignore
    [isToolDisabled, isToolDisabled,];
}
if (__VLS_ctx.hasActionsSlot) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "toolbar-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['toolbar-actions']} */ ;
    var __VLS_5 = {};
}
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "right-tools" },
});
/** @type {__VLS_StyleScopedClasses['right-tools']} */ ;
let __VLS_7;
/** @ts-ignore @type { | typeof __VLS_components.vxeTooltip | typeof __VLS_components.VxeTooltip | typeof __VLS_components['vxe-tooltip'] | typeof __VLS_components.vxeTooltip | typeof __VLS_components.VxeTooltip | typeof __VLS_components['vxe-tooltip']} */
vxeTooltip;
// @ts-ignore
const __VLS_8 = __VLS_asFunctionalComponent1(__VLS_7, new __VLS_7({
    ...{ class: "item" },
    content: "预览",
    placement: "bottom",
}));
const __VLS_9 = __VLS_8({
    ...{ class: "item" },
    content: "预览",
    placement: "bottom",
}, ...__VLS_functionalComponentArgsRest(__VLS_8));
/** @type {__VLS_StyleScopedClasses['item']} */ ;
const { default: __VLS_12 } = __VLS_10.slots;
let __VLS_13;
/** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
vxeButton;
// @ts-ignore
const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
    ...{ 'onClick': {} },
    status: "primary",
    size: "large",
    circle: true,
    ...{ class: "run-button" },
}));
const __VLS_15 = __VLS_14({
    ...{ 'onClick': {} },
    status: "primary",
    size: "large",
    circle: true,
    ...{ class: "run-button" },
}, ...__VLS_functionalComponentArgsRest(__VLS_14));
let __VLS_18;
const __VLS_19 = {
    /** @type {typeof __VLS_18.click} */
    onClick: (__VLS_ctx.runPreview),
};
/** @type {__VLS_StyleScopedClasses['run-button']} */ ;
const { default: __VLS_20 } = __VLS_16.slots;
let __VLS_21;
/** @ts-ignore @type { | typeof __VLS_components.VideoPlay} */
VideoPlay;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({}));
const __VLS_23 = __VLS_22({}, ...__VLS_functionalComponentArgsRest(__VLS_22));
// @ts-ignore
[hasActionsSlot, runPreview,];
var __VLS_16;
var __VLS_17;
// @ts-ignore
[];
var __VLS_10;
__VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
    ...{ class: "repo-dropdown" },
});
/** @type {__VLS_StyleScopedClasses['repo-dropdown']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({
    ...{ class: "repo-link" },
    'aria-label': "项目链接",
});
/** @type {__VLS_StyleScopedClasses['repo-link']} */ ;
let __VLS_26;
/** @ts-ignore @type { | typeof __VLS_components.LinkIcon} */
LinkIcon;
// @ts-ignore
const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({}));
const __VLS_28 = __VLS_27({}, ...__VLS_functionalComponentArgsRest(__VLS_27));
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "repo-menu" },
});
/** @type {__VLS_StyleScopedClasses['repo-menu']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ class: "repo-menu-link" },
    href: "https://github.com/buqiyuan/vite-vue3-lowcode",
    target: "_blank",
    rel: "noreferrer",
});
/** @type {__VLS_StyleScopedClasses['repo-menu-link']} */ ;
let __VLS_31;
/** @ts-ignore @type { | typeof __VLS_components.LinkIcon} */
LinkIcon;
// @ts-ignore
const __VLS_32 = __VLS_asFunctionalComponent1(__VLS_31, new __VLS_31({}));
const __VLS_33 = __VLS_32({}, ...__VLS_functionalComponentArgsRest(__VLS_32));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
__VLS_asFunctionalElement1(__VLS_intrinsics.a, __VLS_intrinsics.a)({
    ...{ class: "repo-menu-link" },
    href: "https://gitee.com/buqiyuan/vite-vue3-lowcode",
    target: "_blank",
    rel: "noreferrer",
});
/** @type {__VLS_StyleScopedClasses['repo-menu-link']} */ ;
let __VLS_36;
/** @ts-ignore @type { | typeof __VLS_components.Promotion} */
Promotion;
// @ts-ignore
const __VLS_37 = __VLS_asFunctionalComponent1(__VLS_36, new __VLS_36({}));
const __VLS_38 = __VLS_37({}, ...__VLS_functionalComponentArgsRest(__VLS_37));
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
const __VLS_41 = Preview;
// @ts-ignore
const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
    visible: (__VLS_ctx.isShowH5Preview),
}));
const __VLS_43 = __VLS_42({
    visible: (__VLS_ctx.isShowH5Preview),
}, ...__VLS_functionalComponentArgsRest(__VLS_42));
// @ts-ignore
var __VLS_6 = __VLS_5;
// @ts-ignore
[isShowH5Preview,];
const __VLS_base = (await import('vue')).defineComponent({});
const __VLS_export = {};
export default {};
