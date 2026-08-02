import VueTableShapeNode from '@/components/shapes/VueTableShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import {
	VueTableShapeUtil,
	createDefaultVueTableProps,
	type VueTableShape,
} from './vueTableShape'

const tableCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-table',
	defaultSize: { w: 480, h: 260 },
	createShape({ editor, id, rect }) {
		const defaultProps = createDefaultVueTableProps()
		editor.createShapes<VueTableShape>([
			{
				id,
				type: 'vue-table',
				x: rect.x,
				y: rect.y,
				props: {
					...defaultProps,
					w: rect.w,
					h: rect.h,
				},
			},
		])
	},
}

export const tableExtension: VueEditorExtension = {
	id: 'table',
	shapeUtils: [VueTableShapeUtil],
	shapeComponents: {
		'vue-table': VueTableShapeNode,
	},
	toolbarTools: [
		{
			id: 'table',
			label: '表格',
			icon: 'table',
			glyph: '▦',
			shortcut: 'B',
			placement: { area: 'more', group: 'utility' },
			selection: { tool: 'table' },
			canvasCreate: tableCreate,
			toolbarCreate: tableCreate,
		},
	],
}
