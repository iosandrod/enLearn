import {
	DefaultColorStyle,
	DefaultFontStyle,
	DefaultSizeStyle,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
} from '@tldraw/tlschema'
import { T } from '@tldraw/validate'
import { baseProps, type BaseProps } from './base'
import { extendShapeProperties } from './registry'
import { vueTextDefaultProps } from '../defaults/vueText'

export type VueTextProps = BaseProps & {
	text: string
	color: typeof vueTextDefaultProps.color
	font: typeof vueTextDefaultProps.font
	size: typeof vueTextDefaultProps.size
	justifyContent: VueTextJustifyContent
	alignItems: VueTextAlignItems
	autoSize?: boolean
	showBorder?: boolean
}

export type VueTextJustifyContent = 'start' | 'center' | 'end'
export type VueTextAlignItems = 'start' | 'center' | 'end'

export const vueTextPropertyRegistry = extendShapeProperties(baseProps, {
	text: T.string,
	color: DefaultColorStyle,
	font: DefaultFontStyle,
	size: DefaultSizeStyle,
	justifyContent: {
		validator: T.literalEnum('start', 'center', 'end'),
		defaultValue: vueTextDefaultProps.justifyContent,
	},
	alignItems: {
		validator: T.literalEnum('start', 'center', 'end'),
		defaultValue: vueTextDefaultProps.alignItems,
	},
	autoSize: T.boolean.optional(),
	showBorder: T.boolean.optional(),
})

const Versions = createShapePropsMigrationIds('vue-text', {
	AddTextLayout: 1,
	NormalizeTextLayoutKeys: 2,
})

export const vueTextShapeMigrations = createShapePropsMigrationSequence({
	sequence: [
		{
			id: Versions.AddTextLayout,
			up: (props) => {
				props.justifyContent ??= vueTextPropertyRegistry.defaults.justifyContent
				props.alignItems ??= vueTextPropertyRegistry.defaults.alignItems
			},
			down: (props) => {
				delete props.justifyContent
				delete props.alignItems
			},
		},
		{
			id: Versions.NormalizeTextLayoutKeys,
			up: (props) => {
				const legacyJustifyContent = props['justify-content']
				const legacyAlignItems = props['align-items']
				if (legacyJustifyContent !== undefined) {
					props.justifyContent = normalizeTextLayoutValue(legacyJustifyContent)
				}
				if (legacyAlignItems !== undefined) {
					props.alignItems = normalizeTextLayoutValue(legacyAlignItems)
				}
				props.justifyContent = normalizeTextLayoutValue(props.justifyContent)
				props.alignItems = normalizeTextLayoutValue(props.alignItems)
				delete props['justify-content']
				delete props['align-items']
				props.justifyContent ??= vueTextPropertyRegistry.defaults.justifyContent
				props.alignItems ??= vueTextPropertyRegistry.defaults.alignItems
			},
			down: (props) => {
				delete props['justify-content']
				delete props['align-items']
				delete props.justifyContent
				delete props.alignItems
			},
		},
	],
})

function normalizeTextLayoutValue(value: unknown): VueTextJustifyContent {
	if (value === 'center') return 'center'
	return value === 'end' || value === 'flex-end' ? 'end' : 'start'
}
