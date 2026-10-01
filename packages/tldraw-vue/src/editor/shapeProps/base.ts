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
	justifyContent: {
		validator: T.literalEnum('start', 'center', 'end'),
		defaultValue: 'start',
	},
	alignItems: {
		validator: T.literalEnum('start', 'center', 'end'),
		defaultValue: 'start',
	},
	paddingLeft: {
		validator: T.number,
		defaultValue: 0,
		form: numberField('paddingLeft', '左内边距', { min: 0, step: 1 }),
	},
	paddingRight: {
		validator: T.number,
		defaultValue: 0,
		form: numberField('paddingRight', '右内边距', { min: 0, step: 1 }),
	},
	paddingTop: {
		validator: T.number,
		defaultValue: 0,
		form: numberField('paddingTop', '上内边距', { min: 0, step: 1 }),
	},
	paddingBottom: {
		validator: T.number,
		defaultValue: 0,
		form: numberField('paddingBottom', '下内边距', { min: 0, step: 1 }),
	},//
	fontSize: {
		validator: T.number,
		defaultValue: 14,
		form: numberField('fontSize', '字体大小', { min: 1, step: 1 }),
	}
} as const

/** Properties present on every custom canvas node. Node registries extend this set. */
export const baseProps = defineShapeProperties(baseDefinitions)
export type BaseProps = {
	w: number
	h: number
}
