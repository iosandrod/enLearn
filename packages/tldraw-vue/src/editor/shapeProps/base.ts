import { T } from '@tldraw/validate'
import { defineShapeProperties } from './registry'
import type { LowCodeField } from '@enlearn/lowcode-framework/types/lowcode'

function numberField(field: string, label: string, props: Record<string, unknown>): LowCodeField {
	return { field, label, component: 'lc-number-input', props }
}

function selectField(field: string, label: string, options: LowCodeField['options']): LowCodeField {
	return {
		field,
		label,
		component: 'vxe-select',
		options,
		props: { clearable: false },
	}
}

const alignmentOptions = [
	{ label: '居左/居上', value: 'start' },
	{ label: '居中', value: 'center' },
	{ label: '居右/居下', value: 'end' },
]

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
		form: selectField('justifyContent', '水平对齐', alignmentOptions),
	},
	alignItems: {
		validator: T.literalEnum('start', 'center', 'end'),
		defaultValue: 'start',
		form: selectField('alignItems', '垂直对齐', alignmentOptions),
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
	},
	fontSize: {
		validator: T.number,
		defaultValue: 14,
		form: numberField('fontSize', '字体大小', { min: 1, step: 1 }),
	},
	borderLeft:{
		validator:T.optional(T.boolean),
		default:false
	},
	borderRight:{
		validator:T.optional(T.boolean),
		default:false
	},
	borderTop:{
		validator:T.optional(T.boolean),
		default:false
	},
	borderBottom:{
		validator:T.optional(T.boolean),
		default:false
	}
} as const

/** Properties present on every custom canvas node. Node registries extend this set. */
export const baseProps = defineShapeProperties(baseDefinitions)
export type BaseProps = {
	w: number
	h: number
	justifyContent: 'start' | 'center' | 'end'
	alignItems: 'start' | 'center' | 'end'
	paddingLeft: number
	paddingRight: number
	paddingTop: number
	paddingBottom: number
	fontSize: number
	borderLeft?: boolean
	borderRight?: boolean
	borderTop?: boolean
	borderBottom?: boolean
}
