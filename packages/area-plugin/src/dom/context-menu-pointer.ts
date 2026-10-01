export const CELL_AREA_CONTEXT_MENU_CLASS = 'enlearn-context-menu'

// Table menus must remain usable while a dialog or another popup is open.
export const CELL_AREA_CONTEXT_MENU_Z_INDEX = 2147483647

export function isCellAreaContextMenuTrigger(button: number) {
  return button === 2
}

export function shouldCloseCellAreaContextMenu(button: number, isInsideMenu: boolean) {
  return button === 0 && !isInsideMenu
}
