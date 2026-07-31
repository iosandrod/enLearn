/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, provide, useSlots } from 'vue';
import VisualEditor from '../visual-editor/index.vue';
import GlobalDialogHost from './GlobalDialogHost';
import { initVisualData, injectKey, localKey } from '../visual-editor/hooks/useVisualData';
import { provideVisualEditorPersistence } from '../visual-editor/hooks/useVisualPersistence';
const props = withDefaults(defineProps(), {
    initialData: null,
    initialPath: '',
    routePath: '',
    showHeader: true,
    leftExcludeLabels: () => ['页面'],
    leftWidth: '340px',
    allowFormDesign: true,
    showPageSetting: true,
    workbenchMode: 'page',
    persistToSession: true
});
const emit = defineEmits();
const visualData = initVisualData({
    initialData: props.initialData,
    initialPath: props.initialPath,
    routePath: props.routePath
});
const slots = useSlots();
const hasMetaSlot = computed(() => Boolean(slots.meta));
const hasActionsSlot = computed(() => Boolean(slots.actions));
provide(injectKey, visualData);
function cloneModel() {
    return JSON.parse(JSON.stringify(visualData.jsonData));
}
function persistToSession() {
    if (props.persistToSession === false || typeof sessionStorage === 'undefined')
        return;
    sessionStorage.setItem(localKey, JSON.stringify(visualData.jsonData));
}
function getSnapshot() {
    return {
        model: cloneModel(),
        currentPath: visualData.currentPath.value,
        currentPage: JSON.parse(JSON.stringify(visualData.currentPage.value))
    };
}
provideVisualEditorPersistence({
    saveProject: async () => {
        emit('save', getSnapshot());
    }
});
const __VLS_exposed = {
    getSnapshot
};
defineExpose(__VLS_exposed);
onMounted(() => {
    window.addEventListener('beforeunload', persistToSession);
});
onBeforeUnmount(() => {
    persistToSession();
    window.removeEventListener('beforeunload', persistToSession);
});
const __VLS_defaults = {
    initialData: null,
    initialPath: '',
    routePath: '',
    showHeader: true,
    leftExcludeLabels: () => ['页面'],
    leftWidth: '340px',
    allowFormDesign: true,
    showPageSetting: true,
    workbenchMode: 'page',
    persistToSession: true
};
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
const __VLS_0 = VisualEditor || VisualEditor;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    showHeader: (__VLS_ctx.showHeader),
    leftExcludeLabels: (__VLS_ctx.leftExcludeLabels),
    leftWidth: (__VLS_ctx.leftWidth),
    allowFormDesign: (__VLS_ctx.allowFormDesign),
    showPageSetting: (__VLS_ctx.showPageSetting),
    workbenchMode: (__VLS_ctx.workbenchMode),
}));
const __VLS_2 = __VLS_1({
    showHeader: (__VLS_ctx.showHeader),
    leftExcludeLabels: (__VLS_ctx.leftExcludeLabels),
    leftWidth: (__VLS_ctx.leftWidth),
    allowFormDesign: (__VLS_ctx.allowFormDesign),
    showPageSetting: (__VLS_ctx.showPageSetting),
    workbenchMode: (__VLS_ctx.workbenchMode),
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
const { default: __VLS_5 } = __VLS_3.slots;
if (__VLS_ctx.hasMetaSlot) {
    {
        const { meta: __VLS_6 } = __VLS_3.slots;
        var __VLS_7 = {};
        // @ts-ignore
        [showHeader, leftExcludeLabels, leftWidth, allowFormDesign, showPageSetting, workbenchMode, hasMetaSlot,];
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
let __VLS_12;
/** @ts-ignore @type { | typeof __VLS_components.GlobalDialogHost} */
GlobalDialogHost;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({}));
const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
// @ts-ignore
var __VLS_8 = __VLS_7, __VLS_11 = __VLS_10;
// @ts-ignore
[];
const __VLS_base = (await import('vue')).defineComponent({
    setup: () => __VLS_exposed,
    __typeEmits: {},
    __typeProps: {},
    props: {},
});
const __VLS_export = {};
export default {};
