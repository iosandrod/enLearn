/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VisualEditorProvider from './VisualEditorProvider.vue';
import { convertLowCodePageSchemaToVisualEditor } from '../lowcode/visual-converters';
import { prepareLowCodePageSchema } from '../lowcode/schema';
import { convertVisualEditorToLowCode } from '../utils/visual-to-lowcode';
import { closeGlobalDialog, findGlobalDialog, openGlobalDialog, } from '../runtime/global-dialog';
import { useLowCodeHost, } from '../core/host';
const props = defineProps();
function getLowCodeDesignerLoadPageBus() {
    const scope = globalThis;
    scope.__enlearnLowCodeDesignerLoadPageBus ??= { subscribers: [] };
    return scope.__enlearnLowCodeDesignerLoadPageBus;
}
function subscribeLowCodeDesignerLoadPage(subscriber) {
    const bus = getLowCodeDesignerLoadPageBus();
    bus.subscribers ??= [];
    bus.subscribers.push(subscriber);
    if (bus.pendingCode) {
        const pendingCode = bus.pendingCode;
        bus.pendingCode = '';
        subscriber(pendingCode);
    }
    return () => {
        bus.subscribers = (bus.subscribers ?? []).filter((item) => item !== subscriber);
    };
}
let unsubscribeDesignerLoadPage = null;
const host = useLowCodeHost(() => ({
    serviceApi: props.serviceApi,
    router: props.router,
    locale: props.locale,
    messages: props.messages,
    theme: props.theme,
}));
const t = (key, fallback) => host.t(key, fallback);
const page = ref(null);
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const ready = ref(false);
const providerKey = ref(0);
const providerRef = ref(null);
const errorMessage = ref('');
const message = ref('');
const messageType = ref('success');
const visualModel = ref(null);
const loadingPageCode = ref('');
const pagePickerLoading = ref(false);
const pagePickerRows = ref([]);
const selectedPickerPage = ref(null);
const designerThemeClass = computed(() => host.getTheme().className);
const designerThemeStyle = computed(() => Object.fromEntries(Object.entries(host.getTheme().variables ?? {}).map(([key, value]) => [key, String(value)])));
const form = ref({
    code: props.code || 'visual-admin-page',
    route: props.code ? `/dashboard/low-code/${props.code}` : '/dashboard/low-code/visual-admin-page',
    title: '可视化低代码页面',
    description: '',
    status: 'draft'
});
const statusOptions = [
    { label: '草稿', value: 'draft' },
    { label: '发布', value: 'published' },
    { label: '归档', value: 'archived' }
];
const pageInfoSchema = {
    fields: [
        {
            field: 'code',
            label: '页面编码',
            component: 'vxe-input',
            props: { clearable: true },
        },
        {
            field: 'route',
            label: '后台路由',
            component: 'vxe-input',
            props: { clearable: true },
        },
        {
            field: 'title',
            label: '页面标题',
            component: 'vxe-input',
            props: { clearable: true },
        },
        {
            field: 'status',
            label: '状态',
            component: 'vxe-select',
            options: statusOptions,
        },
        {
            field: 'description',
            label: '描述',
            component: 'vxe-textarea',
            props: { rows: 3 },
        },
    ],
    actions: [],
};
const pagePickerColumns = [
    { type: 'seq', title: '#', width: 56 },
    { field: 'title', title: '标题', minWidth: 180 },
    { field: 'code', title: '编码', minWidth: 160 },
    { field: 'route', title: '路由', minWidth: 260 },
    { field: 'status', title: '状态', width: 96 },
    { field: 'version', title: '版本', width: 88 },
    { field: 'updated_at', title: '更新时间', width: 190 }
];
const fallbackVisualModel = computed(() => ({
    pages: {
        '/': {
            title: form.value.title || '首页',
            path: '/',
            config: {
                bgColor: '',
                bgImage: '',
                keepAlive: false
            },
            blocks: [],
            overlays: []
        }
    },
    models: [],
    actions: {
        fetch: {
            name: '接口请求',
            apis: []
        },
        dialog: {
            name: '对话框',
            handlers: []
        }
    }
}));
function isVisualEditorModel(value) {
    return (typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof value.pages === 'object' &&
        value.pages !== null);
}
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeSchema(schema) {
    if (!schema)
        return fallbackVisualModel.value;
    return isVisualEditorModel(schema.visualEditor)
        ? schema.visualEditor
        : convertLowCodePageSchemaToVisualEditor(schema);
}
function fillForm(nextPage) {
    if (!nextPage)
        return;
    form.value = {
        code: nextPage.code,
        route: nextPage.route,
        title: nextPage.title,
        description: nextPage.description ?? '',
        status: nextPage.status
    };
}
function resetDesignerFrame() {
    loading.value = true;
    ready.value = false;
    errorMessage.value = '';
    message.value = '';
}
function applyVisualPage(nextPage) {
    page.value = nextPage;
    fillForm(nextPage);
    visualModel.value = normalizeSchema(nextPage.schema);
    ready.value = true;
    providerKey.value += 1;
}
function createPageCode() {
    return `visual-page-${Date.now().toString(36)}`;
}
function createBlankPage() {
    const code = createPageCode();
    loading.value = false;
    errorMessage.value = '';
    page.value = null;
    form.value = {
        code,
        route: `/dashboard/low-code/${code}`,
        title: '可视化低代码页面',
        description: '',
        status: 'draft'
    };
    visualModel.value = fallbackVisualModel.value;
    ready.value = true;
    providerKey.value += 1;
    message.value = '已创建空白设计页。';
    messageType.value = 'success';
}
async function loadPageByCode(code) {
    const nextCode = code.trim();
    if (!nextCode || loadingPageCode.value === nextCode)
        return;
    loadingPageCode.value = nextCode;
    resetDesignerFrame();
    try {
        const nextPage = await host.getServiceApi().invoke('lowcode', 'getPage', {
            code: nextCode,
            includeData: false
        });
        applyVisualPage(nextPage);
        message.value = `已加载 ${nextPage.title || nextPage.code}。`;
        messageType.value = 'success';
    }
    catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : '低代码页面加载失败。';
    }
    finally {
        loading.value = false;
        if (loadingPageCode.value === nextCode) {
            loadingPageCode.value = '';
        }
    }
}
async function reload(codeOverride) {
    const code = typeof codeOverride === 'string'
        ? codeOverride
        : page.value?.code || props.code || '';
    if (code) {
        await loadPageByCode(code);
        return;
    }
    resetDesignerFrame();
    try {
        page.value = null;
        visualModel.value = fallbackVisualModel.value;
        ready.value = true;
        providerKey.value += 1;
    }
    finally {
        loading.value = false;
    }
}
function reloadCurrent() {
    reload();
}
function handleDesignerLoadPage(code) {
    if (!code)
        return;
    loadPageByCode(code);
}
watch(() => props.code, (nextCode) => {
    reload(nextCode || '');
}, { immediate: true });
onMounted(() => {
    unsubscribeDesignerLoadPage = subscribeLowCodeDesignerLoadPage(handleDesignerLoadPage);
});
onBeforeUnmount(() => {
    unsubscribeDesignerLoadPage?.();
    unsubscribeDesignerLoadPage = null;
});
function buildSchema(payload) {
    const previousSchema = (page.value?.schema ?? {});
    const converted = convertVisualEditorToLowCode(payload.model, payload.currentPage);
    const hasRuntimeBlocks = converted.blocks.length > 0;
    const hasVisualOverlays = Array.isArray(payload.currentPage.overlays);
    const hasRuntimeOverlays = converted.overlays.length > 0;
    const hasRuntimeContent = hasRuntimeBlocks || hasRuntimeOverlays;
    return prepareLowCodePageSchema({
        ...previousSchema,
        code: form.value.code,
        route: form.value.route,
        title: form.value.title,
        description: form.value.description,
        layout: 'dashboard',
        status: form.value.status,
        keepAlive: true,
        config: payload.currentPage.config,
        visualEditor: payload.model,
        dataSources: hasRuntimeContent
            ? converted.dataSources
            : isPlainRecord(previousSchema.dataSources)
                ? previousSchema.dataSources
                : {},
        blocks: hasRuntimeBlocks
            ? converted.blocks
            : Array.isArray(previousSchema.blocks)
                ? previousSchema.blocks
                : [],
        overlays: hasVisualOverlays
            ? converted.overlays
            : Array.isArray(previousSchema.overlays)
                ? previousSchema.overlays
                : []
    });
}
async function saveVisualProject(payload, overrideStatus) {
    if (!form.value.code.trim() || !form.value.route.trim() || !form.value.title.trim()) {
        throw new Error('页面编码、路由和标题不能为空。');
    }
    saving.value = true;
    if (overrideStatus === 'published') {
        publishing.value = true;
    }
    message.value = '';
    try {
        const originalStatus = form.value.status;
        if (overrideStatus) {
            form.value.status = overrideStatus;
        }
        const schema = buildSchema(payload);
        const saved = await host.getServiceApi().invoke('lowcode', 'savePage', {
            code: page.value?.code || form.value.code,
            schema
        });
        page.value = saved;
        fillForm(saved);
        message.value = `已保存 ${saved.code}，版本 ${saved.version}。`;
        messageType.value = 'success';
        if (!overrideStatus) {
            form.value.status = originalStatus;
        }
    }
    catch (error) {
        message.value = error instanceof Error ? error.message : '保存失败。';
        messageType.value = 'error';
        throw error;
    }
    finally {
        saving.value = false;
        publishing.value = false;
    }
}
function requestSave() {
    const snapshot = providerRef.value?.getSnapshot();
    if (!snapshot) {
        message.value = '请等待设计器初始化完成后再保存。';
        messageType.value = 'error';
        return;
    }
    saveVisualProject(snapshot).catch(() => undefined);
}
function requestPublish() {
    const snapshot = providerRef.value?.getSnapshot();
    if (!snapshot) {
        message.value = '请等待设计器初始化完成后再发布。';
        messageType.value = 'error';
        return;
    }
    saveVisualProject(snapshot, 'published').catch(() => undefined);
}
async function fetchPageRows() {
    pagePickerLoading.value = true;
    try {
        pagePickerRows.value = await host.getServiceApi().invoke('lowcode', 'listPages');
        selectedPickerPage.value = null;
    }
    catch (error) {
        message.value = error instanceof Error ? error.message : '页面列表加载失败。';
        messageType.value = 'error';
    }
    finally {
        pagePickerLoading.value = false;
    }
}
async function openPagePicker() {
    if (findGlobalDialog('lowcode-page-picker'))
        return;
    selectedPickerPage.value = null;
    void openGlobalDialog({
        id: 'lowcode-page-picker',
        title: '加载页面',
        width: 'min(1040px, calc(100vw - 48px))',
        height: 'min(680px, calc(100vh - 96px))',
        showFooter: true,
        content: {
            className: 'visual-designer-dialog',
            children: [
                {
                    type: 'toolbar',
                    className: 'visual-designer-dialog-toolbar lc-actions',
                    actions: [
                        {
                            code: 'refresh',
                            label: '刷新列表',
                            status: 'primary',
                            loading: pagePickerLoading,
                            onClick: () => {
                                void fetchPageRows();
                            },
                        },
                    ],
                },
                {
                    type: 'grid',
                    grid: {
                        rows: pagePickerRows,
                        columns: pagePickerColumns,
                        loading: pagePickerLoading,
                        props: {
                            border: true,
                            height: 500,
                            rowConfig: { isCurrent: true, keyField: 'id' },
                        },
                        events: {
                            'current-row-change': handlePagePickerCurrentChange,
                            'row-dblclick': handlePagePickerDblclick,
                        },
                    },
                },
            ],
        },
        actions: [
            {
                code: 'cancel',
                label: '取消',
                role: 'cancel',
            },
            {
                code: 'confirm',
                label: '加载',
                role: 'confirm',
                status: 'primary',
                disabled: computed(() => !selectedPickerPage.value),
                loading,
                onClick: () => {
                    if (!selectedPickerPage.value)
                        return false;
                    void confirmLoadSelectedPage();
                },
            },
        ],
    });
    await fetchPageRows();
}
function readPagePickerRow(payload) {
    if (typeof payload !== 'object' || payload === null)
        return null;
    const row = payload.row;
    return typeof row === 'object' && row !== null ? row : null;
}
function handlePagePickerCurrentChange(payload) {
    selectedPickerPage.value = readPagePickerRow(payload);
}
function handlePagePickerDblclick(payload) {
    const row = readPagePickerRow(payload);
    if (!row)
        return;
    selectedPickerPage.value = row;
    confirmLoadSelectedPage();
}
async function confirmLoadSelectedPage() {
    if (!selectedPickerPage.value)
        return;
    const code = selectedPickerPage.value.code;
    await closeGlobalDialog('lowcode-page-picker', {
        action: 'confirm',
        values: {},
    });
    await loadPageByCode(code);
}
function normalizePageInfoForm(value) {
    const status = String(value.status ?? 'draft');
    return {
        code: String(value.code ?? ''),
        route: String(value.route ?? ''),
        title: String(value.title ?? ''),
        description: String(value.description ?? ''),
        status: ['draft', 'published', 'archived'].includes(status)
            ? status
            : 'draft',
    };
}
function openPageInfo() {
    if (findGlobalDialog('lowcode-page-info'))
        return;
    void openGlobalDialog({
        id: 'lowcode-page-info',
        title: '页面信息',
        width: 'min(760px, calc(100vw - 48px))',
        showFooter: true,
        model: { ...form.value },
        form: {
            schema: pageInfoSchema,
        },
        actions: [
            {
                code: 'cancel',
                label: '取消',
                role: 'cancel',
            },
            {
                code: 'confirm',
                label: '确定',
                role: 'confirm',
                status: 'primary',
            },
        ],
        onConfirm: ({ model }) => {
            form.value = normalizePageInfoForm(model);
            message.value = '页面信息已更新。';
            messageType.value = 'success';
        },
    });
}
async function goBackToList() {
    await host.getRouter().push(props.backRoute ?? '/dashboard/low-code');
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "visual-designer-page" },
    ...{ class: (__VLS_ctx.designerThemeClass) },
    ...{ style: (__VLS_ctx.designerThemeStyle) },
});
/** @type {__VLS_StyleScopedClasses['visual-designer-page']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "visual-designer-frame" },
});
/** @type {__VLS_StyleScopedClasses['visual-designer-frame']} */ ;
if (__VLS_ctx.loading) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "content-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "page-description" },
    });
    /** @type {__VLS_StyleScopedClasses['page-description']} */ ;
}
else if (__VLS_ctx.errorMessage) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "content-panel" },
    });
    /** @type {__VLS_StyleScopedClasses['content-panel']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        ...{ class: "page-title" },
    });
    /** @type {__VLS_StyleScopedClasses['page-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "page-description" },
    });
    /** @type {__VLS_StyleScopedClasses['page-description']} */ ;
    (__VLS_ctx.errorMessage);
}
else {
    let __VLS_0;
    /** @ts-ignore @type { | typeof __VLS_components.ClientOnly | typeof __VLS_components.ClientOnly} */
    ClientOnly;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    const { default: __VLS_5 } = __VLS_3.slots;
    if (__VLS_ctx.ready) {
        const __VLS_6 = VisualEditorProvider || VisualEditorProvider;
        // @ts-ignore
        const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
            ...{ 'onSave': {} },
            ref: "providerRef",
            key: (__VLS_ctx.providerKey),
            initialData: (__VLS_ctx.visualModel),
        }));
        const __VLS_8 = __VLS_7({
            ...{ 'onSave': {} },
            ref: "providerRef",
            key: (__VLS_ctx.providerKey),
            initialData: (__VLS_ctx.visualModel),
        }, ...__VLS_functionalComponentArgsRest(__VLS_7));
        let __VLS_11;
        const __VLS_12 = {
            /** @type {typeof __VLS_11.save} */
            onSave: (__VLS_ctx.saveVisualProject),
        };
        var __VLS_13;
        const { default: __VLS_15 } = __VLS_9.slots;
        {
            const { meta: __VLS_16 } = __VLS_9.slots;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "visual-designer-summary" },
            });
            /** @type {__VLS_StyleScopedClasses['visual-designer-summary']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (__VLS_ctx.form.title || '未命名页面');
            if (__VLS_ctx.message) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: (['visual-designer-message', __VLS_ctx.messageType]) },
                });
                /** @type {__VLS_StyleScopedClasses['visual-designer-message']} */ ;
                (__VLS_ctx.message);
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (__VLS_ctx.form.code);
                (__VLS_ctx.form.route);
            }
            // @ts-ignore
            [designerThemeClass, designerThemeStyle, loading, errorMessage, errorMessage, ready, providerKey, visualModel, saveVisualProject, form, form, form, message, message, messageType,];
        }
        {
            const { actions: __VLS_17 } = __VLS_9.slots;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "visual-designer-toolbar lc-actions" },
            });
            /** @type {__VLS_StyleScopedClasses['visual-designer-toolbar']} */ ;
            /** @type {__VLS_StyleScopedClasses['lc-actions']} */ ;
            let __VLS_18;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
                ...{ 'onClick': {} },
                size: "mini",
                status: "primary",
                loading: (__VLS_ctx.pagePickerLoading),
            }));
            const __VLS_20 = __VLS_19({
                ...{ 'onClick': {} },
                size: "mini",
                status: "primary",
                loading: (__VLS_ctx.pagePickerLoading),
            }, ...__VLS_functionalComponentArgsRest(__VLS_19));
            let __VLS_23;
            const __VLS_24 = {
                /** @type {typeof __VLS_23.click} */
                onClick: (__VLS_ctx.openPagePicker),
            };
            const { default: __VLS_25 } = __VLS_21.slots;
            // @ts-ignore
            [pagePickerLoading, openPagePicker,];
            var __VLS_21;
            var __VLS_22;
            let __VLS_26;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                ...{ 'onClick': {} },
                size: "mini",
            }));
            const __VLS_28 = __VLS_27({
                ...{ 'onClick': {} },
                size: "mini",
            }, ...__VLS_functionalComponentArgsRest(__VLS_27));
            let __VLS_31;
            const __VLS_32 = {
                /** @type {typeof __VLS_31.click} */
                onClick: (__VLS_ctx.createBlankPage),
            };
            const { default: __VLS_33 } = __VLS_29.slots;
            // @ts-ignore
            [createBlankPage,];
            var __VLS_29;
            var __VLS_30;
            let __VLS_34;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_35 = __VLS_asFunctionalComponent1(__VLS_34, new __VLS_34({
                ...{ 'onClick': {} },
                size: "mini",
            }));
            const __VLS_36 = __VLS_35({
                ...{ 'onClick': {} },
                size: "mini",
            }, ...__VLS_functionalComponentArgsRest(__VLS_35));
            let __VLS_39;
            const __VLS_40 = {
                /** @type {typeof __VLS_39.click} */
                onClick: (__VLS_ctx.openPageInfo),
            };
            const { default: __VLS_41 } = __VLS_37.slots;
            // @ts-ignore
            [openPageInfo,];
            var __VLS_37;
            var __VLS_38;
            let __VLS_42;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
                ...{ 'onClick': {} },
                size: "mini",
                loading: (__VLS_ctx.loading),
            }));
            const __VLS_44 = __VLS_43({
                ...{ 'onClick': {} },
                size: "mini",
                loading: (__VLS_ctx.loading),
            }, ...__VLS_functionalComponentArgsRest(__VLS_43));
            let __VLS_47;
            const __VLS_48 = {
                /** @type {typeof __VLS_47.click} */
                onClick: (__VLS_ctx.reloadCurrent),
            };
            const { default: __VLS_49 } = __VLS_45.slots;
            // @ts-ignore
            [loading, reloadCurrent,];
            var __VLS_45;
            var __VLS_46;
            let __VLS_50;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_51 = __VLS_asFunctionalComponent1(__VLS_50, new __VLS_50({
                ...{ 'onClick': {} },
                size: "mini",
                status: "primary",
                loading: (__VLS_ctx.saving),
            }));
            const __VLS_52 = __VLS_51({
                ...{ 'onClick': {} },
                size: "mini",
                status: "primary",
                loading: (__VLS_ctx.saving),
            }, ...__VLS_functionalComponentArgsRest(__VLS_51));
            let __VLS_55;
            const __VLS_56 = {
                /** @type {typeof __VLS_55.click} */
                onClick: (__VLS_ctx.requestSave),
            };
            const { default: __VLS_57 } = __VLS_53.slots;
            // @ts-ignore
            [saving, requestSave,];
            var __VLS_53;
            var __VLS_54;
            let __VLS_58;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
                ...{ 'onClick': {} },
                size: "mini",
                status: "success",
                loading: (__VLS_ctx.publishing),
            }));
            const __VLS_60 = __VLS_59({
                ...{ 'onClick': {} },
                size: "mini",
                status: "success",
                loading: (__VLS_ctx.publishing),
            }, ...__VLS_functionalComponentArgsRest(__VLS_59));
            let __VLS_63;
            const __VLS_64 = {
                /** @type {typeof __VLS_63.click} */
                onClick: (__VLS_ctx.requestPublish),
            };
            const { default: __VLS_65 } = __VLS_61.slots;
            // @ts-ignore
            [publishing, requestPublish,];
            var __VLS_61;
            var __VLS_62;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ onClick: (__VLS_ctx.goBackToList) },
            });
            let __VLS_66;
            /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
            vxeButton;
            // @ts-ignore
            const __VLS_67 = __VLS_asFunctionalComponent1(__VLS_66, new __VLS_66({
                size: "mini",
            }));
            const __VLS_68 = __VLS_67({
                size: "mini",
            }, ...__VLS_functionalComponentArgsRest(__VLS_67));
            const { default: __VLS_71 } = __VLS_69.slots;
            // @ts-ignore
            [goBackToList,];
            var __VLS_69;
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
        var __VLS_9;
        var __VLS_10;
    }
    // @ts-ignore
    [];
    var __VLS_3;
}
// @ts-ignore
var __VLS_14 = __VLS_13;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
