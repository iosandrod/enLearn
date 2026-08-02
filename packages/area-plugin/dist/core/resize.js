import { getStore } from './store';
import { repaintActiveCellArea } from './selection';
function toPositiveNumber(value) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : 0;
}
function getResizeColumn(params) {
    return params?.resizeColumn || params?.column || null;
}
function getResizeRow(params) {
    return params?.resizeRow || params?.row || null;
}
function repaintIfActive($table) {
    if (getStore($table).activeArea) {
        repaintActiveCellArea($table);
    }
}
function getFullRows($table) {
    const tableData = $table.getTableData?.();
    if (Array.isArray(tableData?.fullData)) {
        return tableData.fullData;
    }
    if (Array.isArray($table.internalData?.afterFullData)) {
        return $table.internalData.afterFullData;
    }
    const fullData = $table.getFullData?.();
    return Array.isArray(fullData) ? fullData : [];
}
function getRowHeight($table, row, rowRest) {
    const apiHeight = Number($table.getRowHeight?.(row));
    if (Number.isFinite(apiHeight) && apiHeight > 0) {
        return apiHeight;
    }
    const restHeight = Number(rowRest?.resizeHeight || rowRest?.height);
    return Number.isFinite(restHeight) && restHeight > 0 ? restHeight : 48;
}
function refreshRowOffsetTop($table) {
    const rows = getFullRows($table);
    const fullAllDataRowIdData = $table.internalData?.fullAllDataRowIdData || {};
    let offsetTop = 0;
    rows.forEach((row) => {
        const rowid = $table.getRowid?.(row);
        const rowRest = rowid === null || rowid === undefined ? null : fullAllDataRowIdData[`${rowid}`];
        if (!rowRest) {
            return;
        }
        rowRest.oTop = offsetTop;
        offsetTop += getRowHeight($table, row, rowRest);
        if ($table.internalData?.rowExpandedMaps?.[`${rowid}`]) {
            offsetTop += Number(rowRest.expandHeight) || 0;
        }
    });
}
function refreshAfterColumnResize($table, evnt, params) {
    $table.analyColumnWidth?.();
    return Promise.resolve($table.recalculate?.()).then(() => {
        return Promise.resolve($table.refreshScroll?.());
    }).then(() => {
        $table.saveCustomStore?.('update:width');
        $table.updateCellAreas?.();
        $table.dispatchEvent?.('column-resizable-change', params, evnt);
        $table.dispatchEvent?.('resizable-change', params, evnt);
        repaintIfActive($table);
        return params;
    });
}
function refreshAfterRowResize($table, evnt, params) {
    return Promise.resolve($table.recalculate?.()).then(() => {
        return Promise.resolve($table.refreshScroll?.());
    }).then(() => {
        $table.updateCellAreas?.();
        $table.dispatchEvent?.('row-resizable-change', params, evnt);
        repaintIfActive($table);
        return params;
    });
}
export function handleColumnResizeCellAreaEvent($table, evnt, params) {
    const resizeColumn = getResizeColumn(params);
    const resizeWidth = toPositiveNumber(params?.resizeWidth);
    if (!resizeColumn || !resizeWidth) {
        return Promise.resolve(false);
    }
    resizeColumn.resizeWidth = resizeWidth;
    return refreshAfterColumnResize($table, evnt, {
        ...params,
        resizeColumn,
        resizeWidth
    });
}
export function handleColumnResizeDblclickCellAreaEvent($table, evnt, params) {
    return handleColumnResizeCellAreaEvent($table, evnt, params);
}
export function handleRowResizeCellAreaEvent($table, evnt, params) {
    const resizeRow = getResizeRow(params);
    const resizeHeight = toPositiveNumber(params?.resizeHeight);
    if (!resizeRow || !resizeHeight) {
        return Promise.resolve(false);
    }
    const rowid = $table.getRowid?.(resizeRow);
    const rowRest = rowid === null || rowid === undefined ? null : $table.internalData?.fullAllDataRowIdData?.[`${rowid}`];
    if (!rowRest) {
        return Promise.resolve(false);
    }
    rowRest.resizeHeight = resizeHeight;
    $table.internalData.isResizeCellHeight = true;
    refreshRowOffsetTop($table);
    if ($table.reactData && typeof $table.reactData.resizeHeightFlag === 'number') {
        $table.reactData.resizeHeightFlag++;
    }
    return refreshAfterRowResize($table, evnt, {
        ...params,
        resizeRow,
        resizeHeight
    });
}
export function handleRowResizeDblclickCellAreaEvent($table, evnt, params) {
    return handleRowResizeCellAreaEvent($table, evnt, params);
}
//# sourceMappingURL=resize.js.map