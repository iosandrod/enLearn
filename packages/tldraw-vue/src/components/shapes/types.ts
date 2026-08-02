import type { Editor, TLShape } from '@tldraw/editor'

export interface VueShapeNodeProps<Shape extends TLShape = TLShape> {
	editor: Editor
	shape: Shape
	selected: boolean
	zoom: number
	pageTransform: string
}
