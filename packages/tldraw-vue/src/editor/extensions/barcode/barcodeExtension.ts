import VueBarcodeShapeNode from '@/components/shapes/VueBarcodeShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import { vueBarcodeDefaultProps, vueBarcodeDefaultSize } from '../../defaults'
import { VueBarcodeShapeUtil, type VueBarcodeShape } from './vueBarcodeShape'

const barcodeCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-barcode',
	defaultSize: vueBarcodeDefaultSize,
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
					text: vueBarcodeDefaultProps.text,
					format: vueBarcodeDefaultProps.format,
					barColor: vueBarcodeDefaultProps.barColor,
					background: vueBarcodeDefaultProps.background,
					includeText: vueBarcodeDefaultProps.includeText,
					padding: vueBarcodeDefaultProps.padding,
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
