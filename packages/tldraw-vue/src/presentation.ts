import type { Editor, TLPageId, TLShape } from '@tldraw/editor'

export type DesignerMode = 'print' | 'presentation'

export type PresentationAnimationPreset =
	| 'none'
	| 'fade'
	| 'fly-left'
	| 'fly-right'
	| 'fly-up'
	| 'fly-down'
	| 'zoom'

export type PresentationAnimationStart = 'auto' | 'onClick'

export interface PresentationAnimation {
	preset: PresentationAnimationPreset
	duration: number
	delay: number
	easing: string
	start: PresentationAnimationStart
	order: number
}

export interface PresentationPageTransition {
	type: 'none' | 'fade' | 'slide'
	duration: number
	easing: string
}

export interface PresentationPageConfig {
	title?: string
	background?: string
	transition?: PresentationPageTransition
}

export interface PresentationConfig {
	pageSizeMm?: { w: number; h: number }
	pages?: Record<string, PresentationPageConfig>
	defaultTransition?: PresentationPageTransition
	defaultAnimation?: Omit<PresentationAnimation, 'preset' | 'order'>
}

export type PresentationShapeMeta = {
	presentationAnimation?: PresentationAnimation
}

export const DEFAULT_PRESENTATION_CONFIG: PresentationConfig = {
	pageSizeMm: { w: 338.7, h: 190.5 },
	defaultTransition: { type: 'fade', duration: 350, easing: 'ease-out' },
	defaultAnimation: {
		duration: 500,
		delay: 0,
		easing: 'ease-out',
		start: 'auto',
	},
}

export function getPresentationShapeAnimation(shape: TLShape): PresentationAnimation | undefined {
	const meta = shape.meta as PresentationShapeMeta | undefined
	return meta?.presentationAnimation?.preset && meta.presentationAnimation.preset !== 'none'
		? normalizePresentationAnimation(meta.presentationAnimation)
		: undefined
}

export function normalizePresentationAnimation(value: Partial<PresentationAnimation>): PresentationAnimation {
	return {
		preset: value.preset === 'none' ? 'none' : value.preset ?? 'fade',
		duration: clampNumber(value.duration, 80, 10000, 500),
		delay: clampNumber(value.delay, 0, 10000, 0),
		easing: typeof value.easing === 'string' && value.easing ? value.easing : 'ease-out',
		start: value.start === 'onClick' ? 'onClick' : 'auto',
		order: clampNumber(value.order, 1, 999, 1),
	}
}

export function clonePresentationConfig(value: PresentationConfig | undefined): PresentationConfig {
	return JSON.parse(JSON.stringify(value ?? DEFAULT_PRESENTATION_CONFIG)) as PresentationConfig
}

export class PresentationAnimationController {
	private readonly animations = new Map<string, Animation>()

	constructor(private readonly editor: Editor) {}

	async playCurrentPage(options: { includeClickAnimations?: boolean } = {}) {
		const shapes = this.editor.getCurrentPageShapesSorted()
		return this.playShapes(shapes, options)
	}

	async playPage(pageId: TLPageId, options: { includeClickAnimations?: boolean } = {}) {
		this.editor.setCurrentPage(pageId)
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		return this.playCurrentPage(options)
	}

	resetCurrentPage() {
		this.cancel()
		for (const shape of this.editor.getCurrentPageShapesSorted()) {
			const animation = getPresentationShapeAnimation(shape)
			const element = getShapeElement(shape.id)
			if (!animation || !element) continue
			const initial = getInitialKeyframe(animation.preset)
			element.style.opacity = String(initial.opacity ?? 1)
			element.style.translate = String(initial.translate ?? 'none')
			element.style.scale = String(initial.scale ?? '1')
		}
	}

	restoreCurrentPageVisuals() {
		this.cancel()
		for (const shape of this.editor.getCurrentPageShapesSorted()) {
			const element = getShapeElement(shape.id)
			if (!element) continue
			element.style.opacity = ''
			element.style.translate = ''
			element.style.scale = ''
		}
	}

	cancel() {
		for (const animation of this.animations.values()) animation.cancel()
		this.animations.clear()
	}

	private async playShapes(shapes: readonly TLShape[], options: { includeClickAnimations?: boolean }) {
		this.resetCurrentPage()
		const groups = new Map<number, Array<{ shape: TLShape; animation: PresentationAnimation }>>()
		for (const shape of shapes) {
			const animation = getPresentationShapeAnimation(shape)
			if (!animation || (animation.start === 'onClick' && !options.includeClickAnimations)) continue
			const group = groups.get(animation.order) ?? []
			group.push({ shape, animation })
			groups.set(animation.order, group)
		}

		for (const group of [...groups.entries()].sort(([left], [right]) => left - right)) {
			await Promise.all(group[1].map(({ shape, animation }) => this.playShape(shape, animation)))
		}
	}

	private playShape(shape: TLShape, animation: PresentationAnimation) {
		const element = getShapeElement(shape.id)
		if (!element) return Promise.resolve()
		const player = element.animate(
			[getInitialKeyframe(animation.preset), getFinalKeyframe()],
			{
				duration: animation.duration,
				delay: animation.delay,
				easing: animation.easing,
				fill: 'forwards',
			}
		)
		this.animations.set(shape.id, player)
		return player.finished.catch(() => undefined).then(() => {
			this.animations.delete(shape.id)
		})
	}
}

function getShapeElement(shapeId: string) {
	return document.querySelector<HTMLElement>(`[data-shape-id="${CSS.escape(shapeId)}"]`)
}

function getInitialKeyframe(preset: PresentationAnimationPreset): Keyframe {
	switch (preset) {
		case 'fly-left': return { opacity: 0, translate: '-32px 0' }
		case 'fly-right': return { opacity: 0, translate: '32px 0' }
		case 'fly-up': return { opacity: 0, translate: '0 -32px' }
		case 'fly-down': return { opacity: 0, translate: '0 32px' }
		case 'zoom': return { opacity: 0, scale: '0.82' }
		default: return { opacity: 0 }
	}
}

function getFinalKeyframe(): Keyframe {
	return { opacity: 1, translate: 'none', scale: '1' }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
	const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback
	return Math.max(min, Math.min(max, Math.round(number)))
}
