import {
	DefaultColorStyle,
	DefaultDashStyle,
	DefaultFillStyle,
	DefaultSizeStyle,
	type Editor,
	type SharedStyle,
	type StyleProp,
	type StylePropValue,
} from '@tldraw/editor'
import type {
	TLDefaultColorStyle,
	TLDefaultDashStyle,
	TLDefaultFillStyle,
	TLDefaultSizeStyle,
} from '@tldraw/tlschema'

export interface VueStylePanelSnapshot {
	color?: SharedStyle<TLDefaultColorStyle>
	fill?: SharedStyle<TLDefaultFillStyle>
	dash?: SharedStyle<TLDefaultDashStyle>
	size?: SharedStyle<TLDefaultSizeStyle>
	opacity: SharedStyle<number>
	hasSelection: boolean
}

export class StylePanelController {
	constructor(private readonly editor: Editor) {}

	getSnapshot(): VueStylePanelSnapshot {
		return {
			color: this.getSharedStyle(DefaultColorStyle),
			fill: this.getSharedStyle(DefaultFillStyle),
			dash: this.getSharedStyle(DefaultDashStyle),
			size: this.getSharedStyle(DefaultSizeStyle),
			opacity: this.editor.getSharedOpacity(),
			hasSelection: this.editor.getSelectedShapeIds().length > 0,
		}
	}

	onHistoryMark(id: string) {
		this.editor.markHistoryStoppingPoint(id)
	}

	onValueChange<S extends StyleProp<any>>(
		style: S,
		value: StylePropValue<S>,
		event?: MouseEvent | PointerEvent
	) {
		const hasSelection = this.editor.getSelectedShapeIds().length > 0
		const skipNextShapeStyle = hasSelection && Boolean(event?.ctrlKey || event?.metaKey)

		this.editor.run(() => {
			if (this.editor.isIn('select')) {
				this.editor.setStyleForSelectedShapes(style, value)
			}
			if (!skipNextShapeStyle) {
				this.editor.setStyleForNextShapes(style, value)
			}
			this.editor.updateInstanceState({ isChangingStyle: true })
		})
	}

	onOpacityChange(opacity: number, event?: MouseEvent | PointerEvent) {
		const hasSelection = this.editor.getSelectedShapeIds().length > 0
		const skipNextShapeStyle = hasSelection && Boolean(event?.ctrlKey || event?.metaKey)

		this.editor.run(() => {
			if (this.editor.isIn('select')) {
				this.editor.setOpacityForSelectedShapes(opacity)
			}
			if (!skipNextShapeStyle) {
				this.editor.setOpacityForNextShapes(opacity)
			}
			this.editor.updateInstanceState({ isChangingStyle: true })
		})
	}

	private getSharedStyle<S extends StyleProp<any>>(style: S): SharedStyle<StylePropValue<S>> | undefined {
		const shared = this.editor.getSharedStyles().get(style)
		if (shared) return shared

		if (this.editor.getSelectedShapeIds().length > 0) {
			return undefined
		}

		return {
			type: 'shared',
			value: this.editor.getStyleForNextShape(style) as StylePropValue<S>,
		}
	}
}
