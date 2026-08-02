import type { Component } from 'vue'

const vueShapeComponentRegistry: Record<string, Component> = {}

export function registerVueShapeComponents(components: Readonly<Record<string, Component>>) {
	Object.assign(vueShapeComponentRegistry, components)
}

export function clearVueShapeComponents() {
	for (const type of Object.keys(vueShapeComponentRegistry)) {
		delete vueShapeComponentRegistry[type]
	}
}

export function getVueShapeComponent(type: string): Component | undefined {
	return vueShapeComponentRegistry[type]
}
