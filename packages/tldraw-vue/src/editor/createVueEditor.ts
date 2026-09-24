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
				editor.createShapes<VueTextShape>(
					[])
			},
			{ history: 'ignore' }
		)
		editor.clearHistory()
	}

	return editor
}
