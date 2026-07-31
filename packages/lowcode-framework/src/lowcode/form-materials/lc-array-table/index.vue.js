/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/11516/Desktop/project/enLearn/node_modules/.pnpm/@vue+language-core@3.3.7/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { computed, ref, watch } from 'vue';
import { openGlobalDialog } from '../../../runtime/global-dialog';
import LcJsonEditor from '../lc-json-editor/index.vue';
const props = defineProps();
const emit = defineEmits();
const rows = ref([]);
const fieldProps = computed(() => props.field.props ?? {});
const valueMode = computed(() => fieldProps.value.valueMode === 'primitive' ? 'primitive' : 'object');
const valueField = computed(() => readString(fieldProps.value.valueField, 'value'));
const columns = computed(() => {
    const normalizedColumns = normalizeColumns(fieldProps.value.columns);
    if (valueMode.value === 'primitive' && !normalizedColumns.length) {
        return [
            {
                field: valueField.value,
                title: readString(fieldProps.value.valueTitle, '值'),
                minWidth: 120,
                placeholder: readString(fieldProps.value.placeholder),
            },
        ];
    }
    return normalizedColumns;
});
const rowKey = computed(() => readString(fieldProps.value.rowKey, '__rowKey'));
const addText = computed(() => readString(fieldProps.value.addText, '新增'));
watch(() => props.modelValue, (value) => {
    rows.value = normalizeRows(value);
}, { immediate: true, deep: true });
function normalizeColumns(value) {
    if (!Array.isArray(value))
        return [];
    return value
        .filter(isRecord)
        .map((column, index) => {
        const field = readString(column.field, `field${index + 1}`);
        return {
            field,
            title: readString(column.title ?? column.label, field),
            component: readComponent(column.component),
            width: readSize(column.width),
            minWidth: readSize(column.minWidth),
            placeholder: readString(column.placeholder),
            defaultValue: column.defaultValue,
            props: {
                ...(isRecord(column.props) ? cloneRecord(column.props) : {}),
                ...readJsonObject(column.propsJson),
            },
            options: Array.isArray(column.options)
                ? cloneValue(column.options)
                : readJsonArray(column.optionsJson) ?? [],
        };
    });
}
function normalizeRows(value) {
    const source = Array.isArray(value) ? value : [];
    return source.map((item, index) => {
        const row = valueMode.value === 'primitive'
            ? { [valueField.value]: item }
            : isRecord(item)
                ? cloneRecord(item)
                : {};
        ensureRowKey(row, index);
        return row;
    });
}
function createDefaultRow() {
    const row = isRecord(fieldProps.value.defaultRow)
        ? cloneRecord(fieldProps.value.defaultRow)
        : {};
    const rowIndex = rows.value.length + 1;
    columns.value.forEach((column) => {
        if (row[column.field] === undefined) {
            row[column.field] = resolveTemplate(column.defaultValue ?? getEmptyValue(column), rowIndex);
        }
    });
    Object.keys(row).forEach((key) => {
        row[key] = resolveTemplate(row[key], rowIndex);
    });
    ensureRowKey(row, rowIndex - 1);
    return row;
}
function addRow() {
    rows.value.push(createDefaultRow());
    commitRows();
}
function setCell(row, field, value) {
    row[field] = value;
    commitRows();
}
async function openObjectEditor(row, column) {
    const value = createObjectEditorValue(row[column.field], column);
    const result = await openGlobalDialog({
        title: `编辑 ${column.title || column.field}`,
        width: 'min(720px, calc(100vw - 48px))',
        showFooter: true,
        model: value,
        form: {
            schema: {
                fields: resolveObjectEditorFields(column, value),
                actions: [],
            },
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
    });
    if (result.action === 'confirm' && isRecord(result.values)) {
        setCell(row, column.field, cloneRecord(result.values));
    }
}
function removeRow(row) {
    const index = getRowIndex(row);
    if (index < 0)
        return;
    rows.value.splice(index, 1);
    commitRows();
}
function moveRow(row, offset) {
    const index = getRowIndex(row);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= rows.value.length)
        return;
    const [current] = rows.value.splice(index, 1);
    rows.value.splice(nextIndex, 0, current);
    commitRows();
}
function getRowIndex(row) {
    return rows.value.indexOf(row);
}
function commitRows() {
    const key = rowKey.value;
    const value = valueMode.value === 'primitive'
        ? rows.value.map((row) => cloneValue(row[valueField.value]))
        : rows.value.map((row) => {
            const next = cloneRecord(row);
            if (key.startsWith('__')) {
                delete next[key];
            }
            return next;
        });
    emit('update:modelValue', value);
}
function ensureRowKey(row, index) {
    const key = rowKey.value;
    if (row[key] === undefined || row[key] === '') {
        row[key] = `${key.startsWith('__') ? 'row' : key}_${index + 1}`;
    }
}
function getEmptyValue(column) {
    if (column.component === 'vxe-switch')
        return false;
    if (column.component === 'lc-number-input')
        return 0;
    if (column.component === 'lc-sub-form') {
        return isRecord(column.defaultValue) ? cloneRecord(column.defaultValue) : {};
    }
    return '';
}
function readComponent(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : 'vxe-input';
}
function getSelectModelValue(column, value) {
    const option = column.options?.find((item) => isSameValue(readOptionRawValue(item), value));
    return option?.value ?? value;
}
function readSelectValue(column, value) {
    const option = column.options?.find((item) => item.value === value);
    return option ? readOptionRawValue(option) : value;
}
function readOptionRawValue(option) {
    return Object.prototype.hasOwnProperty.call(option, 'rawValue')
        ? option.rawValue
        : option.value;
}
function createCellField(column) {
    return {
        field: column.field,
        label: column.title,
        component: column.component || 'vxe-input',
        props: {
            rows: 4,
            placeholder: column.placeholder,
            ...(column.props ?? {}),
        },
    };
}
function shouldUseObjectEditor(column, row) {
    return column.component === 'lc-sub-form' || isRecord(row[column.field]);
}
function formatObjectPreview(value) {
    if (!isRecord(value))
        return '{}';
    if (!Object.keys(value).length)
        return '{}';
    try {
        return JSON.stringify(value);
    }
    catch {
        return '[object]';
    }
}
function createObjectEditorValue(value, column) {
    return {
        ...(isRecord(column.defaultValue) ? cloneRecord(column.defaultValue) : {}),
        ...(isRecord(value) ? cloneRecord(value) : {}),
    };
}
function resolveObjectEditorFields(column, value) {
    const configuredFields = Array.isArray(column?.props?.fields)
        ? column.props.fields.filter(isRecord).map((field) => cloneRecord(field))
        : [];
    return configuredFields.length ? configuredFields : inferObjectEditorFields(value);
}
function inferObjectEditorFields(value) {
    return Object.keys(value).map((field) => {
        const currentValue = value[field];
        if (typeof currentValue === 'boolean') {
            return { field, label: field, component: 'vxe-switch' };
        }
        if (typeof currentValue === 'number') {
            return { field, label: field, component: 'lc-number-input' };
        }
        if (isRecord(currentValue)) {
            return {
                field,
                label: field,
                component: 'lc-sub-form',
                props: {
                    fields: inferObjectEditorFields(currentValue),
                },
            };
        }
        if (Array.isArray(currentValue)) {
            return {
                field,
                label: field,
                component: 'lc-json-editor',
                props: { rows: 4, placeholder: '[]' },
            };
        }
        return { field, label: field, component: 'vxe-input' };
    });
}
function toNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
}
function readSize(value) {
    return typeof value === 'number' || typeof value === 'string' ? value : undefined;
}
function readString(value, fallback = '') {
    if (typeof value === 'string')
        return value.trim() || fallback;
    if (typeof value === 'number' || typeof value === 'boolean')
        return String(value);
    return fallback;
}
function readJsonObject(value) {
    if (isRecord(value))
        return cloneRecord(value);
    if (typeof value !== 'string' || !value.trim())
        return {};
    try {
        const parsed = JSON.parse(value);
        return isRecord(parsed) ? parsed : {};
    }
    catch {
        return {};
    }
}
function readJsonArray(value) {
    if (Array.isArray(value))
        return cloneValue(value);
    if (typeof value !== 'string' || !value.trim())
        return undefined;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : undefined;
    }
    catch {
        return undefined;
    }
}
function resolveTemplate(value, index) {
    if (typeof value !== 'string')
        return cloneValue(value);
    return value.replace(/\{\{\s*index\s*\}\}/g, String(index));
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSameValue(prev, next) {
    if (Object.is(prev, next))
        return true;
    try {
        return JSON.stringify(prev) === JSON.stringify(next);
    }
    catch {
        return false;
    }
}
function cloneRecord(value) {
    return cloneValue(value);
}
function cloneValue(value) {
    if (!isRecord(value) && !Array.isArray(value))
        return value;
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return value;
    }
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
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-json-editor']} */ ;
/** @type {__VLS_StyleScopedClasses['vxe-textarea']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__object-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__object-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__object-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__actions']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__object-cell']} */ ;
/** @type {__VLS_StyleScopedClasses['lc-array-table__actions']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-array-table" },
});
/** @type {__VLS_StyleScopedClasses['lc-array-table']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-array-table__toolbar" },
});
/** @type {__VLS_StyleScopedClasses['lc-array-table__toolbar']} */ ;
let __VLS_0;
/** @ts-ignore @type { | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button'] | typeof __VLS_components.vxeButton | typeof __VLS_components.VxeButton | typeof __VLS_components['vxe-button']} */
vxeButton;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    ...{ 'onClick': {} },
    size: "mini",
    status: "primary",
}));
const __VLS_2 = __VLS_1({
    ...{ 'onClick': {} },
    size: "mini",
    status: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
let __VLS_5;
const __VLS_6 = {
    /** @type {typeof __VLS_5.click} */
    onClick: (__VLS_ctx.addRow),
};
const { default: __VLS_7 } = __VLS_3.slots;
(__VLS_ctx.addText);
// @ts-ignore
[addRow, addText,];
var __VLS_3;
var __VLS_4;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "lc-array-table__viewport" },
});
/** @type {__VLS_StyleScopedClasses['lc-array-table__viewport']} */ ;
let __VLS_8;
/** @ts-ignore @type { | typeof __VLS_components.vxeTable | typeof __VLS_components.VxeTable | typeof __VLS_components['vxe-table'] | typeof __VLS_components.vxeTable | typeof __VLS_components.VxeTable | typeof __VLS_components['vxe-table']} */
vxeTable;
// @ts-ignore
const __VLS_9 = __VLS_asFunctionalComponent1(__VLS_8, new __VLS_8({
    border: true,
    showOverflow: true,
    size: "mini",
    ...{ class: "lc-array-table__grid" },
    data: (__VLS_ctx.rows),
    rowConfig: ({ keyField: __VLS_ctx.rowKey }),
}));
const __VLS_10 = __VLS_9({
    border: true,
    showOverflow: true,
    size: "mini",
    ...{ class: "lc-array-table__grid" },
    data: (__VLS_ctx.rows),
    rowConfig: ({ keyField: __VLS_ctx.rowKey }),
}, ...__VLS_functionalComponentArgsRest(__VLS_9));
/** @type {__VLS_StyleScopedClasses['lc-array-table__grid']} */ ;
const { default: __VLS_13 } = __VLS_11.slots;
let __VLS_14;
/** @ts-ignore @type { | typeof __VLS_components.vxeColumn | typeof __VLS_components.VxeColumn | typeof __VLS_components['vxe-column']} */
vxeColumn;
// @ts-ignore
const __VLS_15 = __VLS_asFunctionalComponent1(__VLS_14, new __VLS_14({
    type: "seq",
    width: "42",
}));
const __VLS_16 = __VLS_15({
    type: "seq",
    width: "42",
}, ...__VLS_functionalComponentArgsRest(__VLS_15));
for (const [column] of __VLS_vFor((__VLS_ctx.columns))) {
    let __VLS_19;
    /** @ts-ignore @type { | typeof __VLS_components.vxeColumn | typeof __VLS_components.VxeColumn | typeof __VLS_components['vxe-column'] | typeof __VLS_components.vxeColumn | typeof __VLS_components.VxeColumn | typeof __VLS_components['vxe-column']} */
    vxeColumn;
    // @ts-ignore
    const __VLS_20 = __VLS_asFunctionalComponent1(__VLS_19, new __VLS_19({
        key: (column.field),
        field: (column.field),
        title: (column.title),
        width: (column.width),
        minWidth: (column.minWidth || 100),
    }));
    const __VLS_21 = __VLS_20({
        key: (column.field),
        field: (column.field),
        title: (column.title),
        width: (column.width),
        minWidth: (column.minWidth || 100),
    }, ...__VLS_functionalComponentArgsRest(__VLS_20));
    const { default: __VLS_24 } = __VLS_22.slots;
    {
        const { default: __VLS_25 } = __VLS_22.slots;
        const [scope] = __VLS_vSlot(__VLS_25);
        if (__VLS_ctx.isRecord(scope?.row)) {
            if (column.component === 'vxe-switch') {
                let __VLS_26;
                /** @ts-ignore @type { | typeof __VLS_components.vxeSwitch | typeof __VLS_components.VxeSwitch | typeof __VLS_components['vxe-switch']} */
                vxeSwitch;
                // @ts-ignore
                const __VLS_27 = __VLS_asFunctionalComponent1(__VLS_26, new __VLS_26({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (Boolean(scope.row[column.field])),
                }));
                const __VLS_28 = __VLS_27({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (Boolean(scope.row[column.field])),
                }, ...__VLS_functionalComponentArgsRest(__VLS_27));
                let __VLS_31;
                const __VLS_32 = {
                    /** @type {typeof __VLS_31.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, value)),
                };
                var __VLS_29;
                var __VLS_30;
            }
            else if (column.component === 'vxe-select') {
                let __VLS_33;
                /** @ts-ignore @type { | typeof __VLS_components.vxeSelect | typeof __VLS_components.VxeSelect | typeof __VLS_components['vxe-select'] | typeof __VLS_components.vxeSelect | typeof __VLS_components.VxeSelect | typeof __VLS_components['vxe-select']} */
                vxeSelect;
                // @ts-ignore
                const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.getSelectModelValue(column, scope.row[column.field])),
                    ...(column.props),
                    transfer: true,
                    clearable: true,
                }));
                const __VLS_35 = __VLS_34({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.getSelectModelValue(column, scope.row[column.field])),
                    ...(column.props),
                    transfer: true,
                    clearable: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_34));
                let __VLS_38;
                const __VLS_39 = {
                    /** @type {typeof __VLS_38.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, __VLS_ctx.readSelectValue(column, value))),
                };
                const { default: __VLS_40 } = __VLS_36.slots;
                for (const [option] of __VLS_vFor((column.options))) {
                    let __VLS_41;
                    /** @ts-ignore @type { | typeof __VLS_components.vxeOption | typeof __VLS_components.VxeOption | typeof __VLS_components['vxe-option']} */
                    vxeOption;
                    // @ts-ignore
                    const __VLS_42 = __VLS_asFunctionalComponent1(__VLS_41, new __VLS_41({
                        key: (String(option.value)),
                        label: (option.label),
                        value: (option.value),
                        disabled: (option.disabled),
                    }));
                    const __VLS_43 = __VLS_42({
                        key: (String(option.value)),
                        label: (option.label),
                        value: (option.value),
                        disabled: (option.disabled),
                    }, ...__VLS_functionalComponentArgsRest(__VLS_42));
                    // @ts-ignore
                    [rows, rowKey, columns, isRecord, setCell, setCell, getSelectModelValue, readSelectValue,];
                }
                // @ts-ignore
                [];
                var __VLS_36;
                var __VLS_37;
            }
            else if (__VLS_ctx.shouldUseObjectEditor(column, scope.row)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "lc-array-table__object-cell" },
                });
                /** @type {__VLS_StyleScopedClasses['lc-array-table__object-cell']} */ ;
                let __VLS_46;
                /** @ts-ignore @type { | typeof __VLS_components.vxeInput | typeof __VLS_components.VxeInput | typeof __VLS_components['vxe-input']} */
                vxeInput;
                // @ts-ignore
                const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
                    modelValue: (__VLS_ctx.formatObjectPreview(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    readonly: true,
                }));
                const __VLS_48 = __VLS_47({
                    modelValue: (__VLS_ctx.formatObjectPreview(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    readonly: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_47));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            if (!(__VLS_ctx.isRecord(scope?.row)))
                                throw 0;
                            if (!!(column.component === 'vxe-switch'))
                                throw 0;
                            if (!!(column.component === 'vxe-select'))
                                throw 0;
                            if (!(__VLS_ctx.shouldUseObjectEditor(column, scope.row)))
                                throw 0;
                            return (__VLS_ctx.openObjectEditor(scope.row, column));
                            // @ts-ignore
                            [shouldUseObjectEditor, formatObjectPreview, openObjectEditor,];
                        } },
                    type: "button",
                });
            }
            else if (column.component === 'vxe-textarea') {
                let __VLS_51;
                /** @ts-ignore @type { | typeof __VLS_components.vxeTextarea | typeof __VLS_components.VxeTextarea | typeof __VLS_components['vxe-textarea']} */
                vxeTextarea;
                // @ts-ignore
                const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.readString(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                }));
                const __VLS_53 = __VLS_52({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.readString(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                }, ...__VLS_functionalComponentArgsRest(__VLS_52));
                let __VLS_56;
                const __VLS_57 = {
                    /** @type {typeof __VLS_56.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, value)),
                };
                var __VLS_54;
                var __VLS_55;
            }
            else if (column.component === 'vxe-password-input') {
                let __VLS_58;
                /** @ts-ignore @type { | typeof __VLS_components.vxePasswordInput | typeof __VLS_components.VxePasswordInput | typeof __VLS_components['vxe-password-input']} */
                vxePasswordInput;
                // @ts-ignore
                const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.readString(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                    clearable: true,
                }));
                const __VLS_60 = __VLS_59({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.readString(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                    clearable: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_59));
                let __VLS_63;
                const __VLS_64 = {
                    /** @type {typeof __VLS_63.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, value)),
                };
                var __VLS_61;
                var __VLS_62;
            }
            else if (column.component === 'lc-number-input') {
                let __VLS_65;
                /** @ts-ignore @type { | typeof __VLS_components.vxeNumberInput | typeof __VLS_components.VxeNumberInput | typeof __VLS_components['vxe-number-input']} */
                vxeNumberInput;
                // @ts-ignore
                const __VLS_66 = __VLS_asFunctionalComponent1(__VLS_65, new __VLS_65({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.toNumber(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                }));
                const __VLS_67 = __VLS_66({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.toNumber(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                }, ...__VLS_functionalComponentArgsRest(__VLS_66));
                let __VLS_70;
                const __VLS_71 = {
                    /** @type {typeof __VLS_70.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, value)),
                };
                var __VLS_68;
                var __VLS_69;
            }
            else if (column.component === 'lc-json-editor') {
                const __VLS_72 = LcJsonEditor;
                // @ts-ignore
                const __VLS_73 = __VLS_asFunctionalComponent1(__VLS_72, new __VLS_72({
                    ...{ 'onUpdate:modelValue': {} },
                    field: (__VLS_ctx.createCellField(column)),
                    modelValue: (scope.row[column.field]),
                }));
                const __VLS_74 = __VLS_73({
                    ...{ 'onUpdate:modelValue': {} },
                    field: (__VLS_ctx.createCellField(column)),
                    modelValue: (scope.row[column.field]),
                }, ...__VLS_functionalComponentArgsRest(__VLS_73));
                let __VLS_77;
                const __VLS_78 = {
                    /** @type {typeof __VLS_77.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, value)),
                };
                var __VLS_75;
                var __VLS_76;
            }
            else {
                let __VLS_79;
                /** @ts-ignore @type { | typeof __VLS_components.vxeInput | typeof __VLS_components.VxeInput | typeof __VLS_components['vxe-input']} */
                vxeInput;
                // @ts-ignore
                const __VLS_80 = __VLS_asFunctionalComponent1(__VLS_79, new __VLS_79({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.readString(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                    clearable: true,
                }));
                const __VLS_81 = __VLS_80({
                    ...{ 'onUpdate:modelValue': {} },
                    modelValue: (__VLS_ctx.readString(scope.row[column.field])),
                    placeholder: (column.placeholder),
                    ...(column.props),
                    clearable: true,
                }, ...__VLS_functionalComponentArgsRest(__VLS_80));
                let __VLS_84;
                const __VLS_85 = {
                    /** @type {typeof __VLS_84.'update:modelValue'} */
                    'onUpdate:modelValue': ((value) => __VLS_ctx.setCell(scope.row, column.field, value)),
                };
                var __VLS_82;
                var __VLS_83;
            }
        }
        // @ts-ignore
        [setCell, setCell, setCell, setCell, setCell, readString, readString, readString, toNumber, createCellField,];
    }
    // @ts-ignore
    [];
    var __VLS_22;
    // @ts-ignore
    [];
}
let __VLS_86;
/** @ts-ignore @type { | typeof __VLS_components.vxeColumn | typeof __VLS_components.VxeColumn | typeof __VLS_components['vxe-column'] | typeof __VLS_components.vxeColumn | typeof __VLS_components.VxeColumn | typeof __VLS_components['vxe-column']} */
vxeColumn;
// @ts-ignore
const __VLS_87 = __VLS_asFunctionalComponent1(__VLS_86, new __VLS_86({
    title: "操作",
    width: "96",
    fixed: "right",
}));
const __VLS_88 = __VLS_87({
    title: "操作",
    width: "96",
    fixed: "right",
}, ...__VLS_functionalComponentArgsRest(__VLS_87));
const { default: __VLS_91 } = __VLS_89.slots;
{
    const { default: __VLS_92 } = __VLS_89.slots;
    const [scope] = __VLS_vSlot(__VLS_92);
    if (__VLS_ctx.isRecord(scope?.row)) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "lc-array-table__actions" },
        });
        /** @type {__VLS_StyleScopedClasses['lc-array-table__actions']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.isRecord(scope?.row)))
                        throw 0;
                    return (__VLS_ctx.moveRow(scope.row, -1));
                    // @ts-ignore
                    [isRecord, moveRow,];
                } },
            type: "button",
            disabled: (__VLS_ctx.getRowIndex(scope.row) <= 0),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.isRecord(scope?.row)))
                        throw 0;
                    return (__VLS_ctx.moveRow(scope.row, 1));
                    // @ts-ignore
                    [moveRow, getRowIndex,];
                } },
            type: "button",
            disabled: (__VLS_ctx.getRowIndex(scope.row) >= __VLS_ctx.rows.length - 1),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    if (!(__VLS_ctx.isRecord(scope?.row)))
                        throw 0;
                    return (__VLS_ctx.removeRow(scope.row));
                    // @ts-ignore
                    [rows, getRowIndex, removeRow,];
                } },
            type: "button",
            ...{ class: "is-danger" },
        });
        /** @type {__VLS_StyleScopedClasses['is-danger']} */ ;
    }
    // @ts-ignore
    [];
}
// @ts-ignore
[];
var __VLS_89;
// @ts-ignore
[];
var __VLS_11;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({
    __typeEmits: {},
    __typeProps: {},
});
export default {};
