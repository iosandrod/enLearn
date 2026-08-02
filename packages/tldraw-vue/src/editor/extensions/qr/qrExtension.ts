import { DefaultColorStyle } from '@tldraw/editor'
import VueQrShapeNode from '@/components/shapes/VueQrShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import { VueQrShapeUtil, type VueQrShape } from './vueQrShape'

const qrCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-qr',
	defaultSize: { w: 180, h: 180 },
	isAspectRatioLocked: true,
	createShape({ editor, id, rect }) {
		editor.createShapes<VueQrShape>([
			{
				id,
				type: 'vue-qr',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					text: 'https://tldraw.dev',
					color: editor.getStyleForNextShape(DefaultColorStyle),
					background: '#ffffff',
					errorCorrectionLevel: 'M',
					margin: 4,
				},
			},
		])
	},
}

export const qrExtension: VueEditorExtension = {
	id: 'qr',
	shapeUtils: [VueQrShapeUtil],
	shapeComponents: {
		'vue-qr': VueQrShapeNode,
	},
	toolbarTools: [
		{
			id: 'qr',
			label: '二维码',
			icon: 'qr',
			glyph: '▩',
			placement: { area: 'more', group: 'utility' },
			selection: { tool: 'qr' },
			canvasCreate: qrCreate,
			toolbarCreate: qrCreate,
		},
	],
}
