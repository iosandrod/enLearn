export function isColumnAreaDisabled(params, options) {
    const { column } = params;
    if (!column) {
        return true;
    }
    if (column.params && column.params.extendCellAreaDisabled) {
        return true;
    }
    if (options.disabledMethod && options.disabledMethod(params)) {
        return true;
    }
    return false;
}
//# sourceMappingURL=guards.js.map