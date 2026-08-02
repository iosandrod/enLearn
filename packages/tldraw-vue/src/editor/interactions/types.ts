import { Vec, type Editor, type TLCamera, type TLShape, type TLShapeId, type VecLike } from '@tldraw/editor'
import type { SelectionCorner, SelectionEdge } from '@tldraw/editor'
import type { WorkspaceGuide } from './guides'
import type { WorkspaceBoundsManager } from './WorkspaceBoundsManager'

export type BuiltInCanvasTool =
	| 'select'
	| 'hand'
	| 'draw'
	| 'eraser'
	| 'arrow'
	| 'text'
	| 'note'
	| 'asset'
	| 'qr'
	| 'highlight'
	| 'line'
	| 'laser'
	| 'frame'
	| 'material'
	| 'table'
	| 'geo'

export type CanvasTool = BuiltInCanvasTool | (string & {})
export type VueGeoShape =
	| 'rectangle'
	| 'ellipse'
	| 'triangle'
	| 'diamond'
	| 'hexagon'
	| 'oval'
	| 'rhombus'
	| 'star'
	| 'cloud'
	| 'heart'
	| 'x-box'
	| 'check-box'
	| 'arrow-left'
	| 'arrow-up'
	| 'arrow-down'
	| 'arrow-right'
export type ResizeHandle = SelectionCorner | SelectionEdge

export type ClientPoint = {
	clientX: number
	clientY: number
}

export interface VueEditorHost {
	editor: Editor
	getActiveTool(): CanvasTool
	getCurrentGeoShape(): VueGeoShape
	getCamera(): TLCamera
	getContainer(): HTMLElement | null
	getCurrentPageShapes(): TLShape[]
	getGuides(): readonly WorkspaceGuide[]
	setActiveTool(tool: CanvasTool, geoShape?: VueGeoShape): void
	workspaceBounds: WorkspaceBoundsManager
}

export interface VueEditorContext extends VueEditorHost {
	capturePointer(event: PointerEvent): void
	findShapeAt(point: VecLike): TLShape | undefined
	getCanvasPoint(event: ClientPoint): Vec
	getCurrentGeoShape(): VueGeoShape
	getPagePoint(event: ClientPoint): Vec
	getScreenPoint(event: ClientPoint): Vec
	setCamera(point: VecLike): void
	setSelectedShapes(ids: TLShapeId[]): void
	shouldSnap(event: MouseEvent | PointerEvent | KeyboardEvent): boolean
	transitionTo(state: VueInteractionState): void
	updateViewport(center?: boolean): void
}

export abstract class VueInteractionState {
	abstract readonly id: string
	protected readonly editor: Editor

	constructor(protected readonly context: VueEditorContext) {
		this.editor = context.editor
	}

	onEnter(): void {
		return
	}

	onExit(): void {
		return
	}

	onPointerMove(_event: PointerEvent): void {
		return
	}

	onPointerUp(_event: PointerEvent): void {
		return
	}

	onKeyDown(_event: KeyboardEvent): void {
		return
	}

	onKeyUp(_event: KeyboardEvent): void {
		return
	}

	onCancel(): void {
		this.context.transitionTo(new IdleState(this.context))
	}

	protected transitionTo(state: VueInteractionState) {
		this.context.transitionTo(state)
	}
}

export class IdleState extends VueInteractionState {
	readonly id = 'idle'
}
