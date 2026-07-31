const componentMap = {
    input: 'vxe-input',
    select: 'vxe-select',
    switch: 'vxe-switch',
    'vxe-input': 'vxe-input',
    'vxe-textarea': 'vxe-textarea',
    'vxe-select': 'vxe-select',
    'vxe-switch': 'vxe-switch',
    'vxe-password-input': 'vxe-password-input',
    'vxe-checkbox-group': 'vxe-checkbox-group',
    'vxe-radio-group': 'vxe-radio-group',
    'vxe-tree-select': 'vxe-tree-select',
    'lc-json-editor': 'lc-json-editor',
    'lc-number-input': 'lc-number-input',
    'array-table': 'lc-array-table',
    'lc-array-table': 'lc-array-table',
    'lc-sub-form': 'lc-sub-form',
    'sub-form': 'lc-sub-form',
};
export function readString(value, fallback = '') {
    return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
export function readBoolean(value, fallback = false) {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized))
            return true;
        if (['false', '0', 'no', 'n'].includes(normalized))
            return false;
    }
    return fallback;
}
export function readNumber(value, fallback) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed))
            return parsed;
    }
    return fallback;
}
export function readDimension(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim()) {
        const trimmed = value.trim();
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) && String(parsed) === trimmed ? parsed : trimmed;
    }
    return undefined;
}
export function readJsonObject(value, fallback = {}) {
    if (isPlainRecord(value))
        return cloneJson(value);
    if (typeof value !== 'string' || !value.trim())
        return fallback;
    try {
        const parsed = JSON.parse(value);
        return isPlainRecord(parsed) ? parsed : fallback;
    }
    catch {
        return fallback;
    }
}
export function readJsonArray(value) {
    if (Array.isArray(value))
        return cloneJson(value);
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
export function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function normalizeRows(value) {
    return Array.isArray(value) ? value.filter(isPlainRecord) : [];
}
const defaultArrayTableColumns = [
    { field: 'name', title: '名称', minWidth: 120, placeholder: '请输入名称' },
    { field: 'quantity', title: '数量', width: 88, placeholder: '0' },
    { field: 'remark', title: '备注', minWidth: 140, placeholder: '备注' },
];
function normalizeArrayTableColumns(value) {
    const rows = normalizeRows(value);
    const sourceRows = rows.length ? rows : defaultArrayTableColumns;
    return sourceRows.map((column, index) => {
        const field = readString(column.field, `field${index + 1}`);
        const title = readString(column.title, field);
        const component = readString(column.component);
        const width = readDimension(column.width);
        const minWidth = readDimension(column.minWidth);
        const options = Array.isArray(column.options)
            ? cloneJson(column.options)
            : readJsonArray(column.optionsJson);
        const props = {
            ...(isPlainRecord(column.props) ? cloneJson(column.props) : {}),
            ...readJsonObject(column.propsJson, {}),
        };
        return {
            field,
            title,
            ...(component ? { component } : {}),
            ...(width ? { width } : {}),
            ...(minWidth ? { minWidth } : {}),
            ...(readString(column.placeholder) ? { placeholder: readString(column.placeholder) } : {}),
            ...(typeof column.defaultValue !== 'undefined'
                ? { defaultValue: cloneJson(column.defaultValue) }
                : {}),
            ...(options?.length ? { options } : {}),
            ...(Object.keys(props).length ? { props } : {}),
        };
    });
}
function normalizeArrayTableProps(rawProps) {
    return {
        ...rawProps,
        columns: normalizeArrayTableColumns(rawProps.columns),
        addText: readString(rawProps.addText, '新增行'),
        rowKey: readString(rawProps.rowKey, '__rowKey'),
        ...(isPlainRecord(rawProps.defaultRow)
            ? { defaultRow: cloneJson(rawProps.defaultRow) }
            : {}),
    };
}
export function isDefined(value) {
    return value !== null && value !== undefined;
}
export function normalizeField(row) {
    const field = readString(row.field);
    const label = readString(row.label, field);
    if (!field || !label)
        return null;
    const componentName = readString(row.component, 'vxe-input');
    const component = componentMap[componentName] ?? 'vxe-input';
    const options = readJsonArray(row.optionsJson);
    const optionsSourceKey = readString(row.optionsSourceKey);
    const optionLabel = readString(row.optionLabel);
    const optionValue = readString(row.optionValue);
    const optionChildren = readString(row.optionChildren);
    const optionProps = {
        ...(isPlainRecord(row.optionProps) ? cloneJson(row.optionProps) : {}),
        ...(optionLabel ? { label: optionLabel } : {}),
        ...(optionValue ? { value: optionValue } : {}),
        ...(optionChildren ? { children: optionChildren } : {}),
    };
    const required = readBoolean(row.required, false);
    const placeholder = readString(row.placeholder);
    const help = readString(row.help);
    const span = readNumber(row.span);
    const rawProps = {
        ...(isPlainRecord(row.props) ? cloneJson(row.props) : {}),
        ...readJsonObject(row.propsJson, {}),
    };
    const props = {
        ...rawProps,
        ...(placeholder ? { placeholder, clearable: true } : {}),
    };
    if (component === 'lc-sub-form') {
        const nestedFields = normalizeRows(rawProps.fields).map(normalizeField).filter(isDefined);
        props.fields = nestedFields;
        const layout = readFormDesignerLayout(rawProps.formDesignerModel);
        if (layout) {
            props.layout = layout;
        }
        delete props.formDesignerModel;
    }
    if (component === 'lc-array-table') {
        Object.assign(props, normalizeArrayTableProps(rawProps));
    }
    return {
        field,
        label,
        component,
        ...(Object.keys(props).length ? { props } : {}),
        ...(options ? { options } : {}),
        ...(optionsSourceKey ? { optionsSourceKey } : {}),
        ...(Object.keys(optionProps).length ? { optionProps } : {}),
        ...(help ? { help } : {}),
        ...(span ? { span } : {}),
        ...(required
            ? { rules: [{ required: true, message: `${label} is required` }] }
            : {}),
    };
}
function cloneJson(value) {
    try {
        return JSON.parse(JSON.stringify(value));
    }
    catch {
        return value;
    }
}
export function normalizeColumn(row) {
    const field = readString(row.field);
    const type = readString(row.type);
    const title = readString(row.title, field || type);
    if (!field && !title && !type)
        return null;
    const formatter = normalizeColumnFormatter(row.formatter);
    const width = readDimension(row.width);
    const minWidth = readDimension(row.minWidth);
    const maxWidth = readDimension(row.maxWidth);
    const fixed = readColumnFixed(row.fixed);
    const align = readColumnAlign(row.align);
    const headerAlign = readColumnAlign(row.headerAlign);
    const footerAlign = readColumnAlign(row.footerAlign);
    const showOverflow = readColumnOverflow(row.showOverflow);
    const showHeaderOverflow = readColumnOverflow(row.showHeaderOverflow);
    const showFooterOverflow = readColumnOverflow(row.showFooterOverflow);
    const filters = readColumnJsonArray(row.filters);
    const cellRender = readColumnJsonObject(row.cellRender);
    const editRender = readColumnJsonObject(row.editRender);
    const params = readColumnJsonObject(row.params);
    return {
        ...(field ? { field } : {}),
        title,
        ...(type ? { type } : {}),
        ...(width ? { width } : {}),
        ...(minWidth ? { minWidth } : {}),
        ...(maxWidth ? { maxWidth } : {}),
        ...(fixed ? { fixed } : {}),
        ...(align ? { align } : {}),
        ...(headerAlign ? { headerAlign } : {}),
        ...(footerAlign ? { footerAlign } : {}),
        ...(typeof row.sortable !== 'undefined' ? { sortable: readBoolean(row.sortable) } : {}),
        ...(typeof row.treeNode !== 'undefined' ? { treeNode: readBoolean(row.treeNode) } : {}),
        ...(typeof row.resizable !== 'undefined' ? { resizable: readBoolean(row.resizable) } : {}),
        ...(typeof row.visible !== 'undefined' ? { visible: readBoolean(row.visible, true) } : {}),
        ...(typeof showOverflow !== 'undefined' ? { showOverflow } : {}),
        ...(typeof showHeaderOverflow !== 'undefined' ? { showHeaderOverflow } : {}),
        ...(typeof showFooterOverflow !== 'undefined' ? { showFooterOverflow } : {}),
        ...(typeof formatter !== 'undefined' ? { formatter } : {}),
        ...(filters ? { filters } : {}),
        ...(Object.keys(cellRender).length ? { cellRender } : {}),
        ...(Object.keys(editRender).length ? { editRender } : {}),
        ...(Object.keys(params).length ? { params } : {}),
    };
}
function readColumnFixed(value) {
    const fixed = readString(value);
    return fixed === 'left' || fixed === 'right' ? fixed : undefined;
}
function readColumnAlign(value) {
    const align = readString(value);
    return align === 'left' || align === 'center' || align === 'right' ? align : undefined;
}
function readColumnOverflow(value) {
    if (typeof value === 'boolean')
        return value;
    const overflow = readString(value);
    return overflow === 'ellipsis' || overflow === 'title' || overflow === 'tooltip'
        ? overflow
        : undefined;
}
function normalizeColumnFormatter(value) {
    if (isPlainRecord(value) || typeof value === 'function') {
        return value;
    }
    const textValue = readString(value);
    if (!textValue)
        return undefined;
    const parsed = readJsonObject(textValue, {});
    return Object.keys(parsed).length ? parsed : textValue;
}
function readColumnJsonObject(value) {
    if (isPlainRecord(value))
        return value;
    return readJsonObject(value, {});
}
function readColumnJsonArray(value) {
    if (Array.isArray(value))
        return value;
    return readJsonArray(value);
}
export function toBlockId(value, fallback) {
    return readString(value, fallback)
        .replace(/\s+/g, '-')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .replace(/^-+|-+$/g, '') || fallback;
}
export function isVisualEditorModel(value) {
    return (typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        typeof value.pages === 'object' &&
        value.pages !== null);
}
export function toTabsSlotKey(value, index) {
    const normalized = value.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+|_+$/g, '');
    return `tab_${normalized || index + 1}`;
}
export function readVisualBlockProps(block) {
    return isPlainRecord(block.props) ? block.props : {};
}
export function upsertFormDataSource(dataSources, key, props, autoLoad = false) {
    if (!key)
        return;
    const serviceName = readString(props.serviceName, 'admin');
    const serviceMethod = readString(props.serviceMethod, readString(props.saveMethod, 'save'));
    const saveMethod = readString(props.saveMethod);
    const postData = readJsonObject(props.postDataJson, {});
    dataSources[key] = {
        key,
        label: readString(props.title, key),
        serviceName,
        serviceMethod,
        ...(saveMethod ? { saveMethod } : {}),
        ...(Object.keys(postData).length ? { postData } : {}),
        autoLoad,
    };
}
function isDesignerFieldBlock(block) {
    return [
        'input',
        'picker',
        'switch',
        'radio',
        'checkbox',
        'array-table',
        'sub-form',
    ].includes(block.componentKey);
}
function normalizeSlotItems(slots) {
    if (!isPlainRecord(slots))
        return [];
    return Object.values(slots).filter((slot) => isPlainRecord(slot) && Array.isArray(slot.children));
}
function convertDesignedBlockToLayoutNode(block) {
    if (isDesignerFieldBlock(block)) {
        const field = readString(block.props?.name);
        return field ? { kind: 'field', field } : null;
    }
    if (block.componentKey === 'layout') {
        const columns = normalizeSlotItems(block.props?.slots)
            .map((slot) => ({
            span: readNumber(slot.span),
            blocks: convertDesignedBlocksToLayout(slot.children),
        }))
            .filter((column) => column.blocks.length > 0);
        return columns.length
            ? {
                kind: 'row',
                gutter: readNumber(block.props?.gutter),
                columns,
            }
            : null;
    }
    const nestedBlocks = normalizeSlotItems(block.props?.slots).flatMap((slot) => convertDesignedBlocksToLayout(slot.children));
    return nestedBlocks.length ? { kind: 'stack', blocks: nestedBlocks } : null;
}
function convertDesignedBlocksToLayout(blocks = []) {
    return blocks
        .map((block) => convertDesignedBlockToLayoutNode(block))
        .filter(Boolean);
}
export function readFormDesignerLayout(value) {
    if (!isVisualEditorModel(value))
        return undefined;
    const blocks = value.pages?.['/']?.blocks;
    if (!Array.isArray(blocks))
        return undefined;
    const layout = convertDesignedBlocksToLayout(blocks);
    return layout.length ? layout : undefined;
}
