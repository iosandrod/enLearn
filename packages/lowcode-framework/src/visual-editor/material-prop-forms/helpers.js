export function defineMaterialPropForm(definition) {
    return definition;
}
export function defineMaterialPropForms(definitions) {
    return definitions;
}
export function propField(field) {
    return {
        target: 'props',
        valueKind: 'string',
        component: field.component ?? 'vxe-input',
        ...field,
    };
}
export function jsonPropField(field) {
    return propField({
        component: 'lc-json-editor',
        valueKind: 'json',
        props: {
            rows: 8,
            resize: 'vertical',
            ...(field.props ?? {}),
        },
        ...field,
    });
}
export function arrayTablePropField({ columns, addText = '新增', rowKey = '__rowKey', defaultRow, valueMode, valueField, valueTitle, props, ...field }) {
    return propField({
        component: 'lc-array-table',
        valueKind: 'raw',
        defaultValue: [],
        props: {
            addText,
            rowKey,
            columns,
            ...(defaultRow ? { defaultRow } : {}),
            ...(valueMode ? { valueMode } : {}),
            ...(valueField ? { valueField } : {}),
            ...(valueTitle ? { valueTitle } : {}),
            ...(props ?? {}),
        },
        ...field,
    });
}
export function subFormPropField({ fields, layout, props, ...field }) {
    return propField({
        component: 'lc-sub-form',
        valueKind: 'raw',
        defaultValue: {},
        props: {
            fields,
            ...(layout?.length ? { layout } : {}),
            ...(props ?? {}),
        },
        ...field,
    });
}
export function switchPropField(field) {
    return propField({
        component: 'vxe-switch',
        valueKind: 'boolean',
        ...field,
    });
}
export function option(label, rawValue, value = String(rawValue)) {
    return {
        label,
        value,
        rawValue,
    };
}
