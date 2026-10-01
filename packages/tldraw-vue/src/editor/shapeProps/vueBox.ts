import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	type TLDefaultColorStyle,
	type TLDefaultDashStyle,
	type TLDefaultFillStyle,
	type TLDefaultSizeStyle,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import type { VueGeoShape } from '../interactions/types'
import { extendShapeProperties } from './registry'
import { baseProps, type BaseProps } from './base'
import { colorOptions, dashOptions, fillOptions, geoOptions, sizeOptions } from './options'
import { vueBoxDefaultProps } from '../defaults'

function numberField(field: string, label: string, props: Record<string, unknown> = {}) {
	return { field, label, component: 'lc-number-input', props }
}

function selectField(field: string, label: string, options: typeof colorOptions) {
	return {
		field,
		label,
		component: 'vxe-select',
		options,
		props: { clearable: false },
	}
}

function normalizeNumber(
	value: unknown,
	currentValue: unknown,
	minimum: number,
	maximum: number,
	fallback: number
) {
	const current = Number(currentValue)
	const numeric = Number(value)
	const resolved = Number.isFinite(numeric)
		? numeric
		: Number.isFinite(current)
			? current
			: fallback
	return Math.min(maximum, Math.max(minimum, resolved))
}

function normalizeOption<T extends string>(
	value: unknown,
	currentValue: unknown,
	options: readonly { value: unknown }[],
	fallback: T
) {
	if (options.some((option) => option.value === value)) return value as T
	if (options.some((option) => option.value === currentValue)) return currentValue as T
	return fallback
}

const definitions = {
	geo: {
		validator: T.literalEnum(
			'rectangle',
			'ellipse',
			'triangle',
			'diamond',
			'hexagon',
			'oval',
			'rhombus',
			'star',
			'cloud',
			'heart',
			'x-box',
			'check-box',
			'arrow-left',
			'arrow-up',
			'arrow-down',
			'arrow-right'
		),
		defaultValue: vueBoxDefaultProps.geo,
		form: selectField('geo', '几何形状', geoOptions),
		normalize: (value: unknown, currentValue: unknown) =>
			normalizeOption(value, currentValue, geoOptions, 'rectangle') as VueGeoShape,
	},
	borderRadius: {
		validator: T.number,
		defaultValue: vueBoxDefaultProps.borderRadius,
		form: numberField('borderRadius', '圆角半径', { min: 0, max: 2048, step: 1 }),
		normalize: (value: unknown, currentValue: unknown) =>
			normalizeNumber(value, currentValue, 0, 2048, 8),
	},
	color: {
		validator: DefaultColorStyle,
		defaultValue: vueBoxDefaultProps.color,
		form: selectField('color', '颜色', colorOptions),
		normalize: (value: unknown, currentValue: unknown) =>
			normalizeOption(value, currentValue, colorOptions, 'blue'),
	},
	dash: {
		validator: DefaultDashStyle,
		defaultValue: vueBoxDefaultProps.dash,
		form: selectField('dash', '线条', dashOptions),
		normalize: (value: unknown, currentValue: unknown) =>
			normalizeOption(value, currentValue, dashOptions, 'draw'),
	},
	size: {
		validator: DefaultSizeStyle,
		defaultValue: vueBoxDefaultProps.size,
		form: selectField('size', '尺寸', sizeOptions),
		normalize: (value: unknown, currentValue: unknown) =>
			normalizeOption(value, currentValue, sizeOptions, 'm'),
	},
	fill: {
		validator: DefaultFillStyle,
		defaultValue: vueBoxDefaultProps.fill,
		form: selectField('fill', '填充', fillOptions),
		normalize: (value: unknown, currentValue: unknown) =>
			normalizeOption(value, currentValue, fillOptions, 'semi'),
	},
} as const

export const vueBoxPropertyRegistry = extendShapeProperties(baseProps, definitions)
export type VueBoxProps = BaseProps & {
	geo: VueGeoShape
	borderRadius: number
	color: TLDefaultColorStyle
	dash: TLDefaultDashStyle
	size: TLDefaultSizeStyle
	fill: TLDefaultFillStyle
}

const Versions = createShapePropsMigrationIds('vue-box', {
	AddBorderRadius: 1,
})

export const vueBoxShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: Versions.AddBorderRadius,
			up: (props) => {
				props.borderRadius = vueBoxPropertyRegistry.defaults.borderRadius
			},
			down: (props) => {
				delete props.borderRadius
			},
		},
	],
})
