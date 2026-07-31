/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { reactive, ref, computed } from 'vue';
import { ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElCard, ElButton, ElMessage, } from '../../../common/designer-ui';
import { cloneDeep } from 'lodash-es';
import { Delete, Edit } from '../../../common/remix-icons';
import { useImportSwaggerJsonModal } from './utils';
import { useVisualData, fieldTypes } from '../../../../hooks/useVisualData';
import { useModal } from '../../../../hooks/useModal';
import { generateNanoid } from '../../../../utils';
const { jsonData, incrementModel, updateModel, deleteModel } = useVisualData();
const { showImportSwaggerJsonModal } = useImportSwaggerJsonModal();
/**
 * @description 模型集合
 */
const models = computed(() => cloneDeep(jsonData.models));
/**
 * @description 是否处于编辑状态
 */
const isEdit = computed(() => models.value.some((item) => item.key === state.ruleForm.key));
/**
 * @description 创建空的实体对象
 */
const createEmptyEntity = () => ({ key: '', name: '', type: 'string', value: '' });
/**
 * @description 创建空的数据模型
 */
const createEmptyModel = () => ({
    name: '',
    key: generateNanoid(),
    entitys: [createEmptyEntity()],
});
const ruleFormRef = ref();
const state = reactive({
    activeNames: [],
    ruleForm: createEmptyModel(),
});
const confirmClearModels = () => {
    if (window.confirm('???????????')) {
        updateModel([], true);
    }
};
const confirmDeleteModel = (key) => {
    if (window.confirm('??????????')) {
        deleteModel(key);
    }
};
/**
 * @param {number} 索引
 * @description 删除实体项
 */
const deleteEntityItem = (index) => {
    state.ruleForm.entitys.splice(index, 1);
};
/**
 * @description 添加实体项
 */
const addEntityItem = () => {
    state.ruleForm.entitys.push(createEmptyEntity());
};
/**
 * @description 显示添加接口弹窗
 */
const showModelMoal = () => {
    const operateType = isEdit.value ? '修改' : '新增';
    useModal({
        title: `${operateType}数据源`,
        props: {
            width: 600,
        },
        content: () => (<ElForm model={state.ruleForm} ref={ruleFormRef} label-width="100px">
          <ElFormItem label="数据源名称" prop="name" rules={[{ required: true, message: '请输入数据源名称', trigger: 'change' }]}>
            <ElInput v-model={state.ruleForm.name} placeholder={'请输入数据源名称'}></ElInput>
          </ElFormItem>
          {!state.ruleForm.entitys.length && (<ElFormItem>
              <ElButton onClick={addEntityItem} type={'primary'}>
                添加实体
              </ElButton>
            </ElFormItem>)}
          {state.ruleForm.entitys.map((entity, index) => (<ElCard key={index} shadow={'hover'} class={'mt-10px'} v-slots={{
                    header: () => (<div class={'flex justify-between'}>
                    <ElFormItem label="实体名称" prop={`entitys.${index}.name`} rules={[{ required: true, message: '请输入实体名称', trigger: 'change' }]} showMessage={false} class={'w-300px !mb-0'}>
                      <ElInput v-model={entity.name} placeholder={'请输入实体名称'}></ElInput>
                    </ElFormItem>
                    <div>
                      <ElButton onClick={() => deleteEntityItem(index)} type={'danger'}>
                        删除
                      </ElButton>
                      <ElButton onClick={addEntityItem} type={'primary'}>
                        添加
                      </ElButton>
                    </div>
                  </div>),
                }}>
              <ElFormItem label="实体字段" prop={`entitys.${index}.key`} rules={[{ required: true, message: '请输入实体字段', trigger: 'change' }]}>
                <ElInput v-model={entity.key} placeholder={'请输入实体字段'}></ElInput>
              </ElFormItem>
              <ElFormItem label="数据类型" prop={`entitys.${index}.type`} rules={[{ required: true, message: '请输入数据类型', trigger: 'change' }]}>
                <ElSelect v-model={entity.type}>
                  {fieldTypes.map((typeItem) => (<ElOption key={typeItem.value} label={typeItem.label} value={typeItem.value}></ElOption>))}
                </ElSelect>
              </ElFormItem>
              <ElFormItem label="默认数据" prop={`entitys.${index}.value`}>
                <ElInput v-model={entity.value} placeholder={'实体默认数据，不填则为对应类型数据'}></ElInput>
              </ElFormItem>
            </ElCard>))}
        </ElForm>),
        onConfirm: () => {
            return new Promise((resolve, reject) => {
                ruleFormRef.value?.validate((valid) => {
                    if (valid) {
                        if (isEdit.value) {
                            updateModel(state.ruleForm);
                        }
                        else {
                            incrementModel(state.ruleForm);
                        }
                        ElMessage.success(`${operateType}模型成功！`);
                        state.ruleForm = createEmptyModel();
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
        onCancel: () => (state.ruleForm = createEmptyModel()),
    });
};
/**
 * @description 编辑模型
 */
const editModel = (model) => {
    console.log(model);
    state.ruleForm = cloneDeep(model);
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
    onClick: (__VLS_ctx.confirmClearModels),
};
const { default: __VLS_23 } = __VLS_19.slots;
// @ts-ignore
[confirmClearModels,];
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
for (const [item] of __VLS_vFor((__VLS_ctx.models))) {
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
                    return (__VLS_ctx.editModel(item));
                    // @ts-ignore
                    [state, vInfiniteScroll, models, editModel,];
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
                    return (__VLS_ctx.confirmDeleteModel(item.key));
                    // @ts-ignore
                    [confirmDeleteModel,];
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
    for (const [entity] of __VLS_vFor((item.entitys))) {
        __VLS_asFunctionalElement(__VLS_intrinsics.template)({
            key: (entity.key),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "low-model-item" },
        });
        /** @type {__VLS_StyleScopedClasses['low-model-item']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.pre, __VLS_intrinsics.pre)({
            ...{ class: "code" },
        });
        /** @type {__VLS_StyleScopedClasses['code']} */ ;
        (JSON.stringify(entity, null, 2));
        // @ts-ignore
        [];
    }
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
