/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
/**
 * @name: draggable-transition-group
 * @author:卜启缘
 * @date: 2021/5/1 23:15
 * @description：draggable-transition-group
 * @update: 2021/5/1 23:15
 */
import { computed } from 'vue';
import draggable from 'vuedraggable';
import { useVModel } from '@vueuse/core';
defineOptions({
    name: 'DraggableTransitionGroup',
});
const props = defineProps({
    moduleValue: {
        type: Array,
        default: () => [],
    },
    drag: {
        type: Boolean,
        default: false,
    },
    itemKey: {
        type: String,
        default: '_vid',
    },
    group: {
        type: Object,
        default: () => ({ name: 'components' }),
    },
    fallbackClass: String,
});
const emit = defineEmits(['update:moduleValue', 'update:drag']);
const list = useVModel(props, 'moduleValue', emit);
const isDrag = useVModel(props, 'drag', emit);
const dragOptions = computed(() => ({
    animation: 200,
    disabled: false,
    scroll: true,
    ghostClass: 'ghost',
}));
function isFillRemainingBlock(block) {
    return block?.layout?.fillRemaining === true || block?.props?.layout?.fillRemaining === true;
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
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.draggable | typeof __VLS_components.Draggable | typeof __VLS_components.draggable | typeof __VLS_components.Draggable} */
draggable;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onStart': {} },
    ...{ 'onEnd': {} },
    modelValue: (__VLS_ctx.list),
    ...{ class: "dragArea list-group" },
    ...{ class: ({ isDrag: __VLS_ctx.isDrag }) },
    componentData: ({
        tag: 'ul',
        type: 'transition-group',
        name: !__VLS_ctx.isDrag ? 'flip-list' : null,
    }),
    group: (__VLS_ctx.group),
    ...({ ...__VLS_ctx.dragOptions, ...__VLS_ctx.$attrs }),
    itemKey: (__VLS_ctx.itemKey),
}));
const __VLS_2 = __VLS_1({
    ...{ 'onStart': {} },
    ...{ 'onEnd': {} },
    modelValue: (__VLS_ctx.list),
    ...{ class: "dragArea list-group" },
    ...{ class: ({ isDrag: __VLS_ctx.isDrag }) },
    componentData: ({
        tag: 'ul',
        type: 'transition-group',
        name: !__VLS_ctx.isDrag ? 'flip-list' : null,
    }),
    group: (__VLS_ctx.group),
    ...({ ...__VLS_ctx.dragOptions, ...__VLS_ctx.$attrs }),
    itemKey: (__VLS_ctx.itemKey),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.start} */
    onStart: (...[$event]) => {
        return (__VLS_ctx.isDrag = true);
        // @ts-ignore
        [list, isDrag, isDrag, isDrag, group, dragOptions, $attrs, itemKey,];
    },
};
const __VLS_7 = {
    /** @type {typeof __VLS_5.end} */
    onEnd: (...[$event]) => {
        return (__VLS_ctx.isDrag = false);
        // @ts-ignore
        [isDrag,];
    },
};
var __VLS_8;
/** @type {__VLS_StyleScopedClasses['dragArea']} */ ;
/** @type {__VLS_StyleScopedClasses['list-group']} */ ;
/** @type {__VLS_StyleScopedClasses['isDrag']} */ ;
const { default: __VLS_9 } = __VLS_3.slots;
{
    const { item: __VLS_10 } = __VLS_3.slots;
    const [item] = __VLS_vSlot(__VLS_10);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: ({
                'item-drag': item.element.draggable,
                'fill-remaining-item': __VLS_ctx.isFillRemainingBlock(item.element),
            }) },
        'data-el': (item.element.draggable),
    });
    /** @type {__VLS_StyleScopedClasses['item-drag']} */ ;
    /** @type {__VLS_StyleScopedClasses['fill-remaining-item']} */ ;
    var __VLS_11 = {
        ...(item),
    };
    // @ts-ignore
    [isFillRemainingBlock,];
}
// @ts-ignore
[];
var __VLS_3;
var __VLS_4;
// @ts-ignore
var __VLS_12 = __VLS_11;
// @ts-ignore
[];
const __VLS_base = (await import('vue')).defineComponent({
    emits: {},
    props: {
        moduleValue: {
            type: Array,
            default: () => [],
        },
        drag: {
            type: Boolean,
            default: false,
        },
        itemKey: {
            type: String,
            default: '_vid',
        },
        group: {
            type: Object,
            default: () => ({ name: 'components' }),
        },
        fallbackClass: String,
    },
});
const __VLS_export = {};
export default {};
