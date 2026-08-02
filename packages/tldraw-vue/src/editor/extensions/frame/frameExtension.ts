import VueFrameShapeNode from '@/components/shapes/VueFrameShapeNode.vue'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../../vueEditorExtensions'
import {
	VueFrameShapeUtil,
	getEnclosedVueFrameShapeIds,
	type VueFrameShape,
} from './vueFrameShape'

const frameCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-frame',
	defaultSize: { w: 320, h: 180 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueFrameShape>([
			{
				id,
				type: 'vue-frame',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					name: 'Frame',
				},
			},
		])
	},
	onComplete({ editor, shape }) {
		const enclosedShapeIds = getEnclosedVueFrameShapeIds(editor, shape)
		if (enclosedShapeIds.length > 0) {
			editor.reparentShapes(enclosedShapeIds, shape.id)
		}
	},
}

export const frameExtension: VueEditorExtension = {
	id: 'frame',
	shapeUtils: [VueFrameShapeUtil],
	shapeComponents: {
		'vue-frame': VueFrameShapeNode,
	},
	toolbarTools: [
		{
			id: 'frame',
			label: 'Frame',
			icon: 'frame',
			shortcut: 'F',
			placement: { area: 'more', group: 'frame' },
			selection: { tool: 'frame' },
			canvasCreate: frameCreate,
			toolbarCreate: frameCreate,
		},
	],
}
