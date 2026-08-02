import { Box, type Editor, type TLShapeId } from '@tldraw/editor'

export function getUnlockedSelectedShapeIds(editor: Editor) {
	return editor
		.getSelectedShapes()
		.filter((shape) => !editor.isShapeOrAncestorLocked(shape))
		.map((shape) => shape.id)
}

export function getDuplicateSelectionOffset(editor: Editor, selectionBounds: Box | null) {
	const margin = editor.options.adjacentShapeMargin

	if (!selectionBounds || editor.getCameraOptions().isLocked) {
		return { x: margin, y: margin }
	}

	return {
		x: selectionBounds.w + margin,
		y: 0,
	}
}

export function hasUnlockedSelection(editor: Editor) {
	return getUnlockedSelectedShapeIds(editor).length > 0
}

export function hasSelection(editor: Editor) {
	return editor.getSelectedShapeIds().length > 0
}

export function getSelectionPageBounds(editor: Editor) {
	return editor.getSelectionPageBounds()
}

export function getSelectionShapeIds(editor: Editor): TLShapeId[] {
	return editor.getSelectedShapeIds().slice()
}
