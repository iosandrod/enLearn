/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useVModel } from '@vueuse/core';
import DraggableTransitionGroup from './draggable-transition-group.vue';
defineOptions({
    name: 'SlotItem',
});
const props = defineProps({
    slotKey: {
        type: String,
        default: '',
    },
    drag: {
        type: Boolean,
        default: false,
    },
    children: {
        type: Array,
        default: () => [],
    },
    selectComp: {
        type: Function,
        required: true,
    },
    onContextmenuBlock: {
        type: Function,
        required: true,
    },
});
const emit = defineEmits(['update:children', 'on-selected', 'update:drag']);
const isDrag = useVModel(props, 'drag', emit);
const slotChildren = useVModel(props, 'children', emit);
// 初始化时设置上次选中的组件
props.children.some((item) => item.focus && props.selectComp(item));
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
/** @type {__VLS_StyleScopedClasses['inner-draggable']} */ ;
const __VLS_0 = DraggableTransitionGroup || DraggableTransitionGroup;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.slotChildren),
    drag: (__VLS_ctx.isDrag),
    ...{ class: "inner-draggable" },
    ...{ class: ({ slot: !__VLS_ctx.slotChildren?.length }) },
    draggable: ".item-drag",
    dataSlot: (`插槽（${__VLS_ctx.slotKey}）\n 拖拽组件到此处`),
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.slotChildren),
    drag: (__VLS_ctx.isDrag),
    ...{ class: "inner-draggable" },
    ...{ class: ({ slot: !__VLS_ctx.slotChildren?.length }) },
    draggable: ".item-drag",
    dataSlot: (`插槽（${__VLS_ctx.slotKey}）\n 拖拽组件到此处`),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
/** @type {__VLS_StyleScopedClasses['inner-draggable']} */ ;
/** @type {__VLS_StyleScopedClasses['slot']} */ ;
const { default: __VLS_6 } = __VLS_3.slots;
{
    const { item: __VLS_7 } = __VLS_3.slots;
    const [{ element: innerElement }] = __VLS_vSlot(__VLS_7);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ onContextmenu: (...[$event]) => {
                return (__VLS_ctx.onContextmenuBlock($event, innerElement, __VLS_ctx.slotChildren));
                // @ts-ignore
                [slotChildren, slotChildren, slotChildren, isDrag, slotKey, onContextmenuBlock,];
            } },
        ...{ onMousedown: (...[$event]) => {
                return (__VLS_ctx.selectComp(innerElement));
                // @ts-ignore
                [selectComp,];
            } },
        ...{ class: "list-group-item inner" },
        'data-label': (innerElement.label),
        ...{ class: ({
                focus: innerElement.focus,
                focusWithChild: innerElement.focusWithChild,
            }) },
    });
    /** @type {__VLS_StyleScopedClasses['list-group-item']} */ ;
    /** @type {__VLS_StyleScopedClasses['inner']} */ ;
    /** @type {__VLS_StyleScopedClasses['focus']} */ ;
    /** @type {__VLS_StyleScopedClasses['focusWithChild']} */ ;
    let __VLS_8;
    /** @ts-ignore @type { | typeof __VLS_components.compRender | typeof __VLS_components.CompRender | typeof __VLS_components['comp-render'] | typeof __VLS_components.compRender | typeof __VLS_components.CompRender | typeof __VLS_components['comp-render']} */
    compRender;
    // @ts-ignore
    const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
        element: (innerElement),
        ...{ style: ({
                pointerEvents: Object.keys(innerElement.props?.slots || {}).length ? 'auto' : 'none',
            }) },
    }));
    const __VLS_10 = __VLS_9({
        element: (innerElement),
        ...{ style: ({
                pointerEvents: Object.keys(innerElement.props?.slots || {}).length ? 'auto' : 'none',
            }) },
    }, ...__VLS_functionalComponentArgsRest(__VLS_9));
    const { default: __VLS_13 } = __VLS_11.slots;
    for (const [value, key] of __VLS_vFor((innerElement.props?.slots))) {
        {
            const { [__VLS_tryAsConstant(key)]: __VLS_14 } = __VLS_11.slots;
            let __VLS_15;
            /** @ts-ignore @type { | typeof __VLS_components.SlotItem} */
            SlotItem;
            // @ts-ignore
            const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
                children: (value.children),
                drag: (__VLS_ctx.isDrag),
                slotKey: (key),
                onContextmenuBlock: (__VLS_ctx.onContextmenuBlock),
                selectComp: (__VLS_ctx.selectComp),
            }));
            const __VLS_17 = __VLS_16({
                children: (value.children),
                drag: (__VLS_ctx.isDrag),
                slotKey: (key),
                onContextmenuBlock: (__VLS_ctx.onContextmenuBlock),
                selectComp: (__VLS_ctx.selectComp),
            }, ...__VLS_functionalComponentArgsRest(__VLS_16));
            // @ts-ignore
            [isDrag, onContextmenuBlock, selectComp,];
        }
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    var __VLS_11;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    emits: {},
    props: {
        slotKey: {
            type: String,
            default: '',
        },
        drag: {
            type: Boolean,
            default: false,
        },
        children: {
            type: Array,
            default: () => [],
        },
        selectComp: {
            type: Function,
            required: true,
        },
        onContextmenuBlock: {
            type: Function,
            required: true,
        },
    },
});
export default {};
