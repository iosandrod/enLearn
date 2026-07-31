export var VisualEditorPropsType;
(function (VisualEditorPropsType) {
    /** 输入框 */
    VisualEditorPropsType["input"] = "input";
    /** 数字输入框 */
    VisualEditorPropsType["inputNumber"] = "InputNumber";
    /** 颜色选择器 */
    VisualEditorPropsType["color"] = "color";
    /** 下拉选择器 */
    VisualEditorPropsType["select"] = "select";
    /** 表格 */
    VisualEditorPropsType["table"] = "table";
    /** 开关 */
    VisualEditorPropsType["switch"] = "switch";
    /** 模型绑定选择器 */
    VisualEditorPropsType["modelBind"] = "ModelBind";
    /** 可拖拽项 */
    VisualEditorPropsType["crossSortable"] = "CrossSortable";
})(VisualEditorPropsType || (VisualEditorPropsType = {}));
export function createEditorModelBindProp({ label = '字段绑定', defaultValue, tips, }) {
    return {
        type: VisualEditorPropsType.modelBind,
        label,
        tips,
        defaultValue,
    };
}
export function createEditorSwitchProp({ label, defaultValue, tips, }) {
    return {
        type: VisualEditorPropsType.switch,
        label,
        tips,
        defaultValue,
    };
}
export function createEditorInputProp({ label, defaultValue, tips, }) {
    return {
        type: VisualEditorPropsType.input,
        label,
        tips,
        defaultValue,
    };
}
export function createEditorInputNumberProp({ label, defaultValue, max, min, tips, }) {
    return {
        type: VisualEditorPropsType.inputNumber,
        label,
        tips,
        max,
        min,
        defaultValue,
    };
}
export function createEditorColorProp({ label, defaultValue }) {
    return {
        type: VisualEditorPropsType.color,
        label,
        defaultValue,
    };
}
export function createEditorSelectProp({ label, options, defaultValue, tips, multiple, }) {
    return {
        type: VisualEditorPropsType.select,
        label,
        defaultValue,
        tips,
        options,
        multiple,
    };
}
export function createEditorTableProp({ label, option, defaultValue, }) {
    return {
        type: VisualEditorPropsType.table,
        label,
        table: option,
        defaultValue,
    };
}
export function createEditorCrossSortableProp({ label, labelPosition, multiple, showItemPropsConfig, defaultValue, }) {
    return {
        type: VisualEditorPropsType.crossSortable,
        label,
        multiple,
        showItemPropsConfig,
        labelPosition,
        defaultValue,
    };
}
