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
import { createVueResumeSectionSvg, createVueResumeSvg } from '../../vueSvgExport'

export type VueResumeSectionZone = 'pageHeader' | 'content' | 'pageFooter'

export interface VueResumeSectionDefinition {
	zone: VueResumeSectionZone
	label: string
	defaultHeight: number
	minHeight: number
	receivesChildren: boolean
}

export const VUE_RESUME_MIN_WIDTH = 360
export const VUE_RESUME_SECTION_DEFINITIONS: readonly VueResumeSectionDefinition[] = [
	{ zone: 'pageHeader', label: '简历页头', defaultHeight: 116, minHeight: 60, receivesChildren: true },
	{ zone: 'content', label: '自动填充内容', defaultHeight: 520, minHeight: 180, receivesChildren: true },
	{ zone: 'pageFooter', label: '简历页尾', defaultHeight: 42, minHeight: 28, receivesChildren: true },
]

const DEFINITION_BY_ZONE = new Map(
	VUE_RESUME_SECTION_DEFINITIONS.map((definition) => [definition.zone, definition])
)
const SECTION_ORDER = new Map(
	VUE_RESUME_SECTION_DEFINITIONS.map((definition, index) => [definition.zone, index])
)

export type VueResumeShape = TLBaseShape<'vue-resume', { w: number; h: number; name: string }>
export type VueResumeSectionShape = TLBaseShape<
	'vue-resume-section',
	{ w: number; h: number; zone: VueResumeSectionZone; label: string }
>

declare module '@tldraw/tlschema' {
	interface TLGlobalShapePropsMap {
		'vue-resume': VueResumeShape['props']
		'vue-resume-section': VueResumeSectionShape['props']
	}
}

export class VueResumeShapeUtil extends BaseBoxShapeUtil<VueResumeShape> {
	static override type = 'vue-resume' as const
	static override props = { w: T.number, h: T.number, name: T.string }

	override getDefaultProps(): VueResumeShape['props'] {
		return { w: 560, h: getVueResumeDefaultHeight(), name: '简历分页组件' }
	}
	override component() { return null }
	override toSvg(shape: VueResumeShape) { return createVueResumeSvg(shape) }
	override getGeometry(shape: VueResumeShape) {
		return new Group2d({ children: [new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })] })
	}
	override isFrameLike() { return true }
	override providesBackgroundForChildren() { return true }
	override canReceiveNewChildrenOfType(shape: VueResumeShape, type: TLShape['type']) {
		return !shape.isLocked && type === 'vue-resume-section'
	}
	override canRemoveChildrenOfType(_shape: VueResumeShape, type: TLShape['type']) {
		return type !== 'vue-resume-section'
	}
	override canResizeChildren() { return false }
	override getClipPath(shape: VueResumeShape) {
		return [new Vec(0, 0), new Vec(shape.props.w, 0), new Vec(shape.props.w, shape.props.h), new Vec(0, shape.props.h)]
	}
	override shouldClipChild() { return true }
	override onBeforeUpdate(_prev: VueResumeShape, next: VueResumeShape) {
		const w = Math.max(VUE_RESUME_MIN_WIDTH, next.props.w)
		const h = Math.max(getVueResumeMinHeight(), next.props.h)
		if (Math.abs(w - next.props.w) < 0.01 && Math.abs(h - next.props.h) < 0.01) return
		return { ...next, props: { ...next.props, w, h } }
	}
	override onResize(shape: VueResumeShape, info: TLResizeInfo<VueResumeShape>) {
		return resizeBox(shape, info, { minWidth: VUE_RESUME_MIN_WIDTH, minHeight: getVueResumeMinHeight() })
	}
	override onResizeEnd(_initial: VueResumeShape, current: VueResumeShape) {
		normalizeVueResumeSections(this.editor, current.id, { fitToResumeHeight: true })
	}
	override onChildrenChange(shape: VueResumeShape) {
		normalizeVueResumeSections(this.editor, shape.id, { fitToResumeHeight: true })
	}
	override getIndicatorPath(shape: VueResumeShape): Path2D {
		const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path
	}
}

export class VueResumeSectionShapeUtil extends BaseBoxShapeUtil<VueResumeSectionShape> {
	static override type = 'vue-resume-section' as const
	static override props = { w: T.number, h: T.number, zone: T.literalEnum('pageHeader', 'content', 'pageFooter'), label: T.string }

	override getDefaultProps(): VueResumeSectionShape['props'] {
		const definition = VUE_RESUME_SECTION_DEFINITIONS[0]
		return { w: 560, h: definition.defaultHeight, zone: definition.zone, label: definition.label }
	}
	override component() { return null }
	override toSvg(shape: VueResumeSectionShape) { return createVueResumeSectionSvg(shape) }
	override getGeometry(shape: VueResumeSectionShape) {
		return new Group2d({ children: [new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })] })
	}
	override isFrameLike() { return true }
	override providesBackgroundForChildren() { return true }
	override canResizeChildren() { return false }
	override canResize() { return false }
	override hideResizeHandles() { return true }
	override hideRotateHandle() { return true }
	override hideSelectionBoundsBg() { return true }
	override hideSelectionBoundsFg() { return true }
	override canReceiveNewChildrenOfType(shape: VueResumeSectionShape, type: TLShape['type']) {
		return !shape.isLocked && getVueResumeSectionDefinition(shape.props.zone).receivesChildren && !isResumeInternalType(type)
	}
	override canRemoveChildrenOfType() { return false }
	override getClipPath(shape: VueResumeSectionShape) {
		return [new Vec(0, 0), new Vec(shape.props.w, 0), new Vec(shape.props.w, shape.props.h), new Vec(0, shape.props.h)]
	}
	override shouldClipChild() { return true }
	override onBeforeUpdate(_prev: VueResumeSectionShape, next: VueResumeSectionShape) {
		const parent = getVueResumeParent(this.editor, next)
		const definition = getVueResumeSectionDefinition(next.props.zone)
		const h = Math.max(definition.minHeight, next.props.h)
		const w = parent?.props.w ?? Math.max(VUE_RESUME_MIN_WIDTH, next.props.w)
		const x = parent ? 0 : next.x
		const label = definition.label
		if (Math.abs(x - next.x) < 0.01 && Math.abs(w - next.props.w) < 0.01 && Math.abs(h - next.props.h) < 0.01 && label === next.props.label) return
		return { ...next, x, props: { ...next.props, w, h, label } }
	}
	override getIndicatorPath(shape: VueResumeSectionShape): Path2D {
		const path = new Path2D(); path.rect(0, 0, shape.props.w, shape.props.h); return path
	}
}

export function createVueResumeShapePartials({ id, rect, sectionIds }: { id: TLShapeId; rect: { x: number; y: number; w: number; h: number }; sectionIds?: readonly TLShapeId[] }): TLShapePartial[] {
	const w = Math.max(VUE_RESUME_MIN_WIDTH, rect.w)
	const heights = fitHeights(Math.max(rect.h, getVueResumeMinHeight()), VUE_RESUME_SECTION_DEFINITIONS.map((definition) => definition.defaultHeight))
	let y = 0
	const resume: TLShapePartial<VueResumeShape> = { id, type: 'vue-resume', x: rect.x, y: rect.y, props: { w, h: heights.reduce((a, b) => a + b, 0), name: '简历分页组件' } }
	const sections = VUE_RESUME_SECTION_DEFINITIONS.map((definition, index) => {
		const section: TLShapePartial<VueResumeSectionShape> = { id: sectionIds?.[index] ?? createShapeId(), type: 'vue-resume-section', parentId: id, x: 0, y, props: { w, h: heights[index], zone: definition.zone, label: definition.label } }
		y += heights[index]
		return section
	})
	return [resume, ...sections]
}

export function getVueResumeSections(editor: Editor, resumeId: TLShapeId) {
	return editor.getSortedChildIdsForParent(resumeId).map((id) => editor.getShape<VueResumeSectionShape>(id)).filter(isVueResumeSectionShape).sort((a, b) => (SECTION_ORDER.get(a.props.zone) ?? 0) - (SECTION_ORDER.get(b.props.zone) ?? 0))
}

export function normalizeVueResumeSections(editor: Editor, resumeId: TLShapeId, options: { fitToResumeHeight?: boolean } = {}) {
	const resume = editor.getShape<VueResumeShape>(resumeId)
	if (!isVueResumeShape(resume)) return
	const sections = new Map(getVueResumeSections(editor, resumeId).map((section) => [section.props.zone, section]))
	const seed = VUE_RESUME_SECTION_DEFINITIONS.map((definition) => sections.get(definition.zone)?.props.h ?? definition.defaultHeight)
	const heights = fitHeights(options.fitToResumeHeight ? Math.max(resume.props.h, getVueResumeMinHeight()) : seed.reduce((a, b) => a + b, 0), seed)
	const changes: TLShapePartial[] = []
	let y = 0
	for (const [index, definition] of VUE_RESUME_SECTION_DEFINITIONS.entries()) {
		const section = sections.get(definition.zone)
		if (section) changes.push({ id: section.id, type: section.type, x: 0, y, props: { w: Math.max(VUE_RESUME_MIN_WIDTH, resume.props.w), h: heights[index], label: definition.label } })
		y += heights[index]
	}
	if (options.fitToResumeHeight && Math.abs(resume.props.h - y) > 0.01) changes.push({ id: resume.id, type: resume.type, props: { h: y } })
	if (changes.length) editor.updateShapes(changes)
}

export function getVueResumeSectionDefinition(zone: VueResumeSectionZone) { return DEFINITION_BY_ZONE.get(zone) ?? VUE_RESUME_SECTION_DEFINITIONS[0] }
export function isVueResumeShape(shape: TLShape | undefined): shape is VueResumeShape { return shape?.type === 'vue-resume' }
export function isVueResumeSectionShape(shape: TLShape | undefined): shape is VueResumeSectionShape { return shape?.type === 'vue-resume-section' }

function getVueResumeParent(editor: Editor, section: VueResumeSectionShape) {
	const parent = editor.getShape<VueResumeShape>(section.parentId)
	return isVueResumeShape(parent) ? parent : undefined
}
function isResumeInternalType(type: TLShape['type']) { return type === 'vue-resume' || type === 'vue-resume-section' || type === 'vue-frame' }
function getVueResumeDefaultHeight() { return VUE_RESUME_SECTION_DEFINITIONS.reduce((sum, definition) => sum + definition.defaultHeight, 0) }
function getVueResumeMinHeight() { return VUE_RESUME_SECTION_DEFINITIONS.reduce((sum, definition) => sum + definition.minHeight, 0) }
function fitHeights(total: number, seed: readonly number[]) {
	const mins = VUE_RESUME_SECTION_DEFINITIONS.map((definition) => definition.minHeight)
	const target = Math.max(total, mins.reduce((a, b) => a + b, 0))
	const base = seed.map((height, index) => Math.max(mins[index], height))
	const extra = base.reduce((sum, height, index) => sum + height - mins[index], 0)
	const targetExtra = target - mins.reduce((a, b) => a + b, 0)
	const result = mins.map((min, index) => min + (extra > 0 ? targetExtra * ((base[index] - min) / extra) : targetExtra / mins.length))
	result[result.length - 1] += target - result.reduce((a, b) => a + b, 0)
	return result
}
