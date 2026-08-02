// Vue uses the editor's framework-agnostic core without loading the React UI entrypoint.
export * from '@tldraw/state'
export * from '@tldraw/store'
export * from '@tldraw/tlschema'
export * from '@tldraw/utils'
export * from '@tldraw/validate'

export {
	createTLStore,
	type TLStoreBaseOptions,
	type TLStoreEventInfo,
	type TLStoreOptions,
	type TLStoreSchemaOptions,
} from './lib/config/createTLStore'
export { DEFAULT_ANIMATION_OPTIONS, DEFAULT_CAMERA_OPTIONS, SIDES } from './lib/constants'
export { Editor, type TLEditorOptions, type TLEditorRunOptions } from './lib/editor/Editor'
export {
	BaseBoxShapeUtil,
	type TLBaseBoxShape,
} from './lib/editor/shapes/BaseBoxShapeUtil'
export { GroupShapeUtil } from './lib/editor/shapes/group/GroupShapeUtil'
export {
	BindingUtil,
	type BindingOnChangeOptions,
	type BindingOnCreateOptions,
	type BindingOnDeleteOptions,
	type BindingOnShapeChangeOptions,
	type BindingOnShapeDeleteOptions,
	type BindingOnShapeIsolateOptions,
	type TLBindingUtilConstructor,
} from './lib/editor/bindings/BindingUtil'
export {
	ShapeUtil,
	type TLGeometryOpts,
	type TLResizeInfo,
	type TLShapeUtilConstructor,
} from './lib/editor/shapes/ShapeUtil'
export {
	BoundsSnaps,
	type BoundsSnapGeometry,
	type BoundsSnapPoint,
} from './lib/editor/managers/SnapManager/BoundsSnaps'
export { getColorValue } from './lib/editor/managers/ThemeManager/defaultThemes'
export {
	SnapManager,
	type GapsSnapIndicator,
	type PointsSnapIndicator,
	type SnapData,
	type SnapIndicator,
} from './lib/editor/managers/SnapManager/SnapManager'
export { resizeBox, type ResizeBoxOptions } from './lib/editor/shapes/shared/resizeBox'
export { resizeScaled } from './lib/editor/shapes/shared/resizeScaled'
export { StateNode, type TLStateNodeConstructor } from './lib/editor/tools/StateNode'
export { type TLContent } from './lib/editor/types/clipboard-types'
export {
	type TLResizeHandle,
	type TLSelectionHandle,
} from './lib/editor/types/selection-types'
export {
	type SvgExportContext,
	type SvgExportDef,
	type SvgExportRenderable,
} from './lib/editor/types/SvgExportContext'
export {
	SVG_EXPORT_FRAGMENT,
	isSvgExportNode,
	svgExportElement,
	svgExportFragment,
	type SvgExportChild,
	type SvgExportElementNode,
	type SvgExportFragmentNode,
	type SvgExportNode,
	type SvgExportPrimitive,
	type SvgExportProps,
	type SvgExportStyle,
} from './lib/editor/types/SvgExportNode'
export {
	Box,
	ROTATE_CORNER_TO_SELECTION_CORNER,
	rotateSelectionHandle,
	type BoxLike,
	type RotateCorner,
	type SelectionCorner,
	type SelectionEdge,
	type SelectionHandle,
} from './lib/primitives/Box'
export { Mat, type MatLike, type MatModel } from './lib/primitives/Mat'
export { Vec, type VecLike } from './lib/primitives/Vec'
export {
	Geometry2d,
	Geometry2dFilters,
	type Geometry2dOptions,
} from './lib/primitives/geometry/Geometry2d'
export { Group2d } from './lib/primitives/geometry/Group2d'
export { Rectangle2d } from './lib/primitives/geometry/Rectangle2d'
export {
	intersectCircleCircle,
	intersectCirclePolygon,
	intersectCirclePolyline,
	intersectLineSegmentCircle,
	intersectLineSegmentLineSegment,
	intersectLineSegmentPolygon,
	intersectLineSegmentPolyline,
	intersectPolygonBounds,
	intersectPolygonPolygon,
	linesIntersect,
	polygonIntersectsPolyline,
	polygonsIntersect,
} from './lib/primitives/intersect'
export {
	HALF_PI,
	PI,
	PI2,
	approximately,
	areAnglesCompatible,
	clamp,
	clampRadians,
	degreesToRadians,
	pointInPolygon,
	radiansToDegrees,
	rangeIntersection,
	shortAngleDist,
	snapAngle,
	toDomPrecision,
} from './lib/primitives/utils'
export { getDroppedShapesToNewParents, kickoutOccludedShapes } from './lib/utils/reparenting'
export {
	ReadonlySharedStyleMap,
	SharedStyleMap,
	type SharedStyle,
} from './lib/utils/SharedStylesMap'
