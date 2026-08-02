import { Vec, type Editor, type TLShapeId, type VecLike } from '@tldraw/editor'
import type { VueArrowShape, VueLineShape, VuePoint } from '../vueDefaultShapes'

export function getLineGeometry(start: VecLike, end: VecLike) {
	const x = Math.min(start.x, end.x)
	const y = Math.min(start.y, end.y)
	const w = Math.max(1, Math.abs(end.x - start.x))
	const h = Math.max(1, Math.abs(end.y - start.y))
	const relativeStart: VuePoint = {
		x: start.x - x,
		y: start.y - y,
	}
	const relativeEnd: VuePoint = {
		x: end.x - x,
		y: end.y - y,
	}

	return {
		x,
		y,
		props: {
			w,
			h,
			start: relativeStart,
			end: relativeEnd,
		},
	}
}

export function getVueArrowPageTerminalPoint(shape: VueArrowShape | VueLineShape, terminal: 'start' | 'end') {
	const point = terminal === 'start' ? shape.props.start : shape.props.end
	return new Vec(shape.x + point.x, shape.y + point.y)
}

export function updateVueArrowFromPageTerminals(
	editor: Editor,
	arrowId: TLShapeId,
	startPagePoint: VecLike,
	endPagePoint: VecLike
) {
	const arrow = editor.getShape<VueArrowShape>(arrowId)
	if (!arrow || arrow.type !== 'vue-arrow') return

	const geometry = getLineGeometry(startPagePoint, endPagePoint)
	editor.updateShape<VueArrowShape>({
		id: arrow.id,
		type: 'vue-arrow',
		x: geometry.x,
		y: geometry.y,
		props: geometry.props,
	})
}
