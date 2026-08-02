import { canMergeActiveCellArea, getActiveCellAreaMergeCells, mergeActiveCellArea, splitActiveCellArea } from '../core/merge';
import { canInsertCellAreaColumns, canInsertCellAreaRows, canRemoveCellAreaColumns, canRemoveCellAreaRows } from '../core/structure';
import { getStore } from '../core/store';
import { getCellAreaSelectionInfo } from '../core/selection';
import { closestByClass } from './traversal';
const tableContextMenuRefsMap = new WeakMap();
const tableContextMenuCleanupMap = new WeakMap();
let lifecycleInstalled = false;
function getRootElement($table) {
    return $table.getRefMaps?.().refElem?.value || null;
}
function isEventTargetNode(target) {
    return !!target && typeof target.nodeType === 'number';
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
function createMenuButton(code, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'vxe-table--extend-area-context-menu-item';
    button.setAttribute('role', 'menuitem');
    button.setAttribute('data-vxe-cell-area-menu-code', code);
    button.textContent = label;
    return button;
}
function createContextMenuRefs($table) {
    const menuEl = document.createElement('div');
    menuEl.className = 'vxe-table--extend-area-context-menu vxe-table--ignore-clear vxe-table--ignore-areas-clear';
    menuEl.setAttribute('role', 'menu');
    menuEl.setAttribute('data-vxe-cell-area-context-menu', 'true');
    menuEl.style.display = 'none';
    const insertRowsButton = createMenuButton('insert-rows', '添加行');
    const insertColumnsButton = createMenuButton('insert-columns', '添加列');
    const removeRowsButton = createMenuButton('remove-rows', '删除行');
    const removeColumnsButton = createMenuButton('remove-columns', '删除列');
    const mergeButton = createMenuButton('merge', '合并单元格');
    const splitButton = createMenuButton('split', '拆分单元格');
    menuEl.appendChild(insertRowsButton);
    menuEl.appendChild(insertColumnsButton);
    menuEl.appendChild(removeRowsButton);
    menuEl.appendChild(removeColumnsButton);
    menuEl.appendChild(mergeButton);
    menuEl.appendChild(splitButton);
    document.body.appendChild(menuEl);
    const refs = {
        menuEl,
        insertRowsButton,
        insertColumnsButton,
        removeRowsButton,
        removeColumnsButton,
        mergeButton,
        splitButton,
        isOpen: false,
        removeDocumentListeners: null
    };
    const handleMenuMousedown = (evnt) => {
        evnt.preventDefault();
        evnt.stopPropagation();
    };
    const runAction = (button, evnt, callback) => {
        evnt.preventDefault();
        evnt.stopPropagation();
        if (!button.disabled) {
            hideCellAreaContextMenu($table);
            callback();
        }
    };
    const handleInsertRowsClick = (evnt) => {
        runAction(insertRowsButton, evnt, () => {
            $table.insertCellAreaRows?.(evnt);
        });
    };
    const handleInsertColumnsClick = (evnt) => {
        runAction(insertColumnsButton, evnt, () => {
            $table.insertCellAreaColumns?.(evnt);
        });
    };
    const handleRemoveRowsClick = (evnt) => {
        runAction(removeRowsButton, evnt, () => {
            $table.removeCellAreaRows?.(evnt);
        });
    };
    const handleRemoveColumnsClick = (evnt) => {
        runAction(removeColumnsButton, evnt, () => {
            $table.removeCellAreaColumns?.(evnt);
        });
    };
    const handleMergeClick = (evnt) => {
        runAction(mergeButton, evnt, () => {
            mergeActiveCellArea($table, evnt);
        });
    };
    const handleSplitClick = (evnt) => {
        runAction(splitButton, evnt, () => {
            splitActiveCellArea($table, evnt);
        });
    };
    menuEl.addEventListener('mousedown', handleMenuMousedown);
    insertRowsButton.addEventListener('click', handleInsertRowsClick);
    insertColumnsButton.addEventListener('click', handleInsertColumnsClick);
    removeRowsButton.addEventListener('click', handleRemoveRowsClick);
    removeColumnsButton.addEventListener('click', handleRemoveColumnsClick);
    mergeButton.addEventListener('click', handleMergeClick);
    splitButton.addEventListener('click', handleSplitClick);
    tableContextMenuRefsMap.set($table, refs);
    return refs;
}
function getContextMenuRefs($table) {
    const cachedRefs = tableContextMenuRefsMap.get($table);
    if (cachedRefs?.menuEl.isConnected) {
        return cachedRefs;
    }
    return createContextMenuRefs($table);
}
function setButtonDisabled(button, disabled) {
    button.disabled = disabled;
    button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
}
function bindDocumentCloseListeners($table, refs) {
    if (refs.removeDocumentListeners) {
        return;
    }
    const hide = () => hideCellAreaContextMenu($table);
    const handleDocumentMousedown = (evnt) => {
        if (isEventTargetNode(evnt.target) && refs.menuEl.contains(evnt.target)) {
            return;
        }
        hide();
    };
    const handleDocumentContextmenu = (evnt) => {
        if (isEventTargetNode(evnt.target) && refs.menuEl.contains(evnt.target)) {
            evnt.preventDefault();
            return;
        }
        hide();
    };
    const handleKeydown = (evnt) => {
        if (evnt.key === 'Escape') {
            hide();
        }
    };
    document.addEventListener('mousedown', handleDocumentMousedown);
    document.addEventListener('contextmenu', handleDocumentContextmenu);
    document.addEventListener('wheel', hide, { passive: true });
    document.addEventListener('scroll', hide, true);
    document.addEventListener('keydown', handleKeydown);
    refs.removeDocumentListeners = () => {
        document.removeEventListener('mousedown', handleDocumentMousedown);
        document.removeEventListener('contextmenu', handleDocumentContextmenu);
        document.removeEventListener('wheel', hide);
        document.removeEventListener('scroll', hide, true);
        document.removeEventListener('keydown', handleKeydown);
        refs.removeDocumentListeners = null;
    };
}
function positionMenu(refs, clientX, clientY) {
    const { menuEl } = refs;
    menuEl.style.visibility = 'hidden';
    menuEl.style.display = 'block';
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    const padding = 8;
    const menuWidth = menuEl.offsetWidth || 152;
    const menuHeight = menuEl.offsetHeight || 188;
    const maxLeft = Math.max(padding, window.innerWidth - menuWidth - padding);
    const maxTop = Math.max(padding, window.innerHeight - menuHeight - padding);
    menuEl.style.left = `${Math.max(padding, Math.min(clientX, maxLeft))}px`;
    menuEl.style.top = `${Math.max(padding, Math.min(clientY, maxTop))}px`;
    menuEl.style.visibility = '';
}
export function showCellAreaContextMenu($table, evnt) {
    const refs = getContextMenuRefs($table);
    setButtonDisabled(refs.insertRowsButton, !canInsertCellAreaRows($table));
    setButtonDisabled(refs.insertColumnsButton, !canInsertCellAreaColumns($table));
    setButtonDisabled(refs.removeRowsButton, !canRemoveCellAreaRows($table));
    setButtonDisabled(refs.removeColumnsButton, !canRemoveCellAreaColumns($table));
    setButtonDisabled(refs.mergeButton, !canMergeActiveCellArea($table));
    setButtonDisabled(refs.splitButton, getActiveCellAreaMergeCells($table).length === 0);
    refs.isOpen = true;
    positionMenu(refs, evnt.clientX, evnt.clientY);
    bindDocumentCloseListeners($table, refs);
}
export function hideCellAreaContextMenu($table) {
    const refs = tableContextMenuRefsMap.get($table);
    if (!refs) {
        return;
    }
    refs.isOpen = false;
    refs.menuEl.style.display = 'none';
    refs.removeDocumentListeners?.();
}
export function unbindCellAreaContextMenu($table) {
    const cleanup = tableContextMenuCleanupMap.get($table);
    if (cleanup) {
        cleanup();
    }
    const refs = tableContextMenuRefsMap.get($table);
    if (refs) {
        refs.removeDocumentListeners?.();
        refs.menuEl.remove();
        tableContextMenuRefsMap.delete($table);
    }
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