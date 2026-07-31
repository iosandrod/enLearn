/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref, computed } from 'vue';
import { ElMessage, ElForm, ElFormItem, ElInput } from '../../../common/designer-ui';
import { Tickets, Plus, Edit, Delete, Link } from '../../../common/remix-icons';
import { useModal } from '../../../../hooks/useModal';
import { useVisualData, createNewPage } from '../../../../hooks/useVisualData';
defineOptions({
    name: 'PageTree',
    label: '页面',
    order: 1,
    icon: Tickets,
});
const rules = {
    title: [{ required: true, message: '请输入页面标题', trigger: 'blur' }],
    path: [{ required: true, message: '请输入页面路径', trigger: 'blur' }],
};
const { jsonData, currentPath, setCurrentPage, deletePage, updatePage, incrementPage } = useVisualData();
const ruleFormRef = ref();
const currentNodeKey = computed(() => currentPath.value);
// 当前要增加或修改的页面
const operatePageData = ref(null);
// 增改页面表单数据
const form = ref({
    title: '',
    path: '',
});
// 所有的页面
const pages = computed(() => Object.keys(jsonData.pages).map((key) => ({
    title: jsonData.pages[key].title,
    path: key,
    isDefault: Boolean(jsonData.pages[key].isDefault),
})));
// 点击当前节点
const handleNodeClick = (data) => {
    setCurrentPage(data.path);
};
/**
 * @description 显示新增/编辑模态框
 */
const showOparateModal = () => useModal({
    title: operatePageData.value ? '编辑页面' : '新增页面',
    props: {
        width: 380,
    },
    content: () => (<ElForm ref={ruleFormRef} model={form.value} rules={rules}>
          <ElFormItem prop={'title'} label={'页面标题'} labelWidth={'80px'}>
            <ElInput v-model={form.value.title}/>
          </ElFormItem>
          <ElFormItem prop={'path'} label={'页面路径'} labelWidth={'80px'}>
            <ElInput v-model={form.value.path}/>
          </ElFormItem>
        </ElForm>),
    onConfirm: () => {
        return new Promise((resolve, reject) => {
            ruleFormRef.value?.validate(async (valid) => {
                if (valid) {
                    const { title, path } = form.value;
                    if ([title.trim(), path.trim()].includes('')) {
                        ElMessage.error('标题或路径不能为空！');
                        return;
                    }
                    if (operatePageData.value) {
                        updatePage({
                            newPath: path,
                            oldPath: operatePageData.value.path || path,
                            page: { title },
                        });
                        setCurrentPage(path);
                    }
                    else {
                        incrementPage(path, createNewPage({ title }));
                    }
                    resolve(true);
                }
                else {
                    console.log('error submit!!');
                    reject();
                    return;
                }
            });
        });
    },
});
// 新增页面
const addPage = () => {
    operatePageData.value = null;
    form.value = {
        title: '',
        path: '',
    };
    showOparateModal();
};
// 编辑页面
const editPage = (data) => {
    operatePageData.value = data;
    form.value = {
        title: data.title,
        path: data.path,
    };
    showOparateModal();
    console.log('子页面数据：', data);
};
// 删除子页面
const delPage = (data) => {
    console.log('删除子页面数据', data);
    if (window.confirm('确定要删除该页面吗？')) {
        deletePage(data.path, '/');
    }
};
// 设置为默认页面
const setDefaultPage = (data) => {
    console.log('设置该页面为默认页面', data);
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['page-path']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page-tree" },
});
/** @type {__VLS_StyleScopedClasses['page-tree']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
vxeButton;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    status: "primary",
    ...{ class: "page-tree-add" },
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    status: "primary",
    ...{ class: "page-tree-add" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.click} */
    onClick: (__VLS_ctx.addPage),
};
/** @type {__VLS_StyleScopedClasses['page-tree-add']} */ ;
const { default: __VLS_7 } = __VLS_3.slots;
let __VLS_8;
/** @ts-ignore @type { | typeof __VLS_components.Plus} */
Plus;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({}));
const __VLS_10 = __VLS_9({}, ...__VLS_functionalComponentArgsRest(__VLS_9));
// @ts-ignore
[addPage,];
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "page-tree-list" },
});
/** @type {__VLS_StyleScopedClasses['page-tree-list']} */ ;
for (const [page] of __VLS_vFor((__VLS_ctx.pages))) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                return (__VLS_ctx.handleNodeClick(page));
                // @ts-ignore
                [pages, handleNodeClick,];
            } },
        key: (page.path),
        type: "button",
        ...{ class: "page-tree-node" },
        ...{ class: ({ 'is-active': page.path === __VLS_ctx.currentNodeKey }) },
    });
    /** @type {__VLS_StyleScopedClasses['page-tree-node']} */ ;
    /** @type {__VLS_StyleScopedClasses['is-active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "page-tree-node-main" },
    });
    /** @type {__VLS_StyleScopedClasses['page-tree-node-main']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "page-title" },
    });
    /** @type {__VLS_StyleScopedClasses['page-title']} */ ;
    (page.title);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "page-path" },
    });
    /** @type {__VLS_StyleScopedClasses['page-path']} */ ;
    (page.path);
    if (page.isDefault) {
        let __VLS_13;
        /** @ts-ignore @type { | typeof __VLS_components.vxeTag | typeof __VLS_components.VxeTag | typeof __VLS_components['vxe-tag'] | typeof __VLS_components.vxeTag | typeof __VLS_components.VxeTag | typeof __VLS_components['vxe-tag']} */
        vxeTag;
        // @ts-ignore
        const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
            size: "mini",
            status: "primary",
        }));
        const __VLS_15 = __VLS_14({
            size: "mini",
            status: "primary",
        }, ...__VLS_functionalComponentArgsRest(__VLS_14));
        const { default: __VLS_18 } = __VLS_16.slots;
        // @ts-ignore
        [currentNodeKey,];
        var __VLS_16;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ onClick: () => { } },
        ...{ class: "page-tree-actions" },
    });
    /** @type {__VLS_StyleScopedClasses['page-tree-actions']} */ ;
    let __VLS_19;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
        ...{ 'onClick': {} },
        mode: "text",
        status: "primary",
        title: "编辑",
    }));
    const __VLS_21 = __VLS_20({
        ...{ 'onClick': {} },
        mode: "text",
        status: "primary",
        title: "编辑",
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    let __VLS_24;
    const __VLS_25 = {
        /** @type {typeof __VLS_24.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.editPage(page));
            // @ts-ignore
            [editPage,];
        },
    };
    const { default: __VLS_26 } = __VLS_22.slots;
    let __VLS_27;
    /** @ts-ignore @type { | typeof __VLS_components.Edit} */
    Edit;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({}));
    const __VLS_29 = __VLS_28({}, ...__VLS_functionalComponentArgsRest(__VLS_28));
    // @ts-ignore
    [];
    var __VLS_22;
    var __VLS_23;
    let __VLS_32;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
        ...{ 'onClick': {} },
        mode: "text",
        status: "error",
        title: "删除",
    }));
    const __VLS_34 = __VLS_33({
        ...{ 'onClick': {} },
        mode: "text",
        status: "error",
        title: "删除",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    let __VLS_37;
    const __VLS_38 = {
        /** @type {typeof __VLS_37.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.delPage(page));
            // @ts-ignore
            [delPage,];
        },
    };
    const { default: __VLS_39 } = __VLS_35.slots;
    let __VLS_40;
    /** @ts-ignore @type { | typeof __VLS_components.Delete} */
    Delete;
    // @ts-ignore
    const __VLS_41 = __VLS_asFunctionalComponent1(__VLS_40, new __VLS_40({}));
    const __VLS_42 = __VLS_41({}, ...__VLS_functionalComponentArgsRest(__VLS_41));
    // @ts-ignore
    [];
    var __VLS_35;
    var __VLS_36;
    let __VLS_45;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_46 = __VLS_asFunctionalComponent1(__VLS_45, new __VLS_45({
        ...{ 'onClick': {} },
        mode: "text",
        title: "设为首页",
    }));
    const __VLS_47 = __VLS_46({
        ...{ 'onClick': {} },
        mode: "text",
        title: "设为首页",
    }, ...__VLS_functionalComponentArgsRest(__VLS_46));
    let __VLS_50;
    const __VLS_51 = {
        /** @type {typeof __VLS_50.click} */
        onClick: (...[$event]) => {
            return (__VLS_ctx.setDefaultPage(page));
            // @ts-ignore
            [setDefaultPage,];
        },
    };
    const { default: __VLS_52 } = __VLS_48.slots;
    let __VLS_53;
    /** @ts-ignore @type { | typeof __VLS_components.Link} */
    Link;
    // @ts-ignore
    const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({}));
    const __VLS_55 = __VLS_54({}, ...__VLS_functionalComponentArgsRest(__VLS_54));
    // @ts-ignore
    [];
    var __VLS_48;
    var __VLS_49;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
