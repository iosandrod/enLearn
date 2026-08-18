import { canMergeActiveCellArea, getActiveCellAreaMergeCells, mergeActiveCellArea, splitActiveCellArea } from '../core/merge';
import { canInsertCellAreaColumns, canInsertCellAreaRows, canRemoveCellAreaColumns, canRemoveCellAreaRows } from '../core/structure';
import { getStore } from '../core/store';
import { getCellAreaSelectionInfo } from '../core/selection';
import { closestByClass } from './traversal';
const tableContextMenuCleanupMap = new WeakMap();
let contextMenuController = null;
let activeContextMenuTable = null;
let lifecycleInstalled = false;
function getRootElement($table) {
    return $table.getRefMaps?.().refElem?.value || null;
}
function getCellFromTarget($table, target) {
    const root = getRootElement($table);
    const targetElement = target instanceof HTMLElement ? target : null;
    const cell = closestByClass(targetElement, 'vxe-body--column');
    if (cell &&
        root &&
        root.contains(cell) &&
        closestByClass(cell, 'vxe-table--body-wrapper')) {
        return cell;
    }
    return null;
}
function getBodyCellFromEvent($table, evnt) {
    const targetCell = getCellFromTarget($table, evnt.target);
    if (targetCell) {
        return targetCell;
    }
    const pointTarget = document.elementFromPoint(evnt.clientX, evnt.clientY);
    return getCellFromTarget($table, pointTarget);
}
function getRows($table) {
    return $table.getTableData?.().visibleData || [];
}
function getColumns($table) {
    return $table.getColumns?.() || [];
}
function getRowIndex($table, row) {
    const rows = getRows($table);
    const index = $table.getVTRowIndex ? $table.getVTRowIndex(row) : -1;
    return index > -1 ? index : rows.indexOf(row);
}
function getColumnIndex($table, column) {
    const columns = getColumns($table);
    const index = $table.getVTColumnIndex ? $table.getVTColumnIndex(column) : -1;
    return index > -1 ? index : columns.indexOf(column);
}
function getCellRowAndColumn($table, cell) {
    const rowNode = $table.getRowNode?.(cell.parentElement);
    const columnNode = $table.getColumnNode?.(cell);
    return {
        row: rowNode?.item || null,
        column: columnNode?.item || null
    };
}
function isCellInActiveArea($table, cell) {
    const store = getStore($table);
    const activeArea = store.activeArea;
    if (!activeArea || activeArea.type !== 'body') {
        return false;
    }
    const selection = getCellAreaSelectionInfo($table, activeArea);
    if (!selection) {
        return false;
    }
    const { row, column } = getCellRowAndColumn($table, cell);
    if (!row || !column) {
        return false;
    }
    const rowIndex = getRowIndex($table, row);
    const columnIndex = getColumnIndex($table, column);
    const rowStartIndex = Math.min(selection.rowRange.startIndex, selection.rowRange.endIndex);
    const rowEndIndex = Math.max(selection.rowRange.startIndex, selection.rowRange.endIndex);
    const columnStartIndex = Math.min(selection.columnRange.startIndex, selection.columnRange.endIndex);
    const columnEndIndex = Math.max(selection.columnRange.startIndex, selection.columnRange.endIndex);
    return rowIndex >= rowStartIndex &&
        rowIndex <= rowEndIndex &&
        columnIndex >= columnStartIndex &&
        columnIndex <= columnEndIndex;
}
export function showCellAreaContextMenu($table, evnt) {
    if (!contextMenuController) {
        return;
    }
    activeContextMenuTable = $table;
    contextMenuController.open({
        x: evnt.clientX,
        y: evnt.clientY,
        className: 'enlearn-context-menu',
        options: [
            [
                {
                    code: 'insert-rows',
                    name: '添加行',
                    disabled: !canInsertCellAreaRows($table)
                },
                {
                    code: 'insert-columns',
                    name: '添加列',
                    disabled: !canInsertCellAreaColumns($table)
                },
                {
                    code: 'remove-rows',
                    name: '删除行',
                    disabled: !canRemoveCellAreaRows($table)
                },
                {
                    code: 'remove-columns',
                    name: '删除列',
                    disabled: !canRemoveCellAreaColumns($table)
                },
                {
                    code: 'merge',
                    name: '合并单元格',
                    disabled: !canMergeActiveCellArea($table)
                },
                {
                    code: 'split',
                    name: '拆分单元格',
                    disabled: getActiveCellAreaMergeCells($table).length === 0
                }
            ]
        ],
        events: {
            optionClick({ option, $event }) {
                if (option.code === 'insert-rows') {
                    $table.insertCellAreaRows?.($event);
                }
                else if (option.code === 'insert-columns') {
                    $table.insertCellAreaColumns?.($event);
                }
                else if (option.code === 'remove-rows') {
                    $table.removeCellAreaRows?.($event);
                }
                else if (option.code === 'remove-columns') {
                    $table.removeCellAreaColumns?.($event);
                }
                else if (option.code === 'merge') {
                    mergeActiveCellArea($table, $event);
                }
                else if (option.code === 'split') {
                    splitActiveCellArea($table, $event);
                }
            },
            hide() {
                if (activeContextMenuTable === $table) {
                    activeContextMenuTable = null;
                }
            }
        }
    });
}
export function hideCellAreaContextMenu($table) {
    if (activeContextMenuTable !== $table) {
        return;
    }
    activeContextMenuTable = null;
    contextMenuController?.close();
}
export function unbindCellAreaContextMenu($table) {
    tableContextMenuCleanupMap.get($table)?.();
    hideCellAreaContextMenu($table);
}
export function bindCellAreaContextMenu($table) {
    if (tableContextMenuCleanupMap.has($table)) {
        return;
    }
    const root = getRootElement($table);
    if (!root) {
        return;
    }
    const handleContextMenu = (evnt) => {
        const store = getStore($table);
        if (store.isSelecting || store.isExtending) {
            return;
        }
        const cell = getBodyCellFromEvent($table, evnt);
        if (!cell || !isCellInActiveArea($table, cell)) {
            hideCellAreaContextMenu($table);
            return;
        }
        evnt.preventDefault();
        evnt.stopPropagation();
        $table.closeMenu?.();
        showCellAreaContextMenu($table, evnt);
    };
    root.addEventListener('contextmenu', handleContextMenu);
    tableContextMenuCleanupMap.set($table, () => {
        root.removeEventListener('contextmenu', handleContextMenu);
        tableContextMenuCleanupMap.delete($table);
    });
}
export function registerCellAreaContextMenuLifecycle(VxeUI) {
    contextMenuController = VxeUI.contextMenu ?? null;
    if (lifecycleInstalled || !VxeUI.interceptor) {
        return;
    }
    VxeUI.interceptor.add('mounted', ({ $table }) => {
        if ($table?.getCellAreas && $table?.mergeActiveCellArea) {
            bindCellAreaContextMenu($table);
        }
    });
    VxeUI.interceptor.add('beforeUnmount', ({ $table }) => {
        if ($table?.getCellAreas) {
            unbindCellAreaContextMenu($table);
        }
    });
    lifecycleInstalled = true;
}
//# sourceMappingURL=context-menu.js.map