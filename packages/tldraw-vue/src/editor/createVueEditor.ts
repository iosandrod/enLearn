import { Editor, createShapeId, createTLStore } from '@tldraw/editor'
import type { VueTextShape } from './vueDefaultShapes'
import { VueSelectTool } from './interactions/VueSelectTool'
import { createVueImageAssetFromFile } from './interactions/VueAssetManager'
import { getDefaultVueEditorExtensions } from './extensions/defaultExtensions'
import {
	createVueEditorExtensionRegistry,
	type VueEditorExtension,
} from './vueEditorExtensions'
import { registerVueShapeComponents } from '@/components/shapes/shapeComponentRegistry'

export interface CreateVueEditorOptions {
	createDefaultShapes?: boolean
	extensions?: readonly VueEditorExtension[]
}

export function createVueEditor(container: HTMLElement, options: CreateVueEditorOptions = {}) {
	const extensions = options.extensions ?? getDefaultVueEditorExtensions()
	const registry = createVueEditorExtensionRegistry(extensions)
	registerVueShapeComponents(registry.shapeComponents)

	const store = createTLStore({
		shapeUtils: registry.shapeUtils,
		bindingUtils: registry.bindingUtils,
	})

	const editor = new Editor({
		store,
		shapeUtils: registry.shapeUtils,
		bindingUtils: registry.bindingUtils,
		assetUtils: [],
		overlayUtils: [],
		tools: [VueSelectTool],
		getContainer: () => container,
		initialState: 'select',
		autoFocus: false,
	})

	editor.user.updateUserPreferences({ isSnapMode: true })
	editor.updateViewportScreenBounds(container, true)
	editor.registerExternalAssetHandler('file', async ({ file, assetId }) => {
		return createVueImageAssetFromFile(file, assetId)
	})

	if (options.createDefaultShapes !== false && editor.getCurrentPageShapesSorted().length === 0) {
		editor.run(
			() => {
				editor.createShapes<VueTextShape>([
					{
						id: createShapeId('print-title'),
						type: 'vue-text',
						x: 112,
						y: 64,
						props: {
							w: 320,
							h: 44,
							text: '连续打印标签',
							color: 'black',
							font: 'sans',
							size: 'l',
							autoSize: false,
						},
					},
					{
						id: createShapeId('print-name'),
						type: 'vue-text',
						x: 116,
						y: 132,
						props: {
							w: 300,
							h: 40,
							text: '姓名：{{name}}',
							color: 'black',
							font: 'sans',
							size: 'm',
							autoSize: false,
						},
					},
					{
						id: createShapeId('print-code'),
						type: 'vue-text',
						x: 116,
						y: 184,
						props: {
							w: 300,
							h: 40,
							text: '编号：{{code}}',
							color: 'black',
							font: 'sans',
							size: 'm',
							autoSize: false,
						},
					},
					{
						id: createShapeId('print-phone'),
						type: 'vue-text',
						x: 116,
						y: 236,
						props: {
							w: 300,
							h: 40,
							text: '电话：{{phone}}',
							color: 'black',
							font: 'sans',
							size: 'm',
							autoSize: false,
						},
					},
					{
						id: createShapeId('print-address'),
						type: 'vue-text',
						x: 116,
						y: 288,
						props: {
							w: 420,
							h: 46,
							text: '地址：{{address}}',
							color: 'black',
							font: 'sans',
							size: 'm',
							autoSize: false,
						},
					},
					{
						id: createShapeId('print-page-no'),
						type: 'vue-text',
						x: 116,
						y: 352,
						props: {
							w: 240,
							h: 38,
							text: '页码：{{pageNo}} / {{total}}',
							color: 'grey',
							font: 'sans',
							size: 's',
							autoSize: false,
						},
					},
				])
			},
			{ history: 'ignore' }
		)
		editor.clearHistory()
	}

	return editor
}
