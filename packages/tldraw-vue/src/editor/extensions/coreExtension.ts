import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
} from '@tldraw/editor'
import VueArrowShapeNode from '@/components/shapes/VueArrowShapeNode.vue'
import VueBoxShapeNode from '@/components/shapes/VueBoxShapeNode.vue'
import VueDrawShapeNode from '@/components/shapes/VueDrawShapeNode.vue'
import VueImageShapeNode from '@/components/shapes/VueImageShapeNode.vue'
import VueLineShapeNode from '@/components/shapes/VueLineShapeNode.vue'
import VueTextShapeNode from '@/components/shapes/VueTextShapeNode.vue'
import { VueArrowBindingUtil } from '../interactions/VueArrowBindingUtil'
import type { VueGeoShape } from '../interactions/types'
import type { VueEditorExtension, VueShapeCreateDefinition } from '../vueEditorExtensions'
import { VueBoxShapeUtil, type VueBoxShape } from '../vueBoxShape'
import {
	VueArrowShapeUtil,
	VueDrawShapeUtil,
	type VueImageShape,
	VueImageShapeUtil,
	type VueArrowShape,
	type VueLineShape,
	VueLineShapeUtil,
	type VueTextShape,
	VueTextShapeUtil,
} from '../vueDefaultShapes'

const textCanvasCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-text',
	defaultSize: { w: 180, h: 44 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueTextShape>([
			{
				id,
				type: 'vue-text',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					text: 'Text',
					color: editor.getStyleForNextShape(DefaultColorStyle),
					font: editor.getStyleForNextShape(DefaultFontStyle),
					size: editor.getStyleForNextShape(DefaultSizeStyle),
					autoSize: false,
				},
			},
		])
	},
}

const textToolbarCreate: VueShapeCreateDefinition = {
	...textCanvasCreate,
	onComplete({ editor, id }) {
		editor.markHistoryStoppingPoint('editing text')
		editor.select(id)
		editor.setEditingShape(id)
	},
}

const imageCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-image',
	defaultSize: { w: 180, h: 120 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueImageShape>([
			{
				id,
				type: 'vue-image',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					assetId: null,
					src: '',
					name: 'Image',
				},
			},
		])
	},
}

function createGeoCreate(geo: VueGeoShape): VueShapeCreateDefinition {
	return {
		shapeType: 'vue-box',
		defaultSize: { w: 120, h: 76 },
		createShape({ editor, id, rect }) {
			editor.createShapes<VueBoxShape>([
				{
					id,
					type: 'vue-box',
					x: rect.x,
					y: rect.y,
					props: {
						w: rect.w,
						h: rect.h,
						color: editor.getStyleForNextShape(DefaultColorStyle),
						fill: editor.getStyleForNextShape(DefaultFillStyle),
						dash: editor.getStyleForNextShape(DefaultDashStyle),
						size: editor.getStyleForNextShape(DefaultSizeStyle),
						geo,
					},
				},
			])
		},
	}
}

const noteCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-text',
	defaultSize: { w: 180, h: 72 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueTextShape>([
			{
				id,
				type: 'vue-text',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					text: 'Note',
					color: editor.getStyleForNextShape(DefaultColorStyle),
					font: editor.getStyleForNextShape(DefaultFontStyle),
					size: editor.getStyleForNextShape(DefaultSizeStyle),
					autoSize: false,
					showBorder: true,
				},
			},
		])
	},
}

const highlightCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-box',
	defaultSize: { w: 160, h: 48 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueBoxShape>([
			{
				id,
				type: 'vue-box',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					color: 'yellow',
					fill: 'semi',
					dash: 'solid',
					size: editor.getStyleForNextShape(DefaultSizeStyle),
					geo: 'rectangle',
				},
			},
		])
	},
}

const lineCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-line',
	defaultSize: { w: 160, h: 1 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueLineShape>([
			{
				id,
				type: 'vue-line',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: Math.max(1, rect.h),
					start: { x: 0, y: 0 },
					end: { x: rect.w, y: 0 },
					color: editor.getStyleForNextShape(DefaultColorStyle),
					dash: editor.getStyleForNextShape(DefaultDashStyle),
					size: editor.getStyleForNextShape(DefaultSizeStyle),
				},
			},
		])
	},
}

const arrowCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-arrow',
	defaultSize: { w: 160, h: 1 },
	createShape({ editor, id, rect }) {
		editor.createShapes<VueArrowShape>([
			{
				id,
				type: 'vue-arrow',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: Math.max(1, rect.h),
					start: { x: 0, y: 0 },
					end: { x: rect.w, y: 0 },
					color: editor.getStyleForNextShape(DefaultColorStyle),
					fill: editor.getStyleForNextShape(DefaultFillStyle),
					dash: editor.getStyleForNextShape(DefaultDashStyle),
					size: editor.getStyleForNextShape(DefaultSizeStyle),
				},
			},
		])
	},
}

const laserCreate: VueShapeCreateDefinition = {
	shapeType: 'vue-box',
	defaultSize: { w: 48, h: 48 },
	isAspectRatioLocked: true,
	createShape({ editor, id, rect }) {
		editor.createShapes<VueBoxShape>([
			{
				id,
				type: 'vue-box',
				x: rect.x,
				y: rect.y,
				props: {
					w: rect.w,
					h: rect.h,
					color: editor.getStyleForNextShape(DefaultColorStyle),
					fill: 'solid',
					dash: 'solid',
					size: editor.getStyleForNextShape(DefaultSizeStyle),
					geo: 'ellipse',
				},
			},
		])
	},
}

const geoTools = [
	['rectangle', 'Rectangle', 'R', 'geo-basic'],
	['ellipse', 'Ellipse', 'O', 'geo-basic'],
	['triangle', 'Triangle', undefined, 'geo-basic'],
	['diamond', 'Diamond', undefined, 'geo-basic'],
	['hexagon', 'Hexagon', undefined, 'geo-extra'],
	['oval', 'Oval', undefined, 'geo-extra'],
	['rhombus', 'Rhombus', undefined, 'geo-extra'],
	['star', 'Star', undefined, 'geo-extra'],
	['cloud', 'Cloud', undefined, 'geo-symbols'],
	['heart', 'Heart', undefined, 'geo-symbols'],
	['x-box', 'X box', undefined, 'geo-symbols'],
	['check-box', 'Check box', undefined, 'geo-symbols'],
	['arrow-left', 'Arrow left', undefined, 'geo-arrows'],
	['arrow-up', 'Arrow up', undefined, 'geo-arrows'],
	['arrow-down', 'Arrow down', undefined, 'geo-arrows'],
	['arrow-right', 'Arrow right', undefined, 'geo-arrows'],
] as const

export const coreExtension: VueEditorExtension = {
	id: 'core',
	shapeUtils: [
		VueBoxShapeUtil,
		VueTextShapeUtil,
		VueImageShapeUtil,
		VueLineShapeUtil,
		VueArrowShapeUtil,
		VueDrawShapeUtil,
	],
	bindingUtils: [VueArrowBindingUtil],
	shapeComponents: {
		'vue-arrow': VueArrowShapeNode,
		'vue-box': VueBoxShapeNode,
		'vue-draw': VueDrawShapeNode,
		'vue-image': VueImageShapeNode,
		'vue-line': VueLineShapeNode,
		'vue-text': VueTextShapeNode,
	},
	toolbarTools: [
		{
			id: 'select',
			label: 'Select',
			icon: 'select',
			shortcut: 'V',
			placement: 'primary',
			selection: { tool: 'select' },
		},
		{
			id: 'hand',
			label: 'Hand',
			icon: 'hand',
			shortcut: 'H',
			placement: 'primary',
			selection: { tool: 'hand' },
		},
		{
			id: 'draw',
			label: 'Draw',
			icon: 'draw',
			shortcut: 'D',
			placement: 'primary',
			selection: { tool: 'draw' },
		},
		{
			id: 'eraser',
			label: 'Eraser',
			icon: 'eraser',
			shortcut: 'E',
			placement: 'primary',
			selection: { tool: 'eraser' },
		},
		{
			id: 'arrow',
			label: 'Arrow',
			icon: 'arrow',
			shortcut: 'A',
			placement: 'primary',
			selection: { tool: 'arrow' },
		},
		{
			id: 'text',
			label: 'Text',
			icon: 'text',
			shortcut: 'T',
			placement: 'primary',
			selection: { tool: 'text' },
			canvasCreate: textCanvasCreate,
			toolbarCreate: textToolbarCreate,
		},
		{
			id: 'arrow-component',
			label: 'Arrow',
			icon: 'arrow',
			shortcut: 'A',
			placement: { area: 'more', group: 'insert' },
			selection: { tool: 'arrow' },
			toolbarCreate: arrowCreate,
		},
		{
			id: 'text-component',
			label: 'Text',
			icon: 'text',
			shortcut: 'T',
			placement: { area: 'more', group: 'insert' },
			selection: { tool: 'text' },
			canvasCreate: textCanvasCreate,
			toolbarCreate: textToolbarCreate,
		},
		{
			id: 'note',
			label: 'Note',
			icon: 'note',
			shortcut: 'N',
			placement: { area: 'more', group: 'insert' },
			selection: { tool: 'note' },
			canvasCreate: noteCreate,
			toolbarCreate: noteCreate,
		},
		{
			id: 'asset',
			label: 'Media',
			icon: 'asset',
			placement: { area: 'more', group: 'insert' },
			selection: { tool: 'asset' },
			canvasCreate: imageCreate,
			toolbarCreate: imageCreate,
		},
		{
			id: 'highlight',
			label: 'Highlight',
			icon: 'highlight',
			placement: { area: 'more', group: 'insert' },
			selection: { tool: 'highlight' },
			canvasCreate: highlightCreate,
			toolbarCreate: highlightCreate,
		},
		...geoTools.map(([id, label, shortcut, group]) => ({
			id,
			label,
			icon: id,
			shortcut,
			placement: { area: 'more' as const, group },
			selection: { tool: 'geo' as const, geoShape: id },
			toolbarCreate: createGeoCreate(id),
		})),
		{
			id: 'line',
			label: 'Line',
			icon: 'line',
			shortcut: 'L',
			placement: { area: 'more', group: 'utility' },
			selection: { tool: 'line' },
			canvasCreate: lineCreate,
			toolbarCreate: lineCreate,
		},
		{
			id: 'laser',
			label: 'Laser',
			icon: 'laser',
			shortcut: 'K',
			placement: { area: 'more', group: 'utility' },
			selection: { tool: 'laser' },
			canvasCreate: laserCreate,
			toolbarCreate: laserCreate,
		},
	],
}
