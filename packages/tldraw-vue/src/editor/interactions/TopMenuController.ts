import {
	getIndexAbove,
	getIndexBelow,
	getIndexBetween,
	type Editor,
	type TLPageId,
} from '@tldraw/editor'
import { PageRecordType } from '@tldraw/tlschema'
import { NavigationController } from './NavigationController'
import { getDuplicateSelectionOffset, getUnlockedSelectedShapeIds } from './selectionActions'

export type TopMenuGridActionId =
	| 'align-left'
	| 'align-center-horizontal'
	| 'align-right'
	| 'stretch-horizontal'
	| 'align-top'
	| 'align-center-vertical'
	| 'align-bottom'
	| 'stretch-vertical'
	| 'distribute-horizontal'
	| 'distribute-vertical'
	| 'stack-horizontal'
	| 'stack-vertical'
	| 'send-to-back'
	| 'send-backward'
	| 'bring-forward'
	| 'bring-to-front'

export interface TopMenuGridActionSnapshot {
	id: TopMenuGridActionId
	label: string
	glyph: string
	disabled: boolean
}

export interface TopMenuPageSnapshot {
	id: TLPageId
	name: string
	isCurrent: boolean
	canDuplicate: boolean
	canDelete: boolean
	canMoveUp: boolean
	canMoveDown: boolean
}

const ACTION_GRID_GROUPS: readonly (readonly TopMenuGridActionId[])[] = [
	['align-left', 'align-center-horizontal', 'align-right', 'stretch-horizontal'],
	['align-top', 'align-center-vertical', 'align-bottom', 'stretch-vertical'],
	['distribute-horizontal', 'distribute-vertical', 'stack-horizontal', 'stack-vertical'],
	['send-to-back', 'send-backward', 'bring-forward', 'bring-to-front'],
]

const ACTION_GLYPH_CODES: Record<TopMenuGridActionId, number> = {
	'align-left': 0x2190,
	'align-center-horizontal': 0x2194,
	'align-right': 0x2192,
	'stretch-horizontal': 0x21d4,
	'align-top': 0x2191,
	'align-center-vertical': 0x2195,
	'align-bottom': 0x2193,
	'stretch-vertical': 0x21d5,
	'distribute-horizontal': 0x22ef,
	'distribute-vertical': 0x22ee,
	'stack-horizontal': 0x2261,
	'stack-vertical': 0x25a5,
	'send-to-back': 0x21df,
	'send-backward': 0x2193,
	'bring-forward': 0x2191,
	'bring-to-front': 0x21de,
}

export class TopMenuController {
	readonly navigation: NavigationController

	constructor(private readonly editor: Editor) {
		this.navigation = new NavigationController(editor)
	}

	getCurrentPageName() {
		return this.editor.getCurrentPage().name
	}

	getCanUndo() {
		return this.editor.getCanUndo()
	}

	getCanRedo() {
		return this.editor.getCanRedo()
	}

	getHasSelection() {
		return getUnlockedSelectedShapeIds(this.editor).length > 0
	}

	getPages(): TopMenuPageSnapshot[] {
		const pages = this.editor.getPages()
		const currentPageId = this.editor.getCurrentPageId()

		return pages.map((page, index) => ({
			id: page.id,
			name: page.name,
			isCurrent: page.id === currentPageId,
			canDuplicate: pages.length < this.editor.options.maxPages,
			canDelete: pages.length > 1,
			canMoveUp: index > 0,
			canMoveDown: index < pages.length - 1,
		}))
	}

	getGridActionGroups(): TopMenuGridActionSnapshot[][] {
		return ACTION_GRID_GROUPS.map((group) =>
			group.map((id) => ({
				id,
				label: this.getGridActionLabel(id),
				glyph: String.fromCharCode(ACTION_GLYPH_CODES[id]),
				disabled: this.getGridActionDisabled(id),
			}))
		)
	}

	undo() {
		this.editor.undo()
	}

	redo() {
		this.editor.redo()
	}

	duplicateSelection() {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (!ids.length) return
		const offset = getDuplicateSelectionOffset(this.editor, this.editor.getSelectionPageBounds())
		this.editor.markHistoryStoppingPoint('duplicate shapes')
		this.editor.duplicateShapes(ids, offset)
	}

	deleteSelection() {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (!ids.length) return
		this.editor.markHistoryStoppingPoint('delete shapes')
		this.editor.deleteShapes(ids)
	}

	selectAll() {
		this.editor.markHistoryStoppingPoint('select all')
		this.editor.selectAll()
	}

	createPage(name?: string) {
		if (this.editor.getPages().length >= this.editor.options.maxPages) return
		const id = PageRecordType.createId()
		this.editor.markHistoryStoppingPoint('creating page')
		this.editor.createPage({
			id,
			name: name?.trim() || 'Page 1',
		})
		this.editor.setCurrentPage(id)
	}

	switchPage(id: TLPageId) {
		if (id === this.editor.getCurrentPageId()) return
		this.editor.setCurrentPage(id)
	}

	renamePage(id: TLPageId, name: string) {
		this.editor.markHistoryStoppingPoint('renaming page')
		this.editor.renamePage(id, name.trim() || 'Page 1')
	}

	duplicatePage(id: TLPageId) {
		if (this.editor.getPages().length >= this.editor.options.maxPages) return
		this.editor.markHistoryStoppingPoint('duplicating page')
		this.editor.duplicatePage(id)
	}

	deletePage(id: TLPageId) {
		if (this.editor.getPages().length <= 1) return
		this.editor.markHistoryStoppingPoint('deleting page')
		this.editor.deletePage(id)
	}

	movePage(id: TLPageId, direction: -1 | 1) {
		const pages = this.editor.getPages()
		const from = pages.findIndex((page) => page.id === id)
		const to = from + direction
		if (from < 0 || to < 0 || to >= pages.length) return
		if (from === to) return

		let index
		const below = from > to ? pages[to - 1] : pages[to]
		const above = from > to ? pages[to] : pages[to + 1]

		if (below && !above) {
			index = getIndexAbove(below.index)
		} else if (!below && above) {
			index = getIndexBelow(pages[0].index)
		} else {
			index = getIndexBetween(below.index, above.index)
		}

		if (index !== pages[from].index) {
			this.editor.markHistoryStoppingPoint('moving page')
			this.editor.updatePage({ id, index })
		}
	}

	align(operation: 'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom') {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (ids.length < 2) return
		this.editor.alignShapes(ids, operation)
	}

	distribute(operation: 'horizontal' | 'vertical') {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (ids.length < 3) return
		this.editor.distributeShapes(ids, operation)
	}

	stack(operation: 'horizontal' | 'vertical') {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (ids.length < 3) return
		this.editor.stackShapes(ids, operation)
	}

	stretch(operation: 'horizontal' | 'vertical') {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (ids.length < 2) return
		this.editor.stretchShapes(ids, operation)
	}

	reorder(operation: 'send-to-back' | 'send-backward' | 'bring-forward' | 'bring-to-front') {
		const ids = getUnlockedSelectedShapeIds(this.editor)
		if (!ids.length) return

		switch (operation) {
			case 'send-to-back':
				this.editor.sendToBack(ids)
				break
			case 'send-backward':
				this.editor.sendBackward(ids)
				break
			case 'bring-forward':
				this.editor.bringForward(ids)
				break
			case 'bring-to-front':
				this.editor.bringToFront(ids)
				break
		}
	}

	runGridAction(actionId: TopMenuGridActionId) {
		switch (actionId) {
			case 'align-left':
				this.align('left')
				break
			case 'align-center-horizontal':
				this.align('center-horizontal')
				break
			case 'align-right':
				this.align('right')
				break
			case 'stretch-horizontal':
				this.stretch('horizontal')
				break
			case 'align-top':
				this.align('top')
				break
			case 'align-center-vertical':
				this.align('center-vertical')
				break
			case 'align-bottom':
				this.align('bottom')
				break
			case 'stretch-vertical':
				this.stretch('vertical')
				break
			case 'distribute-horizontal':
				this.distribute('horizontal')
				break
			case 'distribute-vertical':
				this.distribute('vertical')
				break
			case 'stack-horizontal':
				this.stack('horizontal')
				break
			case 'stack-vertical':
				this.stack('vertical')
				break
			case 'send-to-back':
			case 'send-backward':
			case 'bring-forward':
			case 'bring-to-front':
				this.reorder(actionId)
				break
		}
	}

	private getGridActionLabel(actionId: TopMenuGridActionId) {
		switch (actionId) {
			case 'align-left':
				return 'Align left'
			case 'align-center-horizontal':
				return 'Align center horizontally'
			case 'align-right':
				return 'Align right'
			case 'stretch-horizontal':
				return 'Stretch horizontally'
			case 'align-top':
				return 'Align top'
			case 'align-center-vertical':
				return 'Align center vertically'
			case 'align-bottom':
				return 'Align bottom'
			case 'stretch-vertical':
				return 'Stretch vertically'
			case 'distribute-horizontal':
				return 'Distribute horizontally'
			case 'distribute-vertical':
				return 'Distribute vertically'
			case 'stack-horizontal':
				return 'Stack horizontally'
			case 'stack-vertical':
				return 'Stack vertically'
			case 'send-to-back':
				return 'Send to back'
			case 'send-backward':
				return 'Send backward'
			case 'bring-forward':
				return 'Bring forward'
			case 'bring-to-front':
				return 'Bring to front'
		}
	}

	private getGridActionDisabled(actionId: TopMenuGridActionId) {
		const selectedCount = getUnlockedSelectedShapeIds(this.editor).length

		switch (actionId) {
			case 'align-left':
			case 'align-center-horizontal':
			case 'align-right':
			case 'stretch-horizontal':
			case 'align-top':
			case 'align-center-vertical':
			case 'align-bottom':
			case 'stretch-vertical':
				return selectedCount < 2
			case 'distribute-horizontal':
			case 'distribute-vertical':
			case 'stack-horizontal':
			case 'stack-vertical':
				return selectedCount < 3
			case 'send-to-back':
			case 'send-backward':
			case 'bring-forward':
			case 'bring-to-front':
				return selectedCount < 1
		}
	}
}
