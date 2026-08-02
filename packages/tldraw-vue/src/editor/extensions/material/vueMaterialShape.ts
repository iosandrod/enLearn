import {
	BaseBoxShapeUtil,
	Group2d,
	Rectangle2d,
	Vec,
	createShapeId,
	resizeBox,
	type Editor,
	type TLResizeInfo,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
} from '@tldraw/editor'
import { type TLBaseShape } from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import {
	createVueMaterialSectionSvg,
	createVueMaterialSvg,
} from '../../vueSvgExport'

export type VueMaterialSectionZone =
	| 'pageHeader'
	| 'tableHeader'
	| 'tableBody'
	| 'tableFooter'
	| 'pageFooter'

export interface VueMaterialSectionDefinition {
	zone: VueMaterialSectionZone
	label: string
	defaultHeight: number
	minHeight: number
	receivesChildren: boolean
}

export const VUE_MATERIAL_MIN_WIDTH = 280

export const VUE_MATERIAL_SECTION_DEFINITIONS: readonly VueMaterialSectionDefinition[] = [
	{
		zone: 'pageHeader',
		label: '页头',
		defaultHeight: 60,
		minHeight: 36,
		receivesChildren: true,
	},
	{
		zone: 'tableHeader',
		label: '表头',
		defaultHeight: 66,
		minHeight: 40,
		receivesChildren: true,
	},
	{
		zone: 'tableBody',
		label: '表体',
		defaultHeight: 242,
		minHeight: 120,
		receivesChildren: false,
	},
	{
		zone: 'tableFooter',
		label: '表尾',
		defaultHeight: 66,
		minHeight: 40,
		receivesChildren: true,
	},
	{
		zone: 'pageFooter',
		label: '页尾',
		defaultHeight: 66,
		minHeight: 36,
		receivesChildren: true,
	},
]

const SECTION_DEFINITION_BY_ZONE = new Map(
	VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => [definition.zone, definition])
)

const SECTION_ORDER_BY_ZONE = new Map(
	VUE_MATERIAL_SECTION_DEFINITIONS.map((definition, index) => [definition.zone, index])
)

let vueMaterialPrintLayoutUpdateDepth = 0

export function runWithVueMaterialPrintLayoutUpdates<T>(callback: () => T): T {
	vueMaterialPrintLayoutUpdateDepth += 1
	try {
		return callback()
	} finally {
		vueMaterialPrintLayoutUpdateDepth -= 1
	}
}

function isVueMaterialPrintLayoutUpdating() {
	return vueMaterialPrintLayoutUpdateDepth > 0
}

export type VueMaterialShape = TLBaseShape<
	'vue-material',
	{
		w: number
		h: number
		name: string
	}
>

export type VueMaterialSectionShape = TLBaseShape<
	'vue-material-section',
	{
		w: number
		h: number
		zone: VueMaterialSectionZone
		label: string
	}
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-material': VueMaterialShape['props']
		'vue-material-section': VueMaterialSectionShape['props']
	}
}

export class VueMaterialShapeUtil extends BaseBoxShapeUtil<VueMaterialShape> {
	static override type = 'vue-material' as const

	static override props = {
		w: T.number,
		h: T.number,
		name: T.string,
	}

	override getDefaultProps(): VueMaterialShape['props'] {
		return {
			w: 500,
			h: getVueMaterialDefaultHeight(),
			name: '物料节点',
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueMaterialShape) {
		return createVueMaterialSvg(shape)
	}

	override getGeometry(shape: VueMaterialShape) {
		return new Group2d({
			children: [
				new Rectangle2d({
					width: shape.props.w,
					height: shape.props.h,
					isFilled: true,
				}),
			],
		})
	}

	override isFrameLike() {
		return true
	}

	override providesBackgroundForChildren() {
		return true
	}

	override canReceiveNewChildrenOfType(shape: VueMaterialShape, type: TLShape['type']) {
		return !shape.isLocked && type === 'vue-material-section'
	}

	override canRemoveChildrenOfType(_shape: VueMaterialShape, type: TLShape['type']) {
		return type !== 'vue-material-section'
	}

	override canResizeChildren() {
		return false
	}

	override getClipPath(shape: VueMaterialShape) {
		return [
			new Vec(0, 0),
			new Vec(shape.props.w, 0),
			new Vec(shape.props.w, shape.props.h),
			new Vec(0, shape.props.h),
		]
	}

	override shouldClipChild() {
		return true
	}

	override onBeforeUpdate(_prev: VueMaterialShape, next: VueMaterialShape) {
		const minHeight = getVueMaterialMinHeight()
		const w = Math.max(VUE_MATERIAL_MIN_WIDTH, next.props.w)
		const h = Math.max(minHeight, next.props.h)
		if (approximatelyEqual(w, next.props.w) && approximatelyEqual(h, next.props.h)) return

		return {
			...next,
			props: {
				...next.props,
				w,
				h,
			},
		}
	}

	override onResize(shape: VueMaterialShape, info: TLResizeInfo<VueMaterialShape>) {
		return resizeBox(shape, info, {
			minWidth: VUE_MATERIAL_MIN_WIDTH,
			minHeight: getVueMaterialMinHeight(),
		})
	}

	override onResizeEnd(_initial: VueMaterialShape, current: VueMaterialShape) {
		normalizeVueMaterialSections(this.editor, current.id, { fitToMaterialHeight: true })
	}

	override onChildrenChange(shape: VueMaterialShape) {
		if (isVueMaterialPrintLayoutUpdating()) return
		normalizeVueMaterialSections(this.editor, shape.id, { fitToMaterialHeight: true })
	}

	override getIndicatorPath(shape: VueMaterialShape): Path2D {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

export class VueMaterialSectionShapeUtil extends BaseBoxShapeUtil<VueMaterialSectionShape> {
	static override type = 'vue-material-section' as const

	static override props = {
		w: T.number,
		h: T.number,
		zone: T.literalEnum(
			'pageHeader',
			'tableHeader',
			'tableBody',
			'tableFooter',
			'pageFooter'
		),
		label: T.string,
	}

	override getDefaultProps(): VueMaterialSectionShape['props'] {
		const definition = VUE_MATERIAL_SECTION_DEFINITIONS[0]
		return {
			w: 500,
			h: definition.defaultHeight,
			zone: definition.zone,
			label: definition.label,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueMaterialSectionShape) {
		return createVueMaterialSectionSvg(shape)
	}

	override getGeometry(shape: VueMaterialSectionShape) {
		return new Group2d({
			children: [
				new Rectangle2d({
					width: shape.props.w,
					height: shape.props.h,
					isFilled: true,
				}),
			],
		})
	}

	override isFrameLike() {
		return true
	}

	override providesBackgroundForChildren() {
		return true
	}

	override canResizeChildren() {
		return false
	}

	override canTabTo() {
		return false
	}

	override canResize() {
		return false
	}

	override hideResizeHandles() {
		return true
	}

	override hideRotateHandle() {
		return true
	}

	override hideSelectionBoundsBg() {
		return true
	}

	override hideSelectionBoundsFg() {
		return true
	}

	override canReceiveNewChildrenOfType(shape: VueMaterialSectionShape, type: TLShape['type']) {
		if (shape.isLocked) return false
		if (!canVueMaterialSectionReceiveChildren(shape)) return false
		return !isVueMaterialInternalShapeType(type)
	}

	override canRemoveChildrenOfType() {
		return false
	}

	override getClipPath(shape: VueMaterialSectionShape) {
		return [
			new Vec(0, 0),
			new Vec(shape.props.w, 0),
			new Vec(shape.props.w, shape.props.h),
			new Vec(0, shape.props.h),
		]
	}

	override shouldClipChild() {
		return true
	}

	override onBeforeUpdate(_prev: VueMaterialSectionShape, next: VueMaterialSectionShape) {
		const parent = getVueMaterialParent(this.editor, next)
		const definition = getVueMaterialSectionDefinition(next.props.zone)
		const h = Math.max(definition.minHeight, next.props.h)
		const w = parent ? parent.props.w : Math.max(VUE_MATERIAL_MIN_WIDTH, next.props.w)
		const x = parent ? 0 : next.x
		const label = definition.label

		if (
			approximatelyEqual(x, next.x) &&
			approximatelyEqual(w, next.props.w) &&
			approximatelyEqual(h, next.props.h) &&
			label === next.props.label
		) {
			return
		}

		return {
			...next,
			x,
			props: {
				...next.props,
				w,
				h,
				label,
			},
		}
	}

	override onResize(
		shape: VueMaterialSectionShape,
		info: TLResizeInfo<VueMaterialSectionShape>
	) {
		const parent = getVueMaterialParent(this.editor, shape)
		const definition = getVueMaterialSectionDefinition(shape.props.zone)
		const resized = resizeBox(shape, info, {
			minWidth: parent?.props.w ?? VUE_MATERIAL_MIN_WIDTH,
			maxWidth: parent?.props.w ?? Infinity,
			minHeight: definition.minHeight,
		})

		return {
			...resized,
			x: parent ? 0 : resized.x,
			props: {
				...resized.props,
				w: parent?.props.w ?? resized.props.w,
				h: Math.max(definition.minHeight, resized.props.h),
				label: definition.label,
			},
		}
	}

	override onResizeEnd(_initial: VueMaterialSectionShape, current: VueMaterialSectionShape) {
		const parent = getVueMaterialParent(this.editor, current)
		if (!parent) return
		normalizeVueMaterialSections(this.editor, parent.id)
	}

	override onTranslateEnd(_initial: VueMaterialSectionShape, current: VueMaterialSectionShape) {
		const parent = getVueMaterialParent(this.editor, current)
		if (!parent) return
		normalizeVueMaterialSections(this.editor, parent.id)
	}

	override getIndicatorPath(shape: VueMaterialSectionShape): Path2D {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

export function createVueMaterialShapePartials({
	id,
	rect,
	sectionIds,
}: {
	id: TLShapeId
	rect: { x: number; y: number; w: number; h: number }
	sectionIds: readonly TLShapeId[]
}): TLShapePartial<VueMaterialShape | VueMaterialSectionShape>[] {
	const w = Math.max(VUE_MATERIAL_MIN_WIDTH, rect.w)
	const heights = fitVueMaterialSectionHeights(
		Math.max(rect.h, getVueMaterialMinHeight()),
		VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => definition.defaultHeight)
	)
	const h = sum(heights)
	let y = 0

	return [
		{
			id,
			type: 'vue-material',
			x: rect.x,
			y: rect.y,
			props: {
				w,
				h,
				name: '物料节点',
			},
		},
		...VUE_MATERIAL_SECTION_DEFINITIONS.map((definition, index) => {
			const section: TLShapePartial<VueMaterialSectionShape> = {
				id: sectionIds[index] ?? createShapeId(),
				type: 'vue-material-section',
				parentId: id,
				x: 0,
				y,
				props: {
					w,
					h: heights[index],
					zone: definition.zone,
					label: definition.label,
				},
			}
			y += heights[index]
			return section
		}),
	]
}

export function updateVueMaterialShapeLayout(
	editor: Editor,
	materialId: TLShapeId,
	rect: { x: number; y: number; w: number; h: number }
) {
	const material = editor.getShape<VueMaterialShape>(materialId)
	if (!isVueMaterialShape(material)) return

	const w = Math.max(VUE_MATERIAL_MIN_WIDTH, rect.w)
	const heights = fitVueMaterialSectionHeights(
		Math.max(rect.h, getVueMaterialMinHeight()),
		VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => definition.defaultHeight)
	)
	const h = sum(heights)
	let y = 0

	const changes: TLShapePartial[] = [
		{
			id: material.id,
			type: 'vue-material',
			x: rect.x,
			y: rect.y,
			props: { w, h },
		},
	]

	const sectionsByZone = getVueMaterialSectionsByZone(editor, material.id)
	for (const [index, definition] of VUE_MATERIAL_SECTION_DEFINITIONS.entries()) {
		const section = sectionsByZone.get(definition.zone)
		if (section) {
			changes.push({
				id: section.id,
				type: 'vue-material-section',
				x: 0,
				y,
				props: {
					w,
					h: heights[index],
					label: definition.label,
				},
			})
		}
		y += heights[index]
	}

	editor.updateShapes(changes)
}

export function normalizeVueMaterialSections(
	editor: Editor,
	materialId: TLShapeId,
	options: { fitToMaterialHeight?: boolean } = {}
) {
	const material = editor.getShape<VueMaterialShape>(materialId)
	if (!isVueMaterialShape(material)) return

	const sectionsByZone = getVueMaterialSectionsByZone(editor, material.id)
	const targetWidth = Math.max(VUE_MATERIAL_MIN_WIDTH, material.props.w)
	const seedHeights = VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => {
		return sectionsByZone.get(definition.zone)?.props.h ?? definition.defaultHeight
	})
	const targetHeight = options.fitToMaterialHeight
		? Math.max(material.props.h, getVueMaterialMinHeight())
		: undefined
	const heights = options.fitToMaterialHeight
		? fitVueMaterialSectionHeights(targetHeight!, seedHeights)
		: seedHeights.map((height, index) =>
				Math.max(VUE_MATERIAL_SECTION_DEFINITIONS[index].minHeight, height)
			)
	const nextMaterialHeight = options.fitToMaterialHeight ? targetHeight! : sum(heights)

	if (
		!approximatelyEqual(material.props.w, targetWidth) ||
		!approximatelyEqual(material.props.h, nextMaterialHeight)
	) {
		editor.updateShape<VueMaterialShape>({
			id: material.id,
			type: 'vue-material',
			props: {
				w: targetWidth,
				h: nextMaterialHeight,
			},
		})
	}

	const existingMaterial = editor.getShape<VueMaterialShape>(material.id) ?? material
	let y = 0
	const changes: TLShapePartial[] = []
	const missingSections: TLShapePartial<VueMaterialSectionShape>[] = []

	for (const [index, definition] of VUE_MATERIAL_SECTION_DEFINITIONS.entries()) {
		const section = sectionsByZone.get(definition.zone)
		const h = heights[index]

		if (!section) {
			missingSections.push({
				id: createShapeId(),
				type: 'vue-material-section',
				parentId: existingMaterial.id,
				x: 0,
				y,
				props: {
					w: targetWidth,
					h,
					zone: definition.zone,
					label: definition.label,
				},
			})
		} else if (
			!approximatelyEqual(section.x, 0) ||
			!approximatelyEqual(section.y, y) ||
			!approximatelyEqual(section.props.w, targetWidth) ||
			!approximatelyEqual(section.props.h, h) ||
			section.props.label !== definition.label
		) {
			changes.push({
				id: section.id,
				type: 'vue-material-section',
				x: 0,
				y,
				props: {
					w: targetWidth,
					h,
					label: definition.label,
				},
			})
		}

		y += h
	}

	if (missingSections.length > 0) {
		editor.createShapes<VueMaterialSectionShape>(missingSections)
	}
	if (changes.length > 0) {
		editor.updateShapes(changes)
	}
}

export function reparentShapesIntoVueMaterialSections(editor: Editor, materialId: TLShapeId) {
	const material = editor.getShape<VueMaterialShape>(materialId)
	if (!isVueMaterialShape(material)) return

	const sections = getVueMaterialSections(editor, material.id)
	if (!sections.length) return

	const sectionIds = new Set(sections.map((section) => section.id))
	const reparenting = new Map<TLShapeId, TLShapeId[]>()

	for (const siblingShapeId of editor.getSortedChildIdsForParent(material.parentId)) {
		const siblingShape = editor.getShape(siblingShapeId)
		if (!siblingShape) continue
		if (siblingShape.id === material.id) continue
		if (sectionIds.has(siblingShape.id)) continue
		if (siblingShape.isLocked) continue
		if (isVueMaterialInternalShapeType(siblingShape.type)) continue

		const siblingBounds = editor.getShapePageBounds(siblingShape)
		if (!siblingBounds) continue

		const targetSection = getVueMaterialSectionForPageBounds(
			editor,
			sections,
			siblingBounds,
			siblingShape.type
		)
		if (!targetSection) continue

		const childIds = reparenting.get(targetSection.id) ?? []
		childIds.push(siblingShape.id)
		reparenting.set(targetSection.id, childIds)
	}

	if (reparenting.size === 0) return

	editor.run(() => {
		for (const [sectionId, shapeIds] of reparenting) {
			editor.reparentShapes(shapeIds, sectionId)
		}
	})
}

export function getVueMaterialSections(editor: Editor, materialId: TLShapeId) {
	return editor
		.getSortedChildIdsForParent(materialId)
		.map((id) => editor.getShape<VueMaterialSectionShape>(id))
		.filter(isVueMaterialSectionShape)
		.sort(
			(a, b) =>
				(SECTION_ORDER_BY_ZONE.get(a.props.zone) ?? 0) -
				(SECTION_ORDER_BY_ZONE.get(b.props.zone) ?? 0)
		)
}

export function canVueMaterialSectionReceiveChildren(section: VueMaterialSectionShape) {
	return getVueMaterialSectionDefinition(section.props.zone).receivesChildren
}

export function getVueMaterialSectionDefinition(zone: VueMaterialSectionZone) {
	return SECTION_DEFINITION_BY_ZONE.get(zone) ?? VUE_MATERIAL_SECTION_DEFINITIONS[0]
}

export function isVueMaterialShape(shape: TLShape | undefined): shape is VueMaterialShape {
	return shape?.type === 'vue-material'
}

export function isVueMaterialSectionShape(
	shape: TLShape | undefined
): shape is VueMaterialSectionShape {
	return shape?.type === 'vue-material-section'
}

function getVueMaterialSectionsByZone(editor: Editor, materialId: TLShapeId) {
	const sections = getVueMaterialSections(editor, materialId)
	const sectionsByZone = new Map<VueMaterialSectionZone, VueMaterialSectionShape>()

	for (const section of sections) {
		if (!sectionsByZone.has(section.props.zone)) {
			sectionsByZone.set(section.props.zone, section)
		}
	}

	return sectionsByZone
}

function getVueMaterialParent(editor: Editor, shape: VueMaterialSectionShape) {
	const parent = editor.getShape<VueMaterialShape>(shape.parentId)
	return isVueMaterialShape(parent) ? parent : undefined
}

function getVueMaterialSectionForPageBounds(
	editor: Editor,
	sections: readonly VueMaterialSectionShape[],
	pageBounds: NonNullable<ReturnType<Editor['getShapePageBounds']>>,
	childType: TLShape['type']
) {
	for (const section of sections) {
		if (!canVueMaterialSectionReceiveChildren(section)) continue
		if (isVueMaterialInternalShapeType(childType)) continue
		const sectionBounds = editor.getShapePageBounds(section)
		if (sectionBounds?.contains(pageBounds)) return section
	}

	return undefined
}

function isVueMaterialInternalShapeType(type: TLShape['type']) {
	return type === 'vue-material' || type === 'vue-material-section' || type === 'vue-frame'
}

function fitVueMaterialSectionHeights(totalHeight: number, seedHeights: readonly number[]) {
	const minHeights = VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => definition.minHeight)
	const minTotal = sum(minHeights)
	const targetHeight = Math.max(totalHeight, minTotal)
	const clampedSeedHeights = seedHeights.map((height, index) => Math.max(height, minHeights[index]))
	const seedExtras = clampedSeedHeights.map((height, index) => height - minHeights[index])
	const seedExtraTotal = sum(seedExtras)
	const targetExtraTotal = targetHeight - minTotal
	const defaultExtras = VUE_MATERIAL_SECTION_DEFINITIONS.map(
		(definition) => definition.defaultHeight - definition.minHeight
	)
	const defaultExtraTotal = sum(defaultExtras)
	const extraBasis = seedExtraTotal > 0 ? seedExtras : defaultExtras
	const extraBasisTotal = seedExtraTotal > 0 ? seedExtraTotal : defaultExtraTotal
	const heights = minHeights.map((minHeight, index) => {
		if (extraBasisTotal <= 0) return minHeight
		return minHeight + targetExtraTotal * (extraBasis[index] / extraBasisTotal)
	})
	const diff = targetHeight - sum(heights)
	heights[heights.length - 1] += diff
	return heights
}

function getVueMaterialDefaultHeight() {
	return sum(VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => definition.defaultHeight))
}

function getVueMaterialMinHeight() {
	return sum(VUE_MATERIAL_SECTION_DEFINITIONS.map((definition) => definition.minHeight))
}

function sum(values: readonly number[]) {
	return values.reduce((total, value) => total + value, 0)
}

function approximatelyEqual(a: number, b: number) {
	return Math.abs(a - b) < 0.01
}
