/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, h, ref, resolveComponent } from 'vue';
import { cloneDeep } from 'lodash-es';
import { ElMessage } from '../../../common/designer-ui';
import { useVisualData } from '../../../../hooks/useVisualData';
import { useLowCodeHost } from '../../../../../core/host';
import { findGlobalDialog, openGlobalDialog } from '../../../../../runtime/global-dialog';
const { jsonData, currentBlock, incrementModel, updateModel } = useVisualData();
const host = useLowCodeHost();
const keyword = ref('');
const selectedKey = ref('');
const pickerLoading = ref(false);
const pickerKeyword = ref('');
const pickedEntityIds = ref([]);
const entityTables = ref([]);
const controlOptions = [
    { label: '输入框', value: 'input' },
    { label: '多行文本', value: 'textarea' },
    { label: '数字输入', value: 'number' },
    { label: '下拉框', value: 'select' },
    { label: '日期', value: 'date' },
    { label: '日期时间', value: 'datetime' },
    { label: '开关', value: 'switch' },
    { label: '上传', value: 'upload' },
];
const entitySources = computed(() => cloneDeep((jsonData.models || []).filter((item) => item.sourceType === 'entity')));
const filteredSources = computed(() => {
    const text = keyword.value.trim().toLowerCase();
    if (!text)
        return entitySources.value;
    return entitySources.value.filter((source) => [source.name, source.tableName, source.entityCode, source.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text)));
});
const selectedSource = computed(() => {
    const key = selectedKey.value || filteredSources.value[0]?.key;
    return filteredSources.value.find((source) => source.key === key) || null;
});
const filteredTables = computed(() => {
    const text = pickerKeyword.value.trim().toLowerCase();
    if (!text)
        return entityTables.value;
    return entityTables.value.filter((table) => [table.title, table.code, table.full_name, table.table_name, table.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(text)));
});
function renderEntityPickerContent() {
    if (pickerLoading.value) {
        return h('div', { class: 'eds-picker__state' }, '正在加载实体表...');
    }
    if (!filteredTables.value.length) {
        return h('div', { class: 'eds-picker__state' }, '暂无可关联实体');
    }
    return filteredTables.value.map((table) => h('label', {
        key: table.id,
        class: ['eds-picker-row', { 'is-linked': isLinked(table.id) }],
    }, [
        h('input', {
            type: 'checkbox',
            checked: pickedEntityIds.value.includes(table.id),
            disabled: isLinked(table.id),
            onChange: (event) => togglePickedEntity(table.id, event.target.checked),
        }),
        h('span', [
            h('strong', table.title || table.code),
            h('small', `${table.full_name || table.table_name} · ${table.columns?.length || 0} 字段`),
        ]),
        isLinked(table.id) ? h('em', '已关联') : null,
    ]));
}
function getServiceApi() {
    try {
        return host.getServiceApi();
    }
    catch {
        return null;
    }
}
function isLinked(entityId) {
    return entitySources.value.some((source) => source.entityId === entityId);
}
function togglePickedEntity(entityId, checked) {
    pickedEntityIds.value = checked
        ? Array.from(new Set([...pickedEntityIds.value, entityId]))
        : pickedEntityIds.value.filter((id) => id !== entityId);
}
function selectSource(key) {
    selectedKey.value = key;
}
async function loadEntityTables() {
    pickerLoading.value = true;
    try {
        const serviceApi = getServiceApi();
        const graph = await serviceApi?.invoke('entityDesign', 'listDesign');
        entityTables.value = graph?.tables || [];
    }
    catch {
        ElMessage.warning('实体表加载失败，请确认实体设计器服务可用');
        entityTables.value = [];
    }
    finally {
        pickerLoading.value = false;
    }
}
function openEntityPicker() {
    if (findGlobalDialog('entity-picker'))
        return;
    pickedEntityIds.value = [];
    pickerKeyword.value = '';
    void openGlobalDialog({
        id: 'entity-picker',
        title: '关联实体表',
        width: 'min(720px, calc(100vw - 48px))',
        height: 'min(560px, calc(100vh - 80px))',
        showFooter: true,
        body: () => h('div', { class: 'eds-picker' }, [
            h(resolveComponent('vxe-input'), {
                modelValue: pickerKeyword.value,
                placeholder: '搜索实体名称 / 表名',
                clearable: true,
                'onUpdate:modelValue': (value) => {
                    pickerKeyword.value = value;
                },
            }),
            renderEntityPickerContent(),
        ]),
        actions: [
            {
                code: 'cancel',
                label: '取消',
                role: 'cancel',
            },
            {
                code: 'confirm',
                label: '确认关联',
                role: 'confirm',
                status: 'primary',
                onClick: confirmLinkEntities,
            },
        ],
    });
    void loadEntityTables();
}
function mapControl(column) {
    const name = String(column.column_name || '').toLowerCase();
    const type = String(column.data_type || '').toLowerCase();
    if (name.includes('status') || name.includes('type') || name.includes('category'))
        return 'select';
    if (type.includes('bool'))
        return 'switch';
    if (type.includes('date') && !type.includes('time'))
        return 'date';
    if (type.includes('time'))
        return 'datetime';
    if (type.includes('int') || type.includes('numeric') || type.includes('decimal'))
        return 'number';
    if (name.includes('remark') || name.includes('description') || type.includes('text'))
        return 'textarea';
    return 'input';
}
function toFormComponent(control) {
    return {
        textarea: 'vxe-textarea',
        number: 'lc-number-input',
        select: 'vxe-select',
        date: 'vxe-input',
        datetime: 'vxe-input',
        switch: 'vxe-switch',
        upload: 'vxe-input',
    }[control] || 'vxe-input';
}
function mapUsage(column) {
    const name = String(column.column_name || '').toLowerCase();
    const isPrimary = Boolean(column.is_primary_key) || name === 'id';
    const isAudit = ['updated_at', 'update_time', 'modified_at'].includes(name);
    const isRemark = name.includes('remark') || name.includes('description');
    return {
        tableColumn: !isPrimary && !isRemark,
        queryCondition: !isPrimary &&
            (name.includes('name') || name.includes('code') || name.includes('status') || name.includes('type') || name.includes('time')),
        formItem: !isPrimary && !isAudit,
        detailItem: true,
    };
}
function tableToSource(table) {
    return {
        key: `entity:${table.id}`,
        name: table.title || table.code || table.table_name,
        sourceType: 'entity',
        entityId: table.id,
        entityCode: table.code,
        tableName: table.full_name || table.table_name,
        description: table.description || '',
        syncStatus: 'normal',
        bindingCount: 0,
        entitys: (table.columns || []).map((column) => ({
            key: column.column_name,
            name: column.label || column.column_name,
            type: column.data_type || 'text',
            value: column.default_value || '',
            entityFieldId: column.id,
            required: Boolean(column.is_required),
            primaryKey: Boolean(column.is_primary_key),
            usage: mapUsage(column),
            component: {
                formControl: mapControl(column),
                tableFormatter: 'text',
            },
            status: 'normal',
        })),
    };
}
function confirmLinkEntities() {
    const selectedTables = entityTables.value.filter((table) => pickedEntityIds.value.includes(table.id));
    selectedTables.forEach((table) => {
        if (!isLinked(table.id)) {
            incrementModel(tableToSource(table));
        }
    });
    if (selectedTables.length) {
        selectedKey.value = `entity:${selectedTables[0].id}`;
        ElMessage.success('实体数据源已关联');
    }
}
function saveSelectedSource() {
    if (selectedSource.value) {
        updateModel(cloneDeep(selectedSource.value));
    }
}
function fieldsByUsage(usageKey) {
    return (selectedSource.value?.entitys || []).filter((field) => field.usage?.[usageKey]);
}
function applyToCurrentBlock() {
    const block = currentBlock.value;
    const source = selectedSource.value;
    if (!source || !block?._vid) {
        ElMessage.warning('请先选择实体数据源和画布组件');
        return;
    }
    block.props ||= {};
    block.props.entitySourceKey = source.key;
    block.props.sourceKey = source.key;
    if (block.componentKey === 'lowcode-grid') {
        block.props.title ||= `${source.name}列表`;
        block.props.columns = fieldsByUsage('tableColumn').map((field) => ({
            field: field.key,
            title: field.name || field.key,
            minWidth: field.type?.includes('time') ? '170' : '120',
            formatter: field.component?.tableFormatter || '',
        }));
        ElMessage.success('已应用为表格列');
        return;
    }
    if (block.componentKey === 'lowcode-search-form') {
        block.props.title ||= '查询条件';
        block.props.fields = fieldsByUsage('queryCondition').map((field) => ({
            field: field.key,
            label: field.name || field.key,
            component: toFormComponent(field.component?.formControl),
            placeholder: `请输入${field.name || field.key}`,
            required: false,
        }));
        ElMessage.success('已应用为查询字段');
        return;
    }
    if (block.componentKey === 'lowcode-edit-form' || block.componentKey === 'form') {
        block.props.title ||= `${source.name}表单`;
        block.props.submitSourceKey ||= source.key;
        block.props.fields = fieldsByUsage('formItem').map((field) => ({
            field: field.key,
            label: field.name || field.key,
            component: toFormComponent(field.component?.formControl),
            placeholder: `请输入${field.name || field.key}`,
            required: Boolean(field.required),
        }));
        ElMessage.success('已应用为表单字段');
        return;
    }
    ElMessage.warning('当前组件暂不支持实体数据源应用');
}
async function syncSelectedSource() {
    if (!selectedSource.value)
        return;
    if (!entityTables.value.length) {
        await loadEntityTables();
    }
    const table = entityTables.value.find((item) => item.id === selectedSource.value?.entityId);
    if (!table) {
        ElMessage.warning('未找到对应实体表，无法同步字段');
        return;
    }
    const nextSource = tableToSource(table);
    const currentByField = new Map((selectedSource.value.entitys || []).map((field) => [field.key, field]));
    nextSource.entitys = nextSource.entitys.map((field) => ({
        ...field,
        usage: currentByField.get(field.key)?.usage || field.usage,
        component: currentByField.get(field.key)?.component || field.component,
    }));
    updateModel(nextSource);
    ElMessage.success('字段结构已同步');
}
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['eds-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-card']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-card__main']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-detail__head']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-info']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-field']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-field']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-field__name']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-field__name']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-picker-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-picker-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-picker-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-picker-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-picker-row']} */ ;
/** @type {__VLS_StyleScopedClasses['eds-picker-row']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
    ...{ class: "entity-data-source" },
});
/** @type {__VLS_StyleScopedClasses['entity-data-source']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "eds-toolbar" },
});
/** @type {__VLS_StyleScopedClasses['eds-toolbar']} */ ;
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
    onClick: (__VLS_ctx.openEntityPicker),
};
const { default: __VLS_7 } = __VLS_3.slots;
// @ts-ignore
[openEntityPicker,];
var __VLS_3;
var __VLS_4;
let __VLS_8;
/** @ts-ignore @type { | typeof __VLS_components.vxeInput | typeof __VLS_components.VxeInput | typeof __VLS_components['vxe-input']} */
vxeInput;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索实体 / 表名",
    clearable: true,
}));
const __VLS_10 = __VLS_9({
    modelValue: (__VLS_ctx.keyword),
    placeholder: "搜索实体 / 表名",
    clearable: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
if (!__VLS_ctx.entitySources.length) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-empty" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-empty']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-empty__title" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-empty__title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-empty__desc" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-empty__desc']} */ ;
    let __VLS_13;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_14 = __VLS_asFunctionalComponent1(__VLS_13, new __VLS_13({
        ...{ 'onClick': {} },
        status: "primary",
    }));
    const __VLS_15 = __VLS_14({
        ...{ 'onClick': {} },
        status: "primary",
    }, ...__VLS_functionalComponentArgsRest(__VLS_14));
    let __VLS_18;
    const __VLS_19 = {
        /** @type {typeof __VLS_18.click} */
        onClick: (__VLS_ctx.openEntityPicker),
    };
    const { default: __VLS_20 } = __VLS_16.slots;
    // @ts-ignore
    [openEntityPicker, keyword, entitySources,];
    var __VLS_16;
    var __VLS_17;
}
else {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-list" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-list']} */ ;
    for (const [source] of __VLS_vFor((__VLS_ctx.filteredSources))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!!(!__VLS_ctx.entitySources.length))
                        throw 0;
                    return (__VLS_ctx.selectSource(source.key));
                    // @ts-ignore
                    [filteredSources, selectSource,];
                } },
            key: (source.key),
            ...{ class: "eds-card" },
            ...{ class: ({ 'is-active': __VLS_ctx.selectedKey === source.key }) },
            type: "button",
        });
        /** @type {__VLS_StyleScopedClasses['eds-card']} */ ;
        /** @type {__VLS_StyleScopedClasses['is-active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eds-card__main" },
        });
        /** @type {__VLS_StyleScopedClasses['eds-card__main']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (source.name);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (source.tableName || source.entityCode || source.key);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eds-card__meta" },
        });
        /** @type {__VLS_StyleScopedClasses['eds-card__meta']} */ ;
        (source.entitys?.length || 0);
        (source.bindingCount || 0);
        // @ts-ignore
        [selectedKey,];
    }
}
if (__VLS_ctx.selectedSource) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-detail" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-detail']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-detail__head" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-detail__head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (__VLS_ctx.selectedSource.name);
    __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
    (__VLS_ctx.selectedSource.tableName);
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-detail__actions" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-detail__actions']} */ ;
    let __VLS_21;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
        ...{ 'onClick': {} },
        size: "mini",
    }));
    const __VLS_23 = __VLS_22({
        ...{ 'onClick': {} },
        size: "mini",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    let __VLS_26;
    const __VLS_27 = {
        /** @type {typeof __VLS_26.click} */
        onClick: (__VLS_ctx.applyToCurrentBlock),
    };
    const { default: __VLS_28 } = __VLS_24.slots;
    // @ts-ignore
    [selectedSource, selectedSource, selectedSource, applyToCurrentBlock,];
    var __VLS_24;
    var __VLS_25;
    let __VLS_29;
    /** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
    vxeButton;
    // @ts-ignore
    const __VLS_30 = __VLS_asFunctionalComponent1(__VLS_29, new __VLS_29({
        ...{ 'onClick': {} },
        size: "mini",
    }));
    const __VLS_31 = __VLS_30({
        ...{ 'onClick': {} },
        size: "mini",
    }, ...__VLS_functionalComponentArgsRest(__VLS_30));
    let __VLS_34;
    const __VLS_35 = {
        /** @type {typeof __VLS_34.click} */
        onClick: (__VLS_ctx.syncSelectedSource),
    };
    const { default: __VLS_36 } = __VLS_32.slots;
    // @ts-ignore
    [syncSelectedSource,];
    var __VLS_32;
    var __VLS_33;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-info" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-info']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (__VLS_ctx.selectedSource.syncStatus === 'changed' ? '已变更' : '正常');
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-fields" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-fields']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eds-field eds-field--header" },
    });
    /** @type {__VLS_StyleScopedClasses['eds-field']} */ ;
    /** @type {__VLS_StyleScopedClasses['eds-field--header']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    for (const [field] of __VLS_vFor((__VLS_ctx.selectedSource.entitys))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (field.key),
            ...{ class: "eds-field" },
        });
        /** @type {__VLS_StyleScopedClasses['eds-field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "eds-field__name" },
        });
        /** @type {__VLS_StyleScopedClasses['eds-field__name']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (field.name || field.key);
        __VLS_asFunctionalElement1(__VLS_intrinsics.small, __VLS_intrinsics.small)({});
        (field.key);
        (field.type);
        let __VLS_37;
        /** @ts-ignore @type { | typeof __VLS_components.vxeCheckbox | typeof __VLS_components.VxeCheckbox | typeof __VLS_components['vxe-checkbox']} */
        vxeCheckbox;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
            ...{ 'onChange': {} },
            modelValue: (field.usage.tableColumn),
        }));
        const __VLS_39 = __VLS_38({
            ...{ 'onChange': {} },
            modelValue: (field.usage.tableColumn),
        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
        let __VLS_42;
        const __VLS_43 = {
            /** @type {typeof __VLS_42.change} */
            onChange: (__VLS_ctx.saveSelectedSource),
        };
        var __VLS_40;
        var __VLS_41;
        let __VLS_44;
        /** @ts-ignore @type { | typeof __VLS_components.vxeCheckbox | typeof __VLS_components.VxeCheckbox | typeof __VLS_components['vxe-checkbox']} */
        vxeCheckbox;
        // @ts-ignore
        const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
            ...{ 'onChange': {} },
            modelValue: (field.usage.queryCondition),
        }));
        const __VLS_46 = __VLS_45({
            ...{ 'onChange': {} },
            modelValue: (field.usage.queryCondition),
        }, ...__VLS_functionalComponentArgsRest(__VLS_45));
        let __VLS_49;
        const __VLS_50 = {
            /** @type {typeof __VLS_49.change} */
            onChange: (__VLS_ctx.saveSelectedSource),
        };
        var __VLS_47;
        var __VLS_48;
        let __VLS_51;
        /** @ts-ignore @type { | typeof __VLS_components.vxeCheckbox | typeof __VLS_components.VxeCheckbox | typeof __VLS_components['vxe-checkbox']} */
        vxeCheckbox;
        // @ts-ignore
        const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
            ...{ 'onChange': {} },
            modelValue: (field.usage.formItem),
        }));
        const __VLS_53 = __VLS_52({
            ...{ 'onChange': {} },
            modelValue: (field.usage.formItem),
        }, ...__VLS_functionalComponentArgsRest(__VLS_52));
        let __VLS_56;
        const __VLS_57 = {
            /** @type {typeof __VLS_56.change} */
            onChange: (__VLS_ctx.saveSelectedSource),
        };
        var __VLS_54;
        var __VLS_55;
        let __VLS_58;
        /** @ts-ignore @type { | typeof __VLS_components.vxeCheckbox | typeof __VLS_components.VxeCheckbox | typeof __VLS_components['vxe-checkbox']} */
        vxeCheckbox;
        // @ts-ignore
        const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
            ...{ 'onChange': {} },
            modelValue: (field.usage.detailItem),
        }));
        const __VLS_60 = __VLS_59({
            ...{ 'onChange': {} },
            modelValue: (field.usage.detailItem),
        }, ...__VLS_functionalComponentArgsRest(__VLS_59));
        let __VLS_63;
        const __VLS_64 = {
            /** @type {typeof __VLS_63.change} */
            onChange: (__VLS_ctx.saveSelectedSource),
        };
        var __VLS_61;
        var __VLS_62;
        let __VLS_65;
        /** @ts-ignore @type { | typeof __VLS_components.vxeSelect | typeof __VLS_components.VxeSelect | typeof __VLS_components['vxe-select'] | typeof __VLS_components.vxeSelect | typeof __VLS_components.VxeSelect | typeof __VLS_components['vxe-select']} */
        vxeSelect;
        // @ts-ignore
        const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
            ...{ 'onChange': {} },
            modelValue: (field.component.formControl),
            size: "mini",
        }));
        const __VLS_67 = __VLS_66({
            ...{ 'onChange': {} },
            modelValue: (field.component.formControl),
            size: "mini",
        }, ...__VLS_functionalComponentArgsRest(__VLS_66));
        let __VLS_70;
        const __VLS_71 = {
            /** @type {typeof __VLS_70.change} */
            onChange: (__VLS_ctx.saveSelectedSource),
        };
        const { default: __VLS_72 } = __VLS_68.slots;
        for (const [item] of __VLS_vFor((__VLS_ctx.controlOptions))) {
            let __VLS_73;
            /** @ts-ignore @type { | typeof __VLS_components.vxeOption | typeof __VLS_components.VxeOption | typeof __VLS_components['vxe-option']} */
            vxeOption;
            // @ts-ignore
            const __VLS_74 = __VLS_asFunctionalComponent1(__VLS_73, new __VLS_73({
                key: (item.value),
                label: (item.label),
                value: (item.value),
            }));
            const __VLS_75 = __VLS_74({
                key: (item.value),
                label: (item.label),
                value: (item.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_74));
            // @ts-ignore
            [selectedSource, selectedSource, saveSelectedSource, saveSelectedSource, saveSelectedSource, saveSelectedSource, saveSelectedSource, controlOptions,];
        }
        // @ts-ignore
        [];
        var __VLS_68;
        var __VLS_69;
        // @ts-ignore
        [];
    }
}
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
