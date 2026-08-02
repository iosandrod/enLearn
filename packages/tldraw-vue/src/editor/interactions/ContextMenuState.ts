import {
	Box,
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	Vec,
	createShapeId,
	isShapeId,
	type Editor,
	type TLContent,
	type TLParentId,
	type TLShape,
	type TLShapeId,
	type VecLike,
} from '@tldraw/editor'
import type { VueTextShape } from '../vueDefaultShapes'
import { measureVueTextShape } from './vueTextSizing'
import { getDuplicateSelectionOffset } from './selectionActions'

export type ContextMenuActionId =
	| 'cut'
	| 'copy'
	| 'paste'
	| 'duplicate'
	| 'delete'
	| 'bring-to-front'
	| 'bring-forward'
	| 'send-backward'
	| 'send-to-back'
	| 'group'
	| 'ungroup'
	| 'expand'
	| 'toggle-lock'
	| 'select-all'

export interface ContextMenuItem {
	id: ContextMenuActionId
	label: string
	disabled: boolean
	shortcut?: string
	destructive?: boolean
	separatorBefore?: boolean
}

export interface ContextMenuSnapshot {
	position: { x: number; y: number }
	pagePoint: { x: number; y: number }
	items: ContextMenuItem[]
	selection: {
		bounds: Box | null
		canGroup: boolean
		canUngroup: boolean
		hasLockedShapes: boolean
		hasShapesOnPage: boolean
		hasUnlockedShapes: boolean
		hasUnlockedSelectedShapes: boolean
		rotation: number
		shapeIds: TLShapeId[]
	}
}

const MENU_WIDTH = 224
const MENU_PADDING = 8
const ITEM_HEIGHT = 34
const SEPARATOR_HEIGHT = 8

const CLIPBOARD_JSON_TYPE = 'application/vnd.tldraw-vue.context-menu+json'

type VueClipboardData =
	| { type: 'content'; content: TLContent }
	| { type: 'text'; text: string; html?: string }

export class ContextMenuState {
	buildSnapshot(editor: Editor, screenPoint: VecLike, pagePoint: VecLike): ContextMenuSnapshot {
		const rawSelectionShapeIds = editor.getSelectedShapeIds().slice()
		const selectedShapes = this.getOutermostSelectedShapes(
			editor,
			editor.getSelectedShapes(),
			rawSelectionShapeIds
		)
		const selectionShapeIds = selectedShapes.map((shape) => shape.id)
		const selectionBounds = editor.getSelectionPageBounds() ?? null
		const selectionRotation = editor.getSelectionRotation()
		const unlockedSelectedShapes = selectedShapes.filter(
			(shape) => !editor.isShapeOrAncestorLocked(shape)
		)
		const hasLockedShapes = selectedShapes.some((shape) => shape.isLocked)
		const hasUnlockedSelectedShapes = selectedShapes.some((shape) => !shape.isLocked)
		const hasUnlockedShapes = unlockedSelectedShapes.length > 0
		const canGroup = unlockedSelectedShapes.length > 1
		const canUngroup = unlockedSelectedShapes.some((shape) => editor.isShapeOfType(shape, 'group'))
		const hasShapesOnPage = editor.getCurrentPageShapeIds().size > 0

		const items = this.buildItems(editor, {
			canGroup,
			canUngroup,
			hasLockedShapes,
			hasShapesOnPage,
			hasUnlockedShapes,
			hasUnlockedSelectedShapes,
			selectionShapeIds,
		})

		return {
			position: this.getMenuPosition(editor, screenPoint, items),
			pagePoint: { x: pagePoint.x, y: pagePoint.y },
			items,
			selection: {
				bounds: selectionBounds,
				canGroup,
				canUngroup,
				hasLockedShapes,
				hasShapesOnPage,
				hasUnlockedShapes,
				hasUnlockedSelectedShapes,
				rotation: selectionRotation,
				shapeIds: selectionShapeIds,
			},
		}
	}

	async executeAction(
		editor: Editor,
		snapshot: ContextMenuSnapshot,
		actionId: ContextMenuActionId
	): Promise<void> {
		switch (actionId) {
			case 'copy': {
				await this.copySelection(editor, snapshot.selection.shapeIds)
				return
			}
			case 'cut': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				editor.markHistoryStoppingPoint('cut')
				const didCopy = await this.copySelection(editor, snapshot.selection.shapeIds)
				if (!didCopy) return
				editor.deleteShapes(snapshot.selection.shapeIds)
				return
			}
			case 'paste': {
				await this.pasteClipboardData(editor, snapshot.pagePoint)
				return
			}
			case 'duplicate': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				const ids = snapshot.selection.shapeIds
				if (ids.length === 0) return
				const offset = this.getDuplicateOffset(editor, snapshot)
				editor.markHistoryStoppingPoint('duplicate shapes')
				editor.duplicateShapes(ids, offset)
				return
			}
			case 'delete': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				if (snapshot.selection.shapeIds.length === 0) return
				editor.markHistoryStoppingPoint('delete shapes')
				editor.deleteShapes(snapshot.selection.shapeIds)
				return
			}
			case 'bring-to-front': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				editor.markHistoryStoppingPoint('bring to front')
				editor.bringToFront(editor.getSelectedShapeIds())
				return
			}
			case 'bring-forward': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				editor.markHistoryStoppingPoint('bring forward')
				editor.bringForward(editor.getSelectedShapeIds())
				return
			}
			case 'send-backward': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				editor.markHistoryStoppingPoint('send backward')
				editor.sendBackward(editor.getSelectedShapeIds())
				return
			}
			case 'send-to-back': {
				if (editor.getIsReadonly() || !snapshot.selection.hasUnlockedShapes) return
				editor.markHistoryStoppingPoint('send to back')
				editor.sendToBack(editor.getSelectedShapeIds())
				return
			}
			case 'group': {
				if (editor.getIsReadonly() || !snapshot.selection.canGroup) return
				editor.markHistoryStoppingPoint('group')
				editor.groupShapes(editor.getSelectedShapeIds())
				return
			}
			case 'ungroup': {
				if (editor.getIsReadonly() || !snapshot.selection.canUngroup) return
				editor.markHistoryStoppingPoint('ungroup')
				editor.ungroupShapes(editor.getSelectedShapeIds())
				return
			}
			case 'expand': {
				const cameraOptions = { animation: { duration: editor.options.animationMediumMs } }
				if (editor.getSelectedShapeIds().length > 0) {
					editor.zoomToSelection(cameraOptions)
				} else {
					editor.zoomToFit(cameraOptions)
				}
				return
			}
			case 'toggle-lock': {
				if (editor.getIsReadonly()) return
				if (snapshot.selection.shapeIds.length === 0) return
				editor.markHistoryStoppingPoint('locking')
				editor.toggleLock(snapshot.selection.shapeIds)
				return
			}
			case 'select-all': {
				editor.markHistoryStoppingPoint('select all')
				editor.selectAll()
				return
			}
		}
	}

	private buildItems(
		editor: Editor,
		info: {
			canGroup: boolean
			canUngroup: boolean
			hasLockedShapes: boolean
			hasShapesOnPage: boolean
			hasUnlockedShapes: boolean
			hasUnlockedSelectedShapes: boolean
			selectionShapeIds: TLShapeId[]
		}
	): ContextMenuItem[] {
		const isReadonly = editor.getIsReadonly()
		const canPaste = this.hasClipboardReadSupport(editor) && !editor.getIsReadonly()
		const hasSelection = info.selectionShapeIds.length > 0
		const canReorder = !isReadonly && info.hasUnlockedShapes
		const lockLabel =
			hasSelection && info.hasLockedShapes && !info.hasUnlockedSelectedShapes ? 'Unlock' : 'Lock'

		const items: ContextMenuItem[] = [
			{
				id: 'cut',
				label: 'Cut',
				shortcut: 'Ctrl+X',
				disabled: isReadonly || !hasSelection || !info.hasUnlockedShapes,
			},
			{
				id: 'copy',
				label: 'Copy',
				shortcut: 'Ctrl+C',
				disabled: !hasSelection,
			},
			{
				id: 'paste',
				label: 'Paste',
				shortcut: 'Ctrl+V',
				disabled: !canPaste,
			},
			{
				id: 'duplicate',
				label: 'Duplicate',
				shortcut: 'Ctrl+D',
				disabled: isReadonly || !hasSelection || !info.hasUnlockedShapes,
			},
			{
				id: 'delete',
				label: 'Delete',
				shortcut: 'Del',
				disabled: isReadonly || !hasSelection || !info.hasUnlockedShapes,
				destructive: true,
			},
		]

		if (canReorder) {
			items.push(
				{
					id: 'bring-to-front',
					label: 'Bring to front',
					shortcut: ']',
					disabled: false,
					separatorBefore: true,
				},
				{
					id: 'bring-forward',
					label: 'Bring forward',
					shortcut: 'Alt+]',
					disabled: false,
				},
				{
					id: 'send-backward',
					label: 'Send backward',
					shortcut: 'Alt+[',
					disabled: false,
				},
				{
					id: 'send-to-back',
					label: 'Send to back',
					shortcut: '[',
					disabled: false,
				}
			)
		}

		items.push(
			{
				id: 'group',
				label: 'Group',
				shortcut: 'Ctrl+G',
				disabled: isReadonly || !info.canGroup,
				separatorBefore: true,
			},
			{
				id: 'ungroup',
				label: 'Ungroup',
				shortcut: 'Ctrl+Shift+G',
				disabled: isReadonly || !info.canUngroup,
			},
			{
				id: 'expand',
				label: 'Expand',
				disabled: !hasSelection && !info.hasShapesOnPage,
			},
			{
				id: 'toggle-lock',
				label: lockLabel,
				shortcut: 'Shift+L',
				disabled: isReadonly || !hasSelection,
			},
			{
				id: 'select-all',
				label: 'Select all',
				shortcut: 'Ctrl+A',
				disabled: !info.hasShapesOnPage,
				separatorBefore: true,
			},
		)

		return items
	}

	private getDuplicateOffset(editor: Editor, snapshot: ContextMenuSnapshot) {
		return getDuplicateSelectionOffset(editor, snapshot.selection.bounds)
	}

	private getOutermostSelectedShapes(
		editor: Editor,
		selectedShapes: TLShape[],
		selectedShapeIds: TLShapeId[]
	) {
		const selectedIdSet = new Set<TLShapeId>(selectedShapeIds)
		return selectedShapes.filter((shape) => {
			let parentId: TLParentId | undefined = shape.parentId
			while (isShapeId(parentId)) {
				if (selectedIdSet.has(parentId)) return false
				parentId = editor.getShape(parentId)?.parentId
			}
			return true
		})
	}

	private async copySelection(editor: Editor, shapeIds: TLShapeId[]) {
		const content = await editor.resolveAssetsInContent(editor.getContentFromCurrentPage(shapeIds))
		const payload = this.stringifyContent(content)
		const win = editor.getContainerWindow()
		const nav = win.navigator
		const html = `<div data-tldraw-vue="${encodeURIComponent(payload)}"></div>`

		if (nav.clipboard?.write && win.ClipboardItem) {
			await nav.clipboard.write([
				new win.ClipboardItem({
					'text/html': new Blob([html], { type: 'text/html' }),
					'text/plain': new Blob([payload], { type: 'text/plain' }),
				}),
			])
			return true
		}

		if (nav.clipboard?.writeText) {
			await nav.clipboard.writeText(payload)
			return true
		}

		return false
	}

	async pasteClipboardData(
		editor: Editor,
		pagePoint: VecLike,
		clipboardData?: DataTransfer | null
	): Promise<boolean> {
		if (editor.getIsReadonly()) return false
		if (!clipboardData && !this.hasClipboardReadSupport(editor)) return false

		const data = await this.readClipboardData(editor, clipboardData)
		if (!data) return false

		editor.markHistoryStoppingPoint('paste')
		if (data.type === 'content') {
			editor.putContentOntoCurrentPage(data.content, {
				point: pagePoint,
				select: true,
			})
			return true
		}

		return this.createTextShapeFromClipboard(editor, data.text, pagePoint)
	}

	private async readClipboardData(
		editor: Editor,
		clipboardData?: DataTransfer | null
	): Promise<VueClipboardData | undefined> {
		const transferData = this.readDataTransferClipboardData(clipboardData)
		if (transferData) return transferData

		const win = editor.getContainerWindow()
		const nav = win.navigator

		if (nav.clipboard?.read) {
			try {
				const items = await nav.clipboard.read()
				let textFallback: VueClipboardData | undefined
				for (const item of items) {
					const orderedTypes = ['text/html', 'text/plain']
					for (const type of orderedTypes) {
						if (!item.types.includes(type)) continue
						const blob = await item.getType(type)
						const text = await blob.text()
						const parsed = this.parseContent(text)
						if (parsed) return { type: 'content', content: parsed }
						const textValue = type === 'text/html' ? this.getTextFromHtml(text) : text
						const normalized = this.normalizePlainText(textValue)
						if (normalized && !textFallback) textFallback = { type: 'text', text: normalized }
					}
				}
				if (textFallback) return textFallback
			} catch {
				// Fall through to readText below.
			}
		}

		if (nav.clipboard?.readText) {
			try {
				const text = await nav.clipboard.readText()
				const parsed = this.parseContent(text)
				if (parsed) return { type: 'content', content: parsed }
				const normalized = this.normalizePlainText(text)
				return normalized ? { type: 'text', text: normalized } : undefined
			} catch {
				return undefined
			}
		}

		return undefined
	}

	private readDataTransferClipboardData(
		clipboardData?: DataTransfer | null
	): VueClipboardData | undefined {
		if (!clipboardData) return undefined

		const html = clipboardData.getData('text/html')
		if (html) {
			const parsed = this.parseContent(html)
			if (parsed) return { type: 'content', content: parsed }
		}

		const text = clipboardData.getData('text/plain')
		if (text) {
			const parsed = this.parseContent(text)
			if (parsed) return { type: 'content', content: parsed }
			const normalized = this.normalizePlainText(text)
			if (normalized) return { type: 'text', text: normalized, html: html || undefined }
		}

		if (html) {
			const normalized = this.normalizePlainText(this.getTextFromHtml(html))
			if (normalized) return { type: 'text', text: normalized, html }
		}

		return undefined
	}

	private parseContent(text: string): TLContent | undefined {
		const trimmed = text.trim()
		if (!trimmed) return undefined

		const jsonText = this.getContentTextFromHtml(trimmed) ?? trimmed

		try {
			const parsed = JSON.parse(jsonText) as unknown
			if (!parsed || typeof parsed !== 'object') return undefined
			if ('schema' in parsed && 'shapes' in parsed && 'rootShapeIds' in parsed) {
				return parsed as TLContent
			}
			if (
				'type' in parsed &&
				parsed.type === CLIPBOARD_JSON_TYPE &&
				'content' in parsed &&
				parsed.content &&
				typeof parsed.content === 'object'
			) {
				const content = parsed.content as TLContent
				if ('schema' in content && 'shapes' in content && 'rootShapeIds' in content) return content
			}
		} catch {
			return undefined
		}

		return undefined
	}

	private stringifyContent(content: TLContent | undefined) {
		return JSON.stringify({
			type: CLIPBOARD_JSON_TYPE,
			content,
		})
	}

	private hasClipboardReadSupport(editor: Editor) {
		const clipboard = editor.getContainerWindow().navigator.clipboard
		return Boolean(clipboard?.read || clipboard?.readText)
	}

	private getContentTextFromHtml(html: string) {
		if (!html.includes('data-tldraw-vue')) return undefined

		if (typeof DOMParser !== 'undefined') {
			const doc = new DOMParser().parseFromString(html, 'text/html')
			const element = doc.querySelector('[data-tldraw-vue]')
			const encodedPayload = element?.getAttribute('data-tldraw-vue')
			if (encodedPayload) {
				try {
					return decodeURIComponent(encodedPayload)
				} catch {
					return encodedPayload
				}
			}
			const legacyPayload = element?.textContent?.trim()
			if (legacyPayload) return legacyPayload
		}

		const attributeMatch = html.match(/data-tldraw-vue=(["'])([\s\S]*?)\1/)
		if (attributeMatch?.[2]) {
			try {
				return decodeURIComponent(attributeMatch[2])
			} catch {
				return attributeMatch[2]
			}
		}

		const legacyMatch = html.match(/<div[^>]*data-tldraw-vue[^>]*>([\s\S]*?)<\/div>/)
		return legacyMatch?.[1]?.trim()
	}

	private getTextFromHtml(html: string) {
		if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ')
		const doc = new DOMParser().parseFromString(html, 'text/html')
		return doc.body.textContent ?? ''
	}

	private normalizePlainText(text: string) {
		const normalized = text.replace(/\r\n?/g, '\n')
		return normalized.trim().length > 0 ? normalized : undefined
	}

	private createTextShapeFromClipboard(editor: Editor, rawText: string, pagePoint: VecLike) {
		const text = this.normalizePlainText(rawText)
		if (!text) return false

		const size = editor.getStyleForNextShape(DefaultSizeStyle)
		const viewportWidth = editor.getViewportPageBounds().width
		const maxWidth = Math.max(240, viewportWidth * 0.85)
		const font = editor.getStyleForNextShape(DefaultFontStyle)
		const sizeInfo = measureVueTextShape(editor, text, {
			font,
			size,
			autoSize: true,
		})
		const boundedSizeInfo =
			sizeInfo.w > maxWidth
				? measureVueTextShape(editor, text, {
						font,
						size,
						width: maxWidth,
						autoSize: false,
					})
				: sizeInfo
		const w = Math.min(maxWidth, Math.max(48, boundedSizeInfo.w))
		const h = Math.max(24, boundedSizeInfo.h)
		const point = this.maybeSnapToGrid(new Vec(pagePoint.x - w / 2, pagePoint.y - h / 2), editor)
		const shapeId = createShapeId()

		editor.createShape<VueTextShape>({
			id: shapeId,
			type: 'vue-text',
			x: point.x,
			y: point.y,
			props: {
				w,
				h,
				text,
				color: editor.getStyleForNextShape(DefaultColorStyle),
				font,
				size,
				autoSize: true,
			},
		})
		editor.select(shapeId)
		return true
	}

	private maybeSnapToGrid(point: Vec, editor: Editor) {
		if (editor.getInstanceState().isGridMode) {
			return point.clone().snapToGrid(editor.getDocumentSettings().gridSize)
		}
		return point.clone()
	}

	private getMenuPosition(editor: Editor, screenPoint: VecLike, items: ContextMenuItem[]) {
		const container = editor.getContainer()
		if (!container) {
			return {
				x: screenPoint.x,
				y: screenPoint.y,
			}
		}

		const bounds = container.getBoundingClientRect()
		const itemCount = items.length
		const separatorCount = items.reduce((count, item) => count + (item.separatorBefore ? 1 : 0), 0)
		const height = MENU_PADDING * 2 + itemCount * ITEM_HEIGHT + separatorCount * SEPARATOR_HEIGHT
		const maxX = Math.max(MENU_PADDING, bounds.width - MENU_WIDTH - MENU_PADDING)
		const maxY = Math.max(MENU_PADDING, bounds.height - height - MENU_PADDING)

		const rawX = screenPoint.x - bounds.left
		const rawY = screenPoint.y - bounds.top

		return {
			x: Math.min(Math.max(rawX, MENU_PADDING), maxX),
			y: Math.min(Math.max(rawY, MENU_PADDING), maxY),
		}
	}
}
