/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { useVModel } from '@vueuse/core';
import { BASE_URL } from '../../utils';
defineOptions({
    name: 'Preview',
});
const props = defineProps({
    visible: {
        type: Boolean,
        default: false,
    },
});
const emits = defineEmits(['update:visible']);
const dialogVisible = useVModel(props, 'visible', emits);
const previewUrl = `${BASE_URL}preview/${location.hash}`;
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
/** @ts-ignore @type { | typeof __VLS_components.vxeModal | typeof __VLS_components.VxeModal | typeof __VLS_components['vxe-modal'] | typeof __VLS_components.vxeModal | typeof __VLS_components.VxeModal | typeof __VLS_components['vxe-modal']} */
vxeModal;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    modelValue: (__VLS_ctx.dialogVisible),
    className: "h5-preview",
    showHeader: (false),
    width: "360px",
}));
const __VLS_2 = __VLS_1({
    modelValue: (__VLS_ctx.dialogVisible),
    className: "h5-preview",
    showHeader: (false),
    width: "360px",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_5;
const { default: __VLS_6 } = __VLS_3.slots;
if (__VLS_ctx.dialogVisible) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.iframe, __VLS_intrinsics.iframe)({
        ...{ style: ({ width: '100%', height: '100%' }) },
        src: (__VLS_ctx.previewUrl),
        frameborder: "0",
        scrolling: "auto",
    });
}
// @ts-ignore
[dialogVisible, dialogVisible, previewUrl,];
var __VLS_3;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    emits: {},
    props: {
        visible: {
            type: Boolean,
            default: false,
        },
    },
});
export default {};
