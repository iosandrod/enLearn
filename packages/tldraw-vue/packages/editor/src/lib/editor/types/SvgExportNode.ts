export const SVG_EXPORT_FRAGMENT = Symbol.for('@tldraw/svg-export-fragment')

export type SvgExportPrimitive = string | number | boolean | null | undefined

export type SvgExportStyle = Record<string, string | number | null | undefined>

export interface SvgExportProps {
	key?: string | number | null
	style?: string | SvgExportStyle | null
	[name: string]: SvgExportPrimitive | SvgExportStyle
}

export type SvgExportChild =
	| SvgExportPrimitive
	| SvgExportElementNode
	| SvgExportFragmentNode
	| readonly SvgExportChild[]

export interface SvgExportElementNode {
	readonly kind: 'svg-export-element'
	readonly tag: string
	readonly key?: string | number
	readonly props: SvgExportProps
	readonly children: readonly SvgExportChild[]
}

export interface SvgExportFragmentNode {
	readonly kind: 'svg-export-fragment'
	readonly key?: string | number
	readonly children: readonly SvgExportChild[]
}

export type SvgExportNode = SvgExportElementNode | SvgExportFragmentNode

export function svgExportElement(
	tag: string | typeof SVG_EXPORT_FRAGMENT,
	props: SvgExportProps | null,
	...children: SvgExportChild[]
): SvgExportNode {
	const key = props?.key ?? undefined

	if (tag === SVG_EXPORT_FRAGMENT) {
		return {
			kind: 'svg-export-fragment',
			key,
			children,
		}
	}

	const { key: _key, ...elementProps } = props ?? {}
	return {
		kind: 'svg-export-element',
		tag,
		key,
		props: elementProps,
		children,
	}
}

export function svgExportFragment(...children: SvgExportChild[]): SvgExportFragmentNode {
	return {
		kind: 'svg-export-fragment',
		children,
	}
}

export function isSvgExportNode(value: unknown): value is SvgExportNode {
	return (
		typeof value === 'object' &&
		value !== null &&
		((value as { kind?: unknown }).kind === 'svg-export-element' ||
			(value as { kind?: unknown }).kind === 'svg-export-fragment')
	)
}
