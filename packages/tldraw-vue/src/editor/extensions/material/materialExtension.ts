import { createShapeId, type Editor, type TLShape, type TLShapeId, type TLShapePartial } from '@tldraw/editor'
import VueMaterialSectionShapeNode from '@/components/shapes/VueMaterialSectionShapeNode.vue'
import VueMaterialShapeNode from '@/components/shapes/VueMaterialShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import {
	VUE_MATERIAL_SECTION_DEFINITIONS,
	VueMaterialSectionShapeUtil,
	VueMaterialShapeUtil,
	createVueMaterialShapePartials,
	getVueMaterialSections,
	normalizeVueMaterialSections,
	reparentShapesIntoVueMaterialSections,
	updateVueMaterialShapeLayout,
} from './vueMaterialShape'

const FOOTER_SAMPLE_TEXT_META_KEY = 'vueMaterialFooterSampleText'
const FOOTER_SAMPLE_TEXT = 'text（节点案例）'
const FOOTER_SAMPLE_TEXT_HEIGHT = 24

const materialCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-material',
	defaultSize: { w: 500, h: 500 },
	createShape({ editor, id, rect }) {
		const sectionIds = VUE_MATERIAL_SECTION_DEFINITIONS.map(() => createShapeId())
		const tableFooterIndex = VUE_MATERIAL_SECTION_DEFINITIONS.findIndex(
			(definition) => definition.zone === 'tableFooter'
		)
		const footerSectionId = sectionIds[tableFooterIndex]
		const shapes: TLShapePartial[] = createVueMaterialShapePartials({
			id,
			rect,
			sectionIds,
		})

		if (footerSectionId) {
			shapes.push(createFooterSampleTextShape(footerSectionId, rect.w))
		}

		editor.createShapes(shapes)
	},
	updateShape({ editor, id, rect }) {
		updateVueMaterialShapeLayout(editor, id, rect)
		updateFooterSampleText(editor, id)
	},
	onComplete({ editor, shape }) {
		normalizeVueMaterialSections(editor, shape.id, { fitToMaterialHeight: true })
		updateFooterSampleText(editor, shape.id)
		reparentShapesIntoVueMaterialSections(editor, shape.id)
	},
}

function createFooterSampleTextShape(parentId: TLShapeId, width: number): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'vue-text',
		parentId,
		x: 0,
		y: 0,
		props: {
			w: Math.max(80, width),
			h: FOOTER_SAMPLE_TEXT_HEIGHT,
			text: FOOTER_SAMPLE_TEXT,
			color: 'black',
			font: 'draw',
			size: 's',
			autoSize: false,
		},
		meta: {
			[FOOTER_SAMPLE_TEXT_META_KEY]: true,
		},
	} as TLShapePartial
}

function updateFooterSampleText(editor: Editor, materialId: TLShapeId) {
	const tableFooter = getVueMaterialSections(editor, materialId).find(
		(section) => section.props.zone === 'tableFooter'
	)
	if (!tableFooter) return

	const sampleText = getFooterSampleText(editor, tableFooter.id)
	if (!sampleText) {
		editor.createShape(createFooterSampleTextShape(tableFooter.id, tableFooter.props.w))
		return
	}

	editor.updateShape({
		id: sampleText.id,
		type: sampleText.type,
		x: 0,
		y: 0,
		props: {
			w: Math.max(80, tableFooter.props.w),
			h: FOOTER_SAMPLE_TEXT_HEIGHT,
			text: FOOTER_SAMPLE_TEXT,
		},
	} as TLShapePartial)
}

function getFooterSampleText(editor: Editor, tableFooterId: TLShapeId): TLShape | undefined {
	return editor
		.getSortedChildIdsForParent(tableFooterId)
		.map((childId) => editor.getShape(childId))
		.find(
			(shape) =>
				shape?.type === 'vue-text' && shape.meta?.[FOOTER_SAMPLE_TEXT_META_KEY] === true
		)
}

export const materialExtension: VueEditorExtension = {
	id: 'material',
	shapeUtils: [VueMaterialShapeUtil, VueMaterialSectionShapeUtil],
	shapeComponents: {
		'vue-material': VueMaterialShapeNode,
		'vue-material-section': VueMaterialSectionShapeNode,
	},
	toolbarTools: [
		{
			id: 'material',
			label: '物料表格',
			icon: 'material',
			glyph: '▦',
			shortcut: 'M',
			placement: { area: 'more', group: 'frame' },
			selection: { tool: 'material' },
			canvasCreate: materialCreate,
			toolbarCreate: materialCreate,
		},
	],
}
