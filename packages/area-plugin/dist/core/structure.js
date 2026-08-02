import { hideCellAreaOverlays } from '../dom/overlay';
import { getCellAreaSelectionInfo, unbindCellAreaScrollRepaint } from './selection';
import { clearStore, getStore } from './store';
const rowKeySeedMap = new WeakMap();
const columnSeedMap = new WeakMap();
function isObjectRecord(value) {
    return !!value && typeof value === 'object';
}
function toPositiveInteger(value, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? Math.trunc(numberValue) : fallback;
}
function toNumberIndex(value, fallback = -1) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? Math.trunc(numberValue) : fallback;
}
function getRows($table) {
    const tableData = $table.getTableData?.();
    return $table.getFullData?.() || tableData?.fullData || tableData?.visibleData || $table.getData?.() || [];
}
function getColumns($table) {
    return $table.getColumns?.() || [];
}
function getColumnId(column) {
    const value = column?.id || column?.field;
    return value === null || value === undefined ? null : `${value}`;
}
function getColumnField(column) {
    const field = column?.field || column?.property;
    return field === null || field === undefined ? '' : `${field}`;
}
function normalizeRange(startIndex, endIndex) {
    return {
        startIndex: Math.min(startIndex, endIndex),
        endIndex: Math.max(startIndex, endIndex)
    };
}
function getActiveBodySelection($table) {
    const activeArea = getStore($table).activeArea;
    if (!activeArea || activeArea.type !== 'body') {
        return null;
    }
    return getCellAreaSelectionInfo($table, activeArea);
}
function getRowCount(selection) {
    const rowRange = normalizeRange(selection.rowRange.startIndex, selection.rowRange.endIndex);
    return Math.max(0, rowRange.endIndex - rowRange.startIndex + 1);
}
function getColumnCount(selection) {
    const columnRange = normalizeRange(selection.columnRange.startIndex, selection.columnRange.endIndex);
    return Math.max(0, columnRange.endIndex - columnRange.startIndex + 1);
}
function clearAreaState($table) {
    clearStore($table);
    unbindCellAreaScrollRepaint($table);
    hideCellAreaOverlays($table);
}
function getRowKeyField($table, columns) {
    return $table.props?.rowConfig?.keyField ||
        $table.props?.rowId ||
        (columns.some(column => getColumnField(column) === 'id') ? 'id' : '');
}
function getMaxNumericFieldValue(rows, field) {
    let maxValue = -Infinity;
    rows.forEach((row) => {
        const value = Number(row?.[field]);
        if (Number.isFinite(value)) {
            maxValue = Math.max(maxValue, value);
        }
    });
    return Number.isFinite(maxValue) ? maxValue : null;
}
function getNextSeed(seedMap, $table) {
    const nextSeed = (seedMap.get($table) || 0) + 1;
    seedMap.set($table, nextSeed);
    return nextSeed;
}
function createDefaultRow($table, selection, rowNumber, options) {
    const columns = getColumns($table);
    const rowIndex = normalizeRange(selection.rowRange.startIndex, selection.rowRange.endIndex).startIndex + rowNumber - 1;
    const customRow = options.createRowMethod?.({
        $table,
        area: selection.area,
        selection,
        rowIndex,
        rowNumber,
        columns
    });
    if (isObjectRecord(customRow)) {
        return customRow;
    }
    const row = {};
    columns.forEach((column) => {
        const field = getColumnField(column);
        if (field) {
            row[field] = '';
        }
    });
    const keyField = getRowKeyField($table, columns);
    if (keyField && (row[keyField] === '' || row[keyField] === null || row[keyField] === undefined)) {
        const rows = getRows($table);
        const maxValue = getMaxNumericFieldValue(rows, keyField);
        row[keyField] = maxValue === null ? `area_row_${getNextSeed(rowKeySeedMap, $table)}` : maxValue + rowNumber;
    }
    return row;
}
function fallbackInsertRows($table, records, rowIndex) {
    const rows = getRows($table);
    const nextRows = rows.slice(0);
    nextRows.splice(Math.max(0, rowIndex), 0, ...records);
    return $table.loadData ? Promise.resolve($table.loadData(nextRows)).then(() => ({ row: records[records.length - 1] || null, rows: records })) : Promise.resolve(false);
}
function fallbackRemoveRows($table, rows) {
    const allRows = getRows($table);
    const removeSet = new Set(rows);
    const nextRows = allRows.filter((row) => !removeSet.has(row));
    return $table.loadData ? Promise.resolve($table.loadData(nextRows)).then(() => ({ row: rows[rows.length - 1] || null, rows })) : Promise.resolve(false);
}
function getUniqueColumnField($table, preferredField) {
    const usedFields = new Set(getColumns($table).map((column) => getColumnField(column)).filter(Boolean));
    if (preferredField && !usedFields.has(preferredField)) {
        return preferredField;
    }
    let field = preferredField;
    do {
        field = `area_col_${getNextSeed(columnSeedMap, $table)}`;
    } while (usedFields.has(field));
    return field;
}
function getColumnWidth(column) {
    const width = Number(column?.resizeWidth || column?.renderWidth || column?.width || column?.minWidth);
    return Number.isFinite(width) && width > 0 ? width : 120;
}
function createDefaultColumn($table, selection, columnNumber, options) {
    const columnRange = normalizeRange(selection.columnRange.startIndex, selection.columnRange.endIndex);
    const sourceColumn = selection.columns[Math.min(columnNumber - 1, selection.columns.length - 1)] || selection.startColumn;
    const fixed = selection.area.fixed;
    const columnIndex = columnRange.startIndex + columnNumber - 1;
    const field = getUniqueColumnField($table, `area_col_${(columnSeedMap.get($table) || 0) + columnNumber}`);
    const title = `新增列 ${columnNumber}`;
    const customColumn = options.createColumnMethod?.({
        $table,
        area: selection.area,
        selection,
        columnIndex,
        columnNumber,
        field,
        title,
        fixed,
        sourceColumn
    });
    const columnConfig = isObjectRecord(customColumn)
        ? { field, title, width: getColumnWidth(sourceColumn), ...customColumn }
        : { field, title, width: getColumnWidth(sourceColumn) };
    columnConfig.field = getUniqueColumnField($table, getColumnField(columnConfig) || field);
    if (!columnConfig.title) {
        columnConfig.title = title;
    }
    if (fixed && columnConfig.fixed === undefined) {
        columnConfig.fixed = fixed;
    }
    return columnConfig;
}
function getColumnInsertIndex($table, selection) {
    const columns = getColumns($table);
    const startColumnId = getColumnId(selection.startColumn);
    const indexById = startColumnId ? columns.findIndex((column) => getColumnId(column) === startColumnId) : -1;
    return indexById > -1 ? indexById : normalizeRange(selection.columnRange.startIndex, selection.columnRange.endIndex).startIndex;
}
function createInsertedColumns($table, selection, options) {
    const count = getColumnCount(selection);
    return Array.from({ length: count }, (_, index) => createDefaultColumn($table, selection, index + 1, options));
}
function setRowsFieldValue(rows, columns) {
    columns.forEach((column) => {
        const field = getColumnField(column);
        if (!field) {
            return;
        }
        rows.forEach((row) => {
            if (isObjectRecord(row) && !(field in row)) {
                row[field] = '';
            }
        });
    });
}
function deleteRowsFieldValue(rows, columns) {
    columns.forEach((column) => {
        const field = getColumnField(column);
        if (!field) {
            return;
        }
        rows.forEach((row) => {
            if (isObjectRecord(row)) {
                delete row[field];
            }
        });
    });
}
function getMergeOption(merge) {
    const row = toNumberIndex(merge?.row);
    const col = toNumberIndex(merge?.col ?? merge?.column);
    if (row < 0 || col < 0) {
        return null;
    }
    return {
        row,
        col,
        rowspan: toPositiveInteger(merge.rowspan || merge._rowspan, 1),
        colspan: toPositiveInteger(merge.colspan || merge._colspan, 1)
    };
}
function getColumnInsertMerges($table, insertIndex, insertCount) {
    const mergeCells = $table.getMergeCells?.() || [];
    if (!Array.isArray(mergeCells) || !mergeCells.length) {
        return [];
    }
    return mergeCells
        .map((merge) => {
        const option = getMergeOption(merge);
        if (!option) {
            return null;
        }
        const mergeEndIndex = option.col + option.colspan - 1;
        if (option.col >= insertIndex) {
            return { ...option, col: option.col + insertCount };
        }
        if (mergeEndIndex >= insertIndex) {
            return { ...option, colspan: option.colspan + insertCount };
        }
        return option;
    })
        .filter((merge) => !!merge);
}
function getColumnRemoveMerges($table, removeStartIndex, removeCount) {
    const mergeCells = $table.getMergeCells?.() || [];
    const removeEndIndex = removeStartIndex + removeCount - 1;
    if (!Array.isArray(mergeCells) || !mergeCells.length) {
        return [];
    }
    return mergeCells
        .map((merge) => {
        const option = getMergeOption(merge);
        if (!option) {
            return null;
        }
        const mergeEndIndex = option.col + option.colspan - 1;
        if (mergeEndIndex < removeStartIndex) {
            return option;
        }
        if (option.col > removeEndIndex) {
            return { ...option, col: option.col - removeCount };
        }
        const leftCount = Math.max(0, removeStartIndex - option.col);
        const rightCount = Math.max(0, mergeEndIndex - removeEndIndex);
        const colspan = leftCount + rightCount;
        if (colspan <= 0) {
            return null;
        }
        return {
            ...option,
            col: option.col < removeStartIndex ? option.col : removeStartIndex,
            colspan
        };
    })
        .filter((merge) => !!merge);
}
function applyBodyMerges($table, merges) {
    if (!$table.clearMergeCells || !$table.setMergeCells) {
        return Promise.resolve();
    }
    return Promise.resolve($table.clearMergeCells()).then(() => {
        return merges.length ? Promise.resolve($table.setMergeCells(merges)) : undefined;
    });
}
export function canInsertCellAreaRows($table) {
    const selection = getActiveBodySelection($table);
    return !!selection && getRowCount(selection) > 0 && !!($table.insertAt || $table.loadData);
}
export function canRemoveCellAreaRows($table) {
    const selection = getActiveBodySelection($table);
    return !!selection && selection.rows.length > 0 && !!($table.remove || $table.loadData);
}
export function canInsertCellAreaColumns($table) {
    const selection = getActiveBodySelection($table);
    return !!selection && getColumnCount(selection) > 0 && getColumns($table).length > 0 && !!$table.loadColumn;
}
export function canRemoveCellAreaColumns($table) {
    const selection = getActiveBodySelection($table);
    const columnCount = selection ? getColumnCount(selection) : 0;
    return !!selection && columnCount > 0 && getColumns($table).length > columnCount && !!$table.loadColumn;
}
export function insertCellAreaRows($table, options = {}, evnt) {
    const selection = getActiveBodySelection($table);
    if (!selection || !canInsertCellAreaRows($table)) {
        return Promise.resolve(false);
    }
    const rowRange = normalizeRange(selection.rowRange.startIndex, selection.rowRange.endIndex);
    const records = Array.from({ length: getRowCount(selection) }, (_, index) => createDefaultRow($table, selection, index + 1, options));
    const targetRow = selection.rows[0] || null;
    const insertRest = $table.insertAt ? $table.insertAt(records, targetRow) : fallbackInsertRows($table, records, rowRange.startIndex);
    return Promise.resolve(insertRest).then((result) => {
        clearAreaState($table);
        $table.dispatchEvent?.('cell-area-row-insert', { rows: records, result, selection }, evnt || null);
        return result;
    });
}
export function removeCellAreaRows($table, evnt) {
    const selection = getActiveBodySelection($table);
    if (!selection || !canRemoveCellAreaRows($table)) {
        return Promise.resolve(false);
    }
    const rows = selection.rows.slice(0);
    const removeRest = $table.remove ? $table.remove(rows) : fallbackRemoveRows($table, rows);
    return Promise.resolve(removeRest).then((result) => {
        clearAreaState($table);
        $table.dispatchEvent?.('cell-area-row-remove', { rows, result, selection }, evnt || null);
        return result;
    });
}
export function insertCellAreaColumns($table, options = {}, evnt) {
    const selection = getActiveBodySelection($table);
    if (!selection || !canInsertCellAreaColumns($table)) {
        return Promise.resolve(false);
    }
    const columns = getColumns($table);
    const insertIndex = getColumnInsertIndex($table, selection);
    const insertedColumns = createInsertedColumns($table, selection, options);
    const nextColumns = columns.slice(0);
    nextColumns.splice(Math.max(0, insertIndex), 0, ...insertedColumns);
    setRowsFieldValue(getRows($table), insertedColumns);
    const nextMerges = getColumnInsertMerges($table, insertIndex, insertedColumns.length);
    return Promise.resolve($table.loadColumn(nextColumns)).then(() => {
        return applyBodyMerges($table, nextMerges);
    }).then(() => {
        clearAreaState($table);
        const result = { columns: insertedColumns, columnIndex: insertIndex };
        $table.dispatchEvent?.('cell-area-column-insert', { ...result, selection }, evnt || null);
        return result;
    });
}
export function removeCellAreaColumns($table, evnt) {
    const selection = getActiveBodySelection($table);
    if (!selection || !canRemoveCellAreaColumns($table)) {
        return Promise.resolve(false);
    }
    const columns = getColumns($table);
    const removeColumnIds = new Set(selection.columns.map((column) => getColumnId(column)).filter(Boolean));
    const removedColumns = columns.filter((column) => removeColumnIds.has(getColumnId(column)));
    const nextColumns = columns.filter((column) => !removeColumnIds.has(getColumnId(column)));
    const removeIndex = getColumnInsertIndex($table, selection);
    const removeCount = Math.max(removedColumns.length, getColumnCount(selection));
    const nextMerges = getColumnRemoveMerges($table, removeIndex, removeCount);
    deleteRowsFieldValue(getRows($table), removedColumns);
    return Promise.resolve($table.loadColumn(nextColumns)).then(() => {
        return applyBodyMerges($table, nextMerges);
    }).then(() => {
        clearAreaState($table);
        const result = { columns: removedColumns, columnIndex: removeIndex };
        $table.dispatchEvent?.('cell-area-column-remove', { ...result, selection }, evnt || null);
        return result;
    });
}
//# sourceMappingURL=structure.js.map