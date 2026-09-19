import VueBarcodeShapeNode from '@/components/shapes/VueBarcodeShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import { VueBarcodeShapeUtil, type VueBarcodeShape } from './vueBarcodeShape'

const barcodeCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-barcode',
	defaultSize: { w: 240, h: 96 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueBarcodeShape>([
			{
				id,
				type: 'vue-barcode',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					text: '1234567890',
					format: 'code128',
					barColor: '#000000',
					background: '#ffffff',
					includeText: true,
					padding: 4,
				},
			},
		])
	},
}

export const barcodeExtension: VueEditorExtension = {
	id: 'barcode',
	shapeUtils: [VueBarcodeShapeUtil],
	shapeComponents: {
		'vue-barcode': VueBarcodeShapeNode,
	},
	toolbarTools: [
		{
			id: 'barcode',
			label: '条形码',
			icon: 'barcode',
			glyph: '▥',
			placement: { area: 'more', group: 'utility' },
			selection: { tool: 'barcode' },
			canvasCreate: barcodeCreate,
			toolbarCreate: barcodeCreate,
		},
	],
}
