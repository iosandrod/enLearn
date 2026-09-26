import type { TLShape, TLShapePartial } from '@tldraw/editor'
import { resolveObjectExpressions, resolveTemplateString } from './expression'
import type { PrintExpressionConfig, PrintExpressionContext } from './types'

export interface PrintShapePreviewStrategy {
	supports(shape: TLShape): boolean
	resolve(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig): TLShapePartial | null
}

abstract class ShapePreviewStrategy implements PrintShapePreviewStrategy {
	abstract supports(shape: TLShape): boolean

	resolve(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		if (!this.supports(shape)) return null
		const props = this.resolveProps(shape, context, config)
		return props && !areJsonEqual(props, shape.props) ? createPropsUpdate(shape, props) : null
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
		 let obj1= { ...props, text: resolveTemplateString(props.text, context, config) }
		//  debugger//
		 return obj1
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
		new TextPayloadNodePreviewStrategy(),
		new DedicatedLayoutPreviewStrategy(),
		new GenericShapePreviewStrategy(),
	]

	resolve(shape: TLShape, context: PrintExpressionContext, config?: PrintExpressionConfig) {
		const strategy = this.strategies.find((candidate) => candidate.supports(shape))
		return strategy?.resolve(shape, context, config) ?? null
	}
}

function areJsonEqual(left: unknown, right: unknown) {
	return JSON.stringify(left) === JSON.stringify(right)
}

function createPropsUpdate(shape: TLShape, props: TLShape['props']): TLShapePartial {
	return { id: shape.id, type: shape.type, props } as TLShapePartial
}
