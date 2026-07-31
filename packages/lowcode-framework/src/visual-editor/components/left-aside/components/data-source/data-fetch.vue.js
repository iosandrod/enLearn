/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { reactive, ref, computed } from 'vue';
import { ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElMessage, ElCascader, } from '../../../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import { Delete, Edit } from '../../../common/remix-icons';
import { useImportSwaggerJsonModal } from './utils';
import { useVisualData } from '../../../../hooks/useVisualData';
import { useModal } from '../../../../hooks/useModal';
import { generateNanoid } from '../../../../utils';
import { RequestEnum, ContentTypeEnum } from '../../../../../enums/httpEnum';
const { jsonData, incrementFetchApi, updateFetchApi, deleteFetchApi } = useVisualData();
const { showImportSwaggerJsonModal } = useImportSwaggerJsonModal();
/**
 * @description 接口集合
 */
const apis = computed(() => cloneDeep(jsonData.actions.fetch.apis));
/**
 * @description 模型集合
 */
const models = computed(() => cloneDeep(jsonData.models));
/**
 * @description 是否处于编辑状态
 */
const isEdit = computed(() => apis.value.some((item) => item.key == state.ruleForm.key));
/**
 * @description 创建空的数据接口对象
 */
const createEmptyApiItem = () => ({
    key: generateNanoid(),
    name: '',
    options: {
        url: '', // 请求的url
        method: RequestEnum.GET, // 请求的方法
        contentType: 'JSON', // 请求的内容类型
    },
    data: {
        bind: '', // 请求绑定对应的某个实体
        recv: '', // 响应的结果绑定到某个实体上
    },
});
const ruleFormRef = ref();
const state = reactive({
    activeNames: [],
    ruleForm: createEmptyApiItem(),
});
const confirmClearFetchApis = () => {
    if (window.confirm('???????????')) {
        updateFetchApi([], true);
    }
};
const confirmDeleteFetchApi = (key) => {
    if (window.confirm('??????????')) {
        deleteFetchApi(key);
    }
};
const rules = {
    name: [{ required: true, message: '请输入接口名称', trigger: 'change' }],
    'options.url': [{ required: true, message: '请输入接口名称', trigger: 'change' }],
    'options.contentType': [{ required: true, message: '请选择内容类型', trigger: 'change' }],
};
const handleBindChange = (e) => {
    console.log(e, 'kkk');
};
/**
 * @description 显示添加接口弹窗
 */
const showModelMoal = () => {
    const operateType = isEdit.value ? '编辑' : '新增';
    useModal({
        title: `${operateType}接口`,
        props: {
            width: 600,
        },
        content: () => (<ElForm model={state.ruleForm} ref={ruleFormRef} label-width="100px" rules={rules}>
          <ElFormItem label="名称" prop="name">
            <ElInput v-model={state.ruleForm.name} placeholder={'请输入接口名称'}></ElInput>
          </ElFormItem>
          <ElFormItem label="接口" prop={'options.url'}>
            <ElInput v-model={state.ruleForm.options.url} placeholder={'请输入接口地址'}>
              {{
                prepend: () => (<ElSelect v-model={state.ruleForm.options.method} class={'w-90px'}>
                    {Object.keys(RequestEnum).map((key) => (<ElOption key={key} label={key} value={key}></ElOption>))}
                  </ElSelect>),
            }}
            </ElInput>
          </ElFormItem>
          <ElFormItem label="内容类型" prop={'options.contentType'}>
            <ElSelect v-model={state.ruleForm.options.contentType}>
              {Object.keys(ContentTypeEnum).map((key) => (<ElOption key={key} label={key} value={key}></ElOption>))}
            </ElSelect>
          </ElFormItem>
          <ElFormItem label="请求数据" prop={'data.bind'}>
            <ElCascader v-model={state.ruleForm.data.bind} options={[...models.value]} clearable={true} props={{
                checkStrictly: true,
                children: 'entitys',
                label: 'name',
                value: 'key',
                expandTrigger: 'hover',
            }} placeholder="请选择绑定的请求数据" onChange={handleBindChange}></ElCascader>
          </ElFormItem>
          <ElFormItem label="响应数据" prop={'data.recv'}>
            <ElCascader clearable={true} props={{
                checkStrictly: true,
                children: 'entitys',
                label: 'name',
                value: 'key',
                expandTrigger: 'hover',
            }} placeholder="请选择绑定的响应数据" onChange={handleBindChange} v-model={state.ruleForm.data.recv} options={[...models.value]}></ElCascader>
          </ElFormItem>
        </ElForm>),
        onConfirm: () => {
            return new Promise((resolve, reject) => {
                ruleFormRef.value?.validate((valid) => {
                    if (valid) {
                        if (isEdit.value) {
                            updateFetchApi(cloneDeep(state.ruleForm));
                        }
                        else {
                            incrementFetchApi(cloneDeep(state.ruleForm));
                        }
                        ElMessage.success(`${operateType}接口成功！`);
                        state.ruleForm = createEmptyApiItem();
                        resolve('submit!');
                    }
                    else {
                        reject();
                        console.log('error submit!!');
                        return;
                    }
                });
            });
        },
        onCancel: () => (state.ruleForm = createEmptyApiItem()),
    });
};
/**
 * @description 编辑模型
 */
const editApiItem = (apiItem) => {
    console.log(apiItem);
    state.ruleForm = cloneDeep(apiItem);
    showModelMoal();
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "!mb-10px" },
});
/** @type {__VLS_StyleScopedClasses['!mb-10px']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
vxeButton;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    status: "primary",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    status: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.click} */
    onClick: (__VLS_ctx.showModelMoal),
};
const { default: __VLS_7 } = __VLS_3.slots;
// @ts-ignore
[showModelMoal,];
var __VLS_3;
var __VLS_4;
let __VLS_8;
/** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
vxeButton;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
    ...{ 'onClick': {} },
    status: "warning",
}));
const __VLS_10 = __VLS_9({
    ...{ 'onClick': {} },
    status: "warning",
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
let __VLS_13;
const __VLS_14 = {
    /** @type {typeof __VLS_13.click} */
    onClick: (__VLS_ctx.showImportSwaggerJsonModal),
};
const { default: __VLS_15 } = __VLS_11.slots;
// @ts-ignore
[showImportSwaggerJsonModal,];
var __VLS_11;
var __VLS_12;
let __VLS_16;
/** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
vxeButton;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
    ...{ 'onClick': {} },
    status: "error",
}));
const __VLS_18 = __VLS_17({
    ...{ 'onClick': {} },
    status: "error",
}, ...__VLS_functionalComponentArgsRest(__VLS_17));
let __VLS_21;
const __VLS_22 = {
    /** @type {typeof __VLS_21.click} */
    onClick: (__VLS_ctx.confirmClearFetchApis),
};
const { default: __VLS_23 } = __VLS_19.slots;
// @ts-ignore
[confirmClearFetchApis,];
var __VLS_19;
var __VLS_20;
let __VLS_24;
/** @ts-ignore @type { | typeof __VLS_components.vxeCollapse | typeof __VLS_components.VxeCollapse | typeof __VLS_components['vxe-collapse'] | typeof __VLS_components.vxeCollapse | typeof __VLS_components.VxeCollapse | typeof __VLS_components['vxe-collapse']} */
vxeCollapse;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
    modelValue: (__VLS_ctx.state.activeNames),
}));
const __VLS_26 = __VLS_25({
    modelValue: (__VLS_ctx.state.activeNames),
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
__VLS_asFunctionalDirective(__VLS_directives.vInfiniteScroll, {})(null, { ...__VLS_directiveBindingRestFields, value: (() => { }) }, null, null);
const { default: __VLS_29 } = __VLS_27.slots;
for (const [item] of __VLS_vFor((__VLS_ctx.apis))) {
    __VLS_asFunctionalElement(__VLS_intrinsics.template)({
        key: (item.key),
    });
    let __VLS_30;
    /** @ts-ignore @type { | typeof __VLS_components.vxeCollapsePane | typeof __VLS_components.VxeCollapsePane | typeof __VLS_components['vxe-collapse-pane'] | typeof __VLS_components.vxeCollapsePane | typeof __VLS_components.VxeCollapsePane | typeof __VLS_components['vxe-collapse-pane']} */
    vxeCollapsePane;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        title: (item.name),
        name: (item.key),
    }));
    const __VLS_32 = __VLS_31({
        title: (item.name),
        name: (item.key),
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    const { default: __VLS_35 } = __VLS_33.slots;
    {
        const { title: __VLS_36 } = __VLS_33.slots;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "model-item-title" },
        });
        /** @type {__VLS_StyleScopedClasses['model-item-title']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "truncate w-160px" },
        });
        /** @type {__VLS_StyleScopedClasses['truncate']} */ ;
        /** @type {__VLS_StyleScopedClasses['w-160px']} */ ;
        (item.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "model-actions" },
        });
        /** @type {__VLS_StyleScopedClasses['model-actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onClick: (...[$event]) => {
                    return (__VLS_ctx.editApiItem(item));
                    // @ts-ignore
                    [state, vInfiniteScroll, apis, editApiItem,];
                } },
            ...{ class: "model-action-icon is-edit" },
        });
        /** @type {__VLS_StyleScopedClasses['model-action-icon']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-edit']} */ ;
        let __VLS_37;
        /** @ts-ignore @type { | typeof __VLS_components.Edit} */
        Edit;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({}));
        const __VLS_39 = __VLS_38({}, ...__VLS_functionalComponentArgsRest(__VLS_38));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ onClick: (...[$event]) => {
                    return (__VLS_ctx.confirmDeleteFetchApi(item.key));
                    // @ts-ignore
                    [confirmDeleteFetchApi,];
                } },
            ...{ class: "model-action-icon is-delete" },
        });
        /** @type {__VLS_StyleScopedClasses['model-action-icon']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-delete']} */ ;
        let __VLS_42;
        /** @ts-ignore @type { | typeof __VLS_components.Delete} */
        Delete;
        // @ts-ignore
        const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({}));
        const __VLS_44 = __VLS_43({}, ...__VLS_functionalComponentArgsRest(__VLS_43));
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "low-model-item" },
    });
    /** @type {__VLS_StyleScopedClasses['low-model-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({
        ...{ class: "code" },
    });
    /** @type {__VLS_StyleScopedClasses['code']} */ ;
    (JSON.stringify(item, null, 2));
    // @ts-ignore
    [];
    var __VLS_33;
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_27;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
