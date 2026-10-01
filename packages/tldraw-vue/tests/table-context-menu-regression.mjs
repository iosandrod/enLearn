import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
	CELL_AREA_CONTEXT_MENU_Z_INDEX,
	isCellAreaContextMenuTrigger,
	shouldCloseCellAreaContextMenu,
} from '../../area-plugin/src/dom/context-menu-pointer.ts'

const contextMenuSource = await readFile(
  new URL('../../area-plugin/src/dom/context-menu.ts', import.meta.url),
  'utf8',
)

assert.equal(isCellAreaContextMenuTrigger(2), true)
assert.equal(isCellAreaContextMenuTrigger(0), false)
assert.equal(isCellAreaContextMenuTrigger(1), false)

assert.equal(shouldCloseCellAreaContextMenu(0, false), true)
assert.equal(shouldCloseCellAreaContextMenu(0, true), false)
assert.equal(shouldCloseCellAreaContextMenu(2, false), false)
assert.equal(CELL_AREA_CONTEXT_MENU_Z_INDEX, 2147483647)
assert.match(
  contextMenuSource,
  /zIndex:\s*CELL_AREA_CONTEXT_MENU_Z_INDEX/,
  'Table context menus must explicitly use the topmost popup z-index.',
)

console.log('Verified table context menu mouse-button and outside-click behavior.')
