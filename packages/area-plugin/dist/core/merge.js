import { getStore } from './store';
import { getCellAreaSelectionInfo } from './selection';
function normalizeRange(startIndex, endIndex) {
    return {
        startIndex: Math.min(startIndex, endIndex),
        endIndex: Math.max(startIndex, endIndex)
    };
}
function getActiveBodyArea($table, area = getStore($table).activeArea) {
    if (!area || area.type !== 'body') {
        return null;
    }
    return getCellAreaSelectionInfo($table, area)?.area || null;
}
function getAreaBounds($table, area = getStore($table).activeArea) {
    const activeArea = getActiveBodyArea($table, area);
    if (!activeArea) {
        return null;
    }
    const rowRange = normalizeRange(activeArea.startRowIndex, activeArea.endRowIndex);
    const columnRange = normalizeRange(activeArea.startColumnIndex, activeArea.endColumnIndex);
    if (rowRange.startIndex < 0 ||
        rowRange.endIndex < 0 ||
        columnRange.startIndex < 0 ||
        columnRange.endIndex < 0) {
        return null;
    }
    return {
        rowStartIndex: rowRange.startIndex,
        rowEndIndex: rowRange.endIndex,
        columnStartIndex: columnRange.startIndex,
        columnEndIndex: columnRange.endIndex
    };
}
function rangesOverlap(startA, endA, startB, endB) {
    return startA <= endB && startB <= endA;
}
function toPositiveNumber(value, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : fallback;
}
export function createActiveCellAreaMergeOption($table, area = getStore($table).activeArea) {
    const bounds = getAreaBounds($table, area);
    if (!bounds) {
        return null;
    }
    return {
        row: bounds.rowStartIndex,
        col: bounds.columnStartIndex,
        rowspan: bounds.rowEndIndex - bounds.rowStartIndex + 1,
        colspan: bounds.columnEndIndex - bounds.columnStartIndex + 1
    };
}
export function canMergeActiveCellArea($table, area = getStore($table).activeArea) {
    const merge = createActiveCellAreaMergeOption($table, area);
    return !!merge && (merge.rowspan > 1 || merge.colspan > 1);
}
export function getActiveCellAreaMergeCells($table, area = getStore($table).activeArea) {
    const bounds = getAreaBounds($table, area);
    const mergeCells = $table.getMergeCells?.() || [];
    if (!bounds || !Array.isArray(mergeCells)) {
        return [];
    }
    return mergeCells.filter((merge) => {
        const row = Number(merge.row);
        const col = Number(merge.col);
        if (!Number.isFinite(row) || !Number.isFinite(col)) {
            return false;
        }
        const rowspan = toPositiveNumber(merge.rowspan || merge._rowspan, 1);
        const colspan = toPositiveNumber(merge.colspan || merge._colspan, 1);
        return rangesOverlap(bounds.rowStartIndex, bounds.rowEndIndex, row, row + rowspan - 1) &&
            rangesOverlap(bounds.columnStartIndex, bounds.columnEndIndex, col, col + colspan - 1);
    });
}
function removeMergeCells($table, mergeCells) {
    if (!mergeCells.length || !$table.removeMergeCells) {
        return Promise.resolve([]);
    }
    return Promise.resolve($table.removeMergeCells(mergeCells.map(merge => ({
        row: merge.row,
        col: merge.col
    }))));
}
export function mergeActiveCellArea($table, evnt) {
    const area = getActiveBodyArea($table);
    const merge = createActiveCellAreaMergeOption($table, area);
    if (!area || !merge || !canMergeActiveCellArea($table, area) || !$table.setMergeCells) {
        return Promise.resolve(false);
    }
    const removedMerges = getActiveCellAreaMergeCells($table, area);
    return removeMergeCells($table, removedMerges).then(() => {
        return Promise.resolve($table.setMergeCells([merge])).then(() => {
            const result = {
                area,
                merge,
                removedMerges
            };
            $table.dispatchEvent?.('cell-area-merge', result, evnt);
            return result;
        });
    });
}
export function splitActiveCellArea($table, evnt) {
    const area = getActiveBodyArea($table);
    if (!area) {
        return Promise.resolve([]);
    }
    const mergeCells = getActiveCellAreaMergeCells($table, area);
    return removeMergeCells($table, mergeCells).then((removedMerges) => {
        if (mergeCells.length) {
            $table.dispatchEvent?.('clear-cell-area-merge', {
                area,
                merges: mergeCells,
                removedMerges
            }, evnt);
        }
        return removedMerges || mergeCells;
    });
}
//# sourceMappingURL=merge.js.map