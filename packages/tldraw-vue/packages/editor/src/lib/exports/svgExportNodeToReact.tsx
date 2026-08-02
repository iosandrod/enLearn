import { createElement, Fragment, type ReactNode } from 'react'
import {
	isSvgExportNode,
	type SvgExportChild,
	type SvgExportElementNode,
	type SvgExportFragmentNode,
} from '../editor/types/SvgExportNode'

export function svgExportNodeToReact(node: SvgExportChild | ReactNode): ReactNode {
	if (Array.isArray(node)) {
		return node.map((child, index) => (
			<Fragment key={index}>{svgExportNodeToReact(child)}</Fragment>
		))
	}

	if (!isSvgExportNode(node)) return node as ReactNode

	if (node.kind === 'svg-export-fragment') {
		return svgExportFragmentToReact(node)
	}

	return svgExportElementToReact(node)
}

function svgExportFragmentToReact(node: SvgExportFragmentNode) {
	return (
		<Fragment key={node.key}>
			{node.children.map((child, index) => (
				<Fragment key={index}>{svgExportNodeToReact(child)}</Fragment>
			))}
		</Fragment>
	)
}

function svgExportElementToReact(node: SvgExportElementNode) {
	return createElement(
		node.tag,
		{
			...node.props,
			key: node.key,
		},
		...node.children.map((child) => svgExportNodeToReact(child))
	)
}
