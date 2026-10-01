import { T } from '@tldraw/validate'
import { defineShapeProperties } from './registry'
import type { LowCodeField } from '@enlearn/lowcode-framework/types/lowcode'

function numberField(field: string, label: string, props: Record<string, unknown>): LowCodeField {
	return { field, label, component: 'lc-number-input', props }
}

const baseDefinitions = {
	w: {
		validator: T.number,
		defaultValue: 160,
		form: numberField('w', '宽度', { min: 1, step: 1 }),
	},
	h: {
		validator: T.number,
		defaultValue: 96,
		form: numberField('h', '高度', { min: 1, step: 1 }),
	},
} as const

/** Properties present on every custom canvas node. Node registries extend this set. */
export const baseProps = defineShapeProperties(baseDefinitions)
export type BaseProps = {
	w: number
	h: number
}
