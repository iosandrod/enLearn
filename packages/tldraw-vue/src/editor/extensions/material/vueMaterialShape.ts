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
import {
	createVueMaterialSectionSvg,
	createVueMaterialSvg,
} from '../../vueSvgExport'
import { baseProps, type BaseProps } from '../../shapeProps/base'
import { vueMaterialPropertyRegistry } from '../../shapeProps/vueMaterial'
import { vueMaterialSectionPropertyRegistry } from '../../shapeProps/vueMaterialSection'
import {
	vueFrameDefaultProps,
	vueMaterialDefaultProps,
	vueMaterialDefaultSize,
	vueMaterialRowDefaults,
} from '../../defaults'
import type { VueFrameShape } from '../frame/vueFrameShape'
import type { PrintDataSourceDetailColumn } from '@/print/types'
import { getEditorPrintDataSource } from '../../workspaceDataSource'
import { getMaterialColumns } from '../../materialColumnOperations'

export type VueMaterialSectionZone =
	| 'pageHeader'
	| 'tableHeader'
	| 'tableBody'
	| 'tableFooter'
	| 'pageFooter'

export type VueMaterialVisibilityKey =
	| 'showPageHeader'
	| 'showTableHeader'
	| 'showTableFooter'
	| 'showPageFooter'

const VISIBILITY_KEY_BY_ZONE: Partial<Record<VueMaterialSectionZone, VueMaterialVisibilityKey>> = {
	pageHeader: 'showPageHeader',
	tableHeader: 'showTableHeader',
	tableFooter: 'showTableFooter',
	pageFooter: 'showPageFooter',
}

const FIXED_MATERIAL_SECTION_ZONES = new Set<VueMaterialSectionZone>([
	'pageHeader',
	'tableHeader',
	'tableFooter',
	'pageFooter',
])

const MATERIAL_CONTAINER_FRAME_META_KEY = '__materialContainerListFrame'

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
	BaseProps & {
		name: string
		dataSourceField: string
		columns?: PrintDataSourceDetailColumn[]
		headerRowHeight?: number
		bodyRowHeight?: number
		footerRowHeight?: number
		containerList?: boolean
	}
>

export type VueMaterialSectionShape = TLBaseShape<
	'vue-material-section',
	BaseProps & {
		zone: VueMaterialSectionZone
		label: string,
		containerList?: boolean
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

	static override props = vueMaterialPropertyRegistry.validators

	override getDefaultProps(): VueMaterialShape['props'] {
		return {
			...baseProps.defaults,
			w: vueMaterialDefaultSize.w,
			h: getVueMaterialDefaultHeight(),
			...vueMaterialDefaultProps,
			...vueMaterialRowDefaults,
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

	override onBeforeUpdate(prev: VueMaterialShape, next: VueMaterialShape) {
		const fieldChanged = prev.props.dataSourceField !== next.props.dataSourceField
		// A different detail field starts with its own columns. Other node edits
		// retain the template's column configuration.
		if (fieldChanged && next.props.columns === prev.props.columns) {
			const columns = getMaterialColumns(getEditorPrintDataSource(this.editor).value, next.props.dataSourceField)
			next = { ...next, props: { ...next.props, columns: columns.length ? JSON.parse(JSON.stringify(columns)) : undefined } }
		}
		const minHeight = getVueMaterialMinHeight()
		const w = Math.max(VUE_MATERIAL_MIN_WIDTH, next.props.w)
		const h = Math.max(minHeight, next.props.h)
		if (approximatelyEqual(w, next.props.w) && approximatelyEqual(h, next.props.h)) {
			return fieldChanged ? next : undefined
		}

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

	static override props = vueMaterialSectionPropertyRegistry.validators

	override getDefaultProps(): VueMaterialSectionShape['props'] {
		const definition = VUE_MATERIAL_SECTION_DEFINITIONS[0]
		return {
			...baseProps.defaults,
			w: vueMaterialDefaultSize.w,
			h: definition.defaultHeight,
			zone: definition.zone,
			label: definition.label,
		}
	}

	override component() {
		return null
	}

	override toSvg(shape: VueMaterialSectionShape) {
		const parent = this.editor.getShape(shape.parentId)
		return createVueMaterialSectionSvg({
			...shape,
			props: {
				...shape.props,
				containerList: isVueMaterialShape(parent) && parent.props.containerList === true,
				showBorder: isVueMaterialShape(parent) ? parent.props.showBorder : undefined,
			},
		})
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
		if (!canVueMaterialSectionReceiveChildren(shape, this.editor)) return false
		if (type === 'vue-frame') {
			const parent = getVueMaterialParent(this.editor, shape)
			return shape.props.zone === 'tableBody' && parent?.props.containerList === true
		}
		return !isVueMaterialInternalShapeType(type)
	}

	override canRemoveChildrenOfType() {
		return false
	}

	override shouldClipChild() {
		return false
	}

	override onBeforeUpdate(_prev: VueMaterialSectionShape, next: VueMaterialSectionShape) {
		const parent = getVueMaterialParent(this.editor, next)
		const definition = getVueMaterialSectionDefinition(next.props.zone)
		const isHidden = parent ? !isVueMaterialSectionVisible(this.editor, next) : false
		const h = isHidden || next.props.zone === 'tableBody'
			? Math.max(0, next.props.h)
			: Math.max(definition.minHeight, next.props.h)
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
			meta: {
				showPageHeader: true,
				showTableHeader: true,
				showTableFooter: true,
				showPageFooter: true,
			},
			props: {
				w,
				h,
				...vueMaterialDefaultProps,
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
	const h = Math.max(rect.h, getVueMaterialMinHeight())

	editor.updateShape<VueMaterialShape>({
		id: material.id,
		type: 'vue-material',
		x: rect.x,
		y: rect.y,
		props: { w, h },
	})
	normalizeVueMaterialSections(editor, material.id, { fitToMaterialHeight: true })
}

export function normalizeVueMaterialSections(
	editor: Editor,
	materialId: TLShapeId,
	_options: { fitToMaterialHeight?: boolean } = {}
) {
	const material = editor.getShape<VueMaterialShape>(materialId)
	if (!isVueMaterialShape(material)) return

	const sectionsByZone = getVueMaterialSectionsByZone(editor, material.id)
	const materialMeta = (material.meta as Record<string, unknown> | undefined) ?? {}
	const cachedHeights = getVueMaterialCachedSectionHeights(material)
	const targetWidth = Math.max(VUE_MATERIAL_MIN_WIDTH, material.props.w)
	const nextCachedHeights = { ...cachedHeights }
	delete nextCachedHeights.tableBody
	const heightsByZone = new Map<VueMaterialSectionZone, number>()

	for (const definition of VUE_MATERIAL_SECTION_DEFINITIONS) {
		if (!FIXED_MATERIAL_SECTION_ZONES.has(definition.zone)) continue

		const section = sectionsByZone.get(definition.zone)
		const cached = Number(cachedHeights[definition.zone])
		const configuredHeight = section?.props.h && section.props.h > 0
			? section.props.h
			: Number.isFinite(cached) && cached > 0 ? cached : definition.defaultHeight
		nextCachedHeights[definition.zone] = configuredHeight

		const visibilityKey = VISIBILITY_KEY_BY_ZONE[definition.zone]
		const visible = !visibilityKey || materialMeta[visibilityKey] !== false
		heightsByZone.set(
			definition.zone,
			visible ? Math.max(definition.minHeight, configuredHeight) : 0
		)
	}

	const fixedHeight = sum([...heightsByZone.values()])
	heightsByZone.set('tableBody', Math.max(0, material.props.h - fixedHeight))

	let y = 0
	const changes: TLShapePartial[] = []
	const missingSections: TLShapePartial<VueMaterialSectionShape>[] = []

	for (const definition of VUE_MATERIAL_SECTION_DEFINITIONS) {
		const section = sectionsByZone.get(definition.zone)
		const h = heightsByZone.get(definition.zone) ?? 0

		if (!section) {
			missingSections.push({
				id: createShapeId(),
				type: 'vue-material-section',
				parentId: material.id,
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

	runWithVueMaterialPrintLayoutUpdates(() => {
		if (!approximatelyEqual(material.props.w, targetWidth)) {
			editor.updateShape<VueMaterialShape>({
				id: material.id,
				type: 'vue-material',
				props: { w: targetWidth },
			})
		}
		if (JSON.stringify(nextCachedHeights) !== JSON.stringify(cachedHeights)) {
			editor.updateShape({
				id: material.id,
				type: 'vue-material',
				meta: { ...materialMeta, __materialSectionHeights: nextCachedHeights },
			} as TLShapePartial)
		}
		if (missingSections.length > 0) {
			editor.createShapes<VueMaterialSectionShape>(missingSections)
		}
		if (changes.length > 0) {
			editor.updateShapes(changes)
		}
		syncVueMaterialContainerFrame(editor, material)
	})
}

export function getVueMaterialContainerFrame(
	editor: Editor,
	tableBodyId: TLShapeId,
): VueFrameShape | undefined {
	return editor
		.getSortedChildIdsForParent(tableBodyId)
		.map((id) => editor.getShape<VueFrameShape>(id))
		.find((shape): shape is VueFrameShape => shape?.type === 'vue-frame')
}

function syncVueMaterialContainerFrame(editor: Editor, material: VueMaterialShape) {
	const tableBody = getVueMaterialSections(editor, material.id)
		.find((section) => section.props.zone === 'tableBody')
	if (!tableBody) return

	const frame = getVueMaterialContainerFrame(editor, tableBody.id)
	const generatedFrame = frame?.meta?.[MATERIAL_CONTAINER_FRAME_META_KEY] === true
	if (material.props.containerList !== true) {
		if (generatedFrame && frame.opacity !== 0) {
			editor.updateShape({ id: frame.id, type: 'vue-frame', opacity: 0 } as TLShapePartial)
		}
		return
	}

	if (frame) {
		if (generatedFrame && frame.opacity === 0) {
			editor.updateShape({ id: frame.id, type: 'vue-frame', opacity: 1 } as TLShapePartial)
		}
		return
	}

	const inset = 12
	const frameWidth = Math.max(80, Math.min(vueFrameDefaultProps.w, tableBody.props.w - inset * 2))
	const frameHeight = Math.max(72, Math.min(vueFrameDefaultProps.h, tableBody.props.h - inset * 2))
	editor.createShapes<VueFrameShape>([{
		id: createShapeId(),
		type: 'vue-frame',
		parentId: tableBody.id,
		x: inset,
		y: inset,
		props: {
			...baseProps.defaults,
			...vueFrameDefaultProps,
			w: frameWidth,
			h: frameHeight,
			name: '',
			showBorder: true,//
		},
		meta: { [MATERIAL_CONTAINER_FRAME_META_KEY]: true },
	}])
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

export function getVueMaterialSectionHeightModel(editor: Editor, materialId: TLShapeId) {
	const material = editor.getShape<VueMaterialShape>(materialId)
	if (!isVueMaterialShape(material)) return {}

	const cachedHeights = getVueMaterialCachedSectionHeights(material)
	const sectionsByZone = getVueMaterialSectionsByZone(editor, material.id)
	return Object.fromEntries(
		VUE_MATERIAL_SECTION_DEFINITIONS
			.filter((definition) => FIXED_MATERIAL_SECTION_ZONES.has(definition.zone))
			.map((definition) => {
				const sectionHeight = sectionsByZone.get(definition.zone)?.props.h ?? 0
				const cachedHeight = Number(cachedHeights[definition.zone])
				const height = sectionHeight > 0
					? sectionHeight
					: Number.isFinite(cachedHeight) && cachedHeight > 0
						? cachedHeight
						: definition.defaultHeight
				return [definition.zone + 'Height', height]
			})
	)
}

export function canVueMaterialSectionReceiveChildren(section: VueMaterialSectionShape, editor?: Editor) {
	if (section.props.zone === 'tableBody' && editor) {
		const parent = editor.getShape(section.parentId)
		return isVueMaterialShape(parent) && parent.props.containerList === true
	}
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

export function isVueMaterialSectionVisible(
	editor: Editor,
	section: VueMaterialSectionShape
) {
	const parent = editor.getShape(section.parentId)
	if (!isVueMaterialShape(parent)) return true

	const key = VISIBILITY_KEY_BY_ZONE[section.props.zone]
	if (!key) return true
	return (parent.meta as Record<string, unknown> | undefined)?.[key] !== false
}

export function getVueMaterialVisibilityModel(shape: VueMaterialShape) {
	const meta = (shape.meta as Record<string, unknown> | undefined) ?? {}
	return {
		showPageHeader: meta.showPageHeader !== false,
		showTableHeader: meta.showTableHeader !== false,
		showTableFooter: meta.showTableFooter !== false,
		showPageFooter: meta.showPageFooter !== false,
	}
}

export function getVueMaterialHiddenShapeIds(
	editor: Editor,
	shapeIds: readonly TLShapeId[]
) {
	const hiddenShapeIds = new Set<TLShapeId>()
	const shapeAndDescendantIds = editor.getShapeAndDescendantIds([...shapeIds])

	for (const shapeId of shapeAndDescendantIds) {
		const shape = editor.getShape(shapeId)
		if (!isVueMaterialSectionShape(shape) || isVueMaterialSectionVisible(editor, shape)) continue

		for (const descendantId of editor.getShapeAndDescendantIds([shape.id])) {
			hiddenShapeIds.add(descendantId)
		}
	}

	for (const shapeId of shapeAndDescendantIds) {
		const material = editor.getShape<VueMaterialShape>(shapeId)
		if (!isVueMaterialShape(material) || material.props.containerList !== true) continue
		const tableBody = getVueMaterialSections(editor, material.id)
			.find((section) => section.props.zone === 'tableBody')
		const frame = tableBody ? getVueMaterialContainerFrame(editor, tableBody.id) : undefined
		if (!frame) continue
		for (const descendantId of editor.getShapeAndDescendantIds([frame.id])) {
			hiddenShapeIds.add(descendantId)
		}
	}

	return [...hiddenShapeIds]
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

function getVueMaterialCachedSectionHeights(material: VueMaterialShape) {
	const meta = (material.meta as Record<string, unknown> | undefined) ?? {}
	return meta.__materialSectionHeights && typeof meta.__materialSectionHeights === 'object'
		? meta.__materialSectionHeights as Record<string, unknown>
		: {}
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
		if (!canVueMaterialSectionReceiveChildren(section, editor)) continue
		if (
			isVueMaterialInternalShapeType(childType) &&
			!(childType === 'vue-frame' && section.props.zone === 'tableBody')
		) continue
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
