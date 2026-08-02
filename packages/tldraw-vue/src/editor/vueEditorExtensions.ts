import type {
	Editor,
	TLBindingUtilConstructor,
	TLShape,
	TLShapeId,
	TLShapeUtilConstructor,
	Vec,
} from '@tldraw/editor'
import type { Component } from 'vue'
import type { CanvasTool, VueGeoShape } from './interactions/types'

type VueShapeUtilConstructor = TLShapeUtilConstructor<any, any>
type VueBindingUtilConstructor = TLBindingUtilConstructor<any, any>

export type VueToolbarPlacement =
	| 'primary'
	| {
			area: 'more'
			group: string
	  }

export interface VueToolbarSelection {
	tool: CanvasTool
	geoShape?: VueGeoShape
}

export interface VueShapeCreateContext {
	editor: Editor
	id: TLShapeId
	point: Vec
	rect: {
		x: number
		y: number
		w: number
		h: number
	}
	source: 'canvas' | 'toolbar'
}

export interface VueShapeCreateCompleteContext extends VueShapeCreateContext {
	shape: TLShape
}

export interface VueShapeCreateDefinition {
	shapeType: string
	defaultSize: {
		w: number
		h: number
	}
	isAspectRatioLocked?: boolean
	createShape(context: VueShapeCreateContext): void
	updateShape?(context: VueShapeCreateContext): void
	onComplete?(context: VueShapeCreateCompleteContext): void
}

export interface VueToolbarToolDefinition {
	id: string
	label: string
	icon: string
	glyph?: string
	shortcut?: string
	disabled?: boolean
	placement: VueToolbarPlacement
	selection?: VueToolbarSelection
	canvasCreate?: VueShapeCreateDefinition
	toolbarCreate?: VueShapeCreateDefinition
}

export interface VueEditorExtension {
	id: string
	shapeUtils?: readonly VueShapeUtilConstructor[]
	bindingUtils?: readonly VueBindingUtilConstructor[]
	shapeComponents?: Readonly<Record<string, Component>>
	toolbarTools?: readonly VueToolbarToolDefinition[]
}

export interface VueEditorExtensionRegistry {
	shapeUtils: VueShapeUtilConstructor[]
	bindingUtils: VueBindingUtilConstructor[]
	shapeComponents: Record<string, Component>
	toolbarTools: VueToolbarToolDefinition[]
}

export function createVueEditorExtensionRegistry(
	extensions: readonly VueEditorExtension[]
): VueEditorExtensionRegistry {
	const shapeComponents: Record<string, Component> = {}

	return {
		shapeUtils: extensions.flatMap((extension) => [...(extension.shapeUtils ?? [])]),
		bindingUtils: extensions.flatMap((extension) => [...(extension.bindingUtils ?? [])]),
		shapeComponents: extensions.reduce((registry, extension) => {
			Object.assign(registry, extension.shapeComponents)
			return registry
		}, shapeComponents),
		toolbarTools: extensions.flatMap((extension) => [...(extension.toolbarTools ?? [])]),
	}
}

export function isPrimaryToolbarPlacement(placement: VueToolbarPlacement) {
	return placement === 'primary'
}

export function getToolbarPlacementGroup(placement: VueToolbarPlacement) {
	return placement === 'primary' ? null : placement.group
}
