import {
	getToolbarPlacementGroup,
	isPrimaryToolbarPlacement,
	type VueToolbarSelection,
	type VueToolbarToolDefinition,
} from '../vueEditorExtensions'
import type { CanvasTool, VueGeoShape } from './types'

export type ToolbarIconName = string
export type ToolbarItemId = string

export interface ToolbarItemSnapshot {
	id: ToolbarItemId
	label: string
	shortcut?: string
	icon: ToolbarIconName
	glyph?: string
	disabled: boolean
	draggable: boolean
	selected: boolean
	selection?: VueToolbarSelection
}

export class ToolbarController {
	constructor(private readonly tools: readonly VueToolbarToolDefinition[]) {}

	getPrimaryItems(activeTool: CanvasTool, currentGeoShape: VueGeoShape): ToolbarItemSnapshot[] {
		return this.tools
			.filter((tool) => isPrimaryToolbarPlacement(tool.placement))
			.map((tool) => this.createItem(tool, activeTool, currentGeoShape))
	}

	getMoreGroups(activeTool: CanvasTool, currentGeoShape: VueGeoShape): ToolbarItemSnapshot[][] {
		const groups = new Map<string, ToolbarItemSnapshot[]>()

		for (const tool of this.tools) {
			const group = getToolbarPlacementGroup(tool.placement)
			if (!group) continue
			const items = groups.get(group) ?? []
			items.push(this.createItem(tool, activeTool, currentGeoShape))
			groups.set(group, items)
		}

		return [...groups.values()]
	}

	getMoreButton(): ToolbarItemSnapshot {
		return {
			id: 'chevron-up',
			label: 'More tools',
			icon: 'chevron-up',
			disabled: false,
			draggable: false,
			selected: false,
		}
	}

	private createItem(
		definition: VueToolbarToolDefinition,
		activeTool: CanvasTool,
		currentGeoShape: VueGeoShape
	): ToolbarItemSnapshot {
		const selection = definition.selection
		const selected = selection
			? selection.geoShape
				? activeTool === selection.tool && currentGeoShape === selection.geoShape
				: activeTool === selection.tool
			: false

		return {
			id: definition.id,
			label: definition.label,
			shortcut: definition.shortcut,
			icon: definition.icon,
			glyph: definition.glyph,
			disabled: definition.disabled ?? false,
			draggable: definition.toolbarCreate !== undefined,
			selected,
			selection,
		}
	}
}
