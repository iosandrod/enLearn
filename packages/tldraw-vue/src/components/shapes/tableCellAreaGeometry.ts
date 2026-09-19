export interface CellAreaRect {
	left: number
	top: number
	right: number
	bottom: number
	width: number
	height: number
}

export interface CellAreaGeometry {
	left: number
	top: number
	width: number
	height: number
}

export interface CellAreaGeometryInput {
	rootRect: CellAreaRect
	rootOffsetWidth: number
	rootOffsetHeight: number
	rootScrollLeft: number
	rootScrollTop: number
	startRect: CellAreaRect
	endRect: CellAreaRect
}

export function getLocalCellAreaGeometry(input: CellAreaGeometryInput): CellAreaGeometry | null {
	const scaleX = input.rootOffsetWidth > 0 ? input.rootRect.width / input.rootOffsetWidth : 0
	const scaleY = input.rootOffsetHeight > 0 ? input.rootRect.height / input.rootOffsetHeight : 0
	if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
		return null
	}

	const startLeft = (input.startRect.left - input.rootRect.left) / scaleX + input.rootScrollLeft
	const startTop = (input.startRect.top - input.rootRect.top) / scaleY + input.rootScrollTop
	const startRight = (input.startRect.right - input.rootRect.left) / scaleX + input.rootScrollLeft
	const startBottom = (input.startRect.bottom - input.rootRect.top) / scaleY + input.rootScrollTop
	const endLeft = (input.endRect.left - input.rootRect.left) / scaleX + input.rootScrollLeft
	const endTop = (input.endRect.top - input.rootRect.top) / scaleY + input.rootScrollTop
	const endRight = (input.endRect.right - input.rootRect.left) / scaleX + input.rootScrollLeft
	const endBottom = (input.endRect.bottom - input.rootRect.top) / scaleY + input.rootScrollTop

	const left = Math.max(0, Math.min(startLeft, endLeft))
	const top = Math.max(0, Math.min(startTop, endTop))
	const right = Math.max(startRight, endRight)
	const bottom = Math.max(startBottom, endBottom)

	return {
		left,
		top,
		width: Math.max(0, right - left),
		height: Math.max(0, bottom - top),
	}
}
