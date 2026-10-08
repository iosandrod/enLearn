import type { TLShape, TLShapePartial } from '@tldraw/editor'
import { geoOptions } from '../editor/shapeProps/options.ts'
import { resolveObjectExpressions, resolveTemplateString } from './expression.ts'
import {
	applyPrintNodeExpressionResult,
	evaluatePrintNodeExpression,
} from './nodeExpression.ts'
import type { PrintExpressionConfig, PrintExpressionContext } from './types'

export interface PrintShapePreviewStrategy {
	supports(shape: TLShape): boolean
	resolve(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig): TLShapePartial | null
}

abstract class ShapePreviewStrategy implements PrintShapePreviewStrategy {
	abstract supports(shape: TLShape): boolean

	resolve(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		if (!this.supports(shape)) return null
		const resolvedProps = this.resolveProps(shape, context, config)
		if (!resolvedProps) return null

		const nodeExpressionResult = evaluatePrintNodeExpression(shape, context)
		const props = nodeExpressionResult === undefined
			? resolvedProps
			: applyPrintNodeExpressionResult(resolvedProps as Record<string, unknown>, nodeExpressionResult)
		return !areJsonEqual(props, shape.props) ? createPropsUpdate(shape, props as TLShape['props']) : null
	}

	protected abstract resolveProps(
		shape: TLShape,
		context: PrintExpressionContext,
		config?: PrintExpressionConfig,
	): TLShape['props'] | null
}

class TextNodePreviewStrategy extends ShapePreviewStrategy {
	private readonly types = new Set(['text', 'vue-text'])

	supports(shape: TLShape) {
		return this.types.has(shape.type)
	}

	protected resolveProps(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		const props = shape.props as Record<string, unknown>
		if (typeof props.text !== 'string') return null
		return { ...props, text: resolveTemplateString(props.text, context, config) }
	}
}

class TextPayloadNodePreviewStrategy extends ShapePreviewStrategy {
	private readonly types = new Set(['vue-barcode', 'vue-qr'])

	supports(shape: TLShape) {
		return this.types.has(shape.type)
	}

	protected resolveProps(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		const props = shape.props as Record<string, unknown>
		if (typeof props.text !== 'string') return null
		return { ...props, text: resolveTemplateString(props.text, context, config) }
	}
}

class RichTextNodePreviewStrategy extends ShapePreviewStrategy {
	supports(shape: TLShape) { return shape.type === 'vue-rich-text' }
	protected resolveProps(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		const props = shape.props as Record<string, unknown>
		if (typeof props.content !== 'string') return null
		return { ...props, content: resolveTemplateString(props.content, context, config) }
	}
}

class GeometryNodePreviewStrategy extends ShapePreviewStrategy {
	supports(shape: TLShape) {
		return shape.type === 'vue-box'
	}

	protected resolveProps(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		const props = resolveObjectExpressions(shape.props, context, config) as Record<string, unknown>
		const originalGeo = (shape.props as Record<string, unknown>).geo
		if (typeof originalGeo === 'string' && originalGeo.includes('{{')) {
			const resolvedGeo = props.geo
			if (typeof resolvedGeo !== 'string' || !VUE_GEO_SHAPES.has(resolvedGeo)) {
				throw new Error(`几何节点表达式返回了无效图形“${String(resolvedGeo ?? '')}”`)
			}
		}
		const expressionText = (shape.props as Record<string, unknown>).text
		if (typeof expressionText !== 'string' || !expressionText.includes('{{')) return props

		const resolvedGeo = props.text
		if (typeof resolvedGeo !== 'string' || !VUE_GEO_SHAPES.has(resolvedGeo)) return props
		const nextProps: Record<string, unknown> = { ...props, geo: resolvedGeo }
		delete nextProps.text
		return nextProps
	}
}

class DedicatedLayoutPreviewStrategy extends ShapePreviewStrategy {
	private readonly types = new Set([
		'vue-material',
		'vue-material-section',
		'vue-resume',
		'vue-resume-section',
	])

	supports(shape: TLShape) {
		return this.types.has(shape.type)
	}

	protected resolveProps() {
		return null
	}
}

class GenericShapePreviewStrategy extends ShapePreviewStrategy {
	supports() {
		return true
	}

	protected resolveProps(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		return resolveObjectExpressions(shape.props, context, config)
	}
}

export class PrintShapePreviewResolver {
	private readonly strategies: readonly ShapePreviewStrategy[] = [
		new TextNodePreviewStrategy(),
		new RichTextNodePreviewStrategy(),
		new TextPayloadNodePreviewStrategy(),
		new GeometryNodePreviewStrategy(),
		new DedicatedLayoutPreviewStrategy(),
		new GenericShapePreviewStrategy(),
	]

	resolve(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		const strategy = this.strategies.find((candidate) => candidate.supports(shape))
		return strategy?.resolve(shape, context, config) ?? null
	}
}

const VUE_GEO_SHAPES = new Set(geoOptions.map(({ value }) => value))

function areJsonEqual(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right)
}

function createPropsUpdate(shape: TLShape, props: TLShape['props']): TLShapePartial {
	return { id: shape.id, type: shape.type, props } as TLShapePartial
}
