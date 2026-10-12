import { createShapeId, type Editor, type TLShapeId, type TLShapePartial, type VecLike } from '@tldraw/editor'
import { vueTextDefaultProps } from '../defaults/vueText'
import type { VueTextShape } from '../vueDefaultShapes'
import type { VueRichTextShape } from '../vueRichTextShape'
import type { WorkspaceBoundsManager } from './WorkspaceBoundsManager'
import { measureVueTextShape } from './vueTextSizing'

/** Dropping on a node updates it; only empty paper creates a text node. */
export function dropPrintDataSourceField(
	editor: Editor,
	path: string,
	point: VecLike,
	workspaceBounds: WorkspaceBoundsManager,
): TLShapeId | null {
	if (editor.getIsReadonly() || !path.trim() || !workspaceBounds.containsPoint(point)) return null
	const reference = `{{${path}}}`
	const target = editor.getShapeAtPoint(point, { hitInside: true, hitLabels: true, hitLocked: true })
	if (target) {
		if (editor.isShapeOrAncestorLocked(target)) return null
		if (target.type === 'vue-rich-text') {
			const content = (target as VueRichTextShape).props.content
			// Rich text stores HTML in content rather than a text property.
			const escaped = reference.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			const nextContent = /<\/p>\s*$/i.test(content)
				? content.replace(/<\/p>(\s*)$/i, `${escaped}</p>$1`)
				: `${content}<p>${escaped}</p>`
			editor.markHistoryStoppingPoint('insert data source field')
			editor.updateShape<VueRichTextShape>({ id: target.id, type: 'vue-rich-text', props: { content: nextContent } })
		} else if ('text' in target.props && typeof target.props.text === 'string') {
			const text = `${target.props.text}${reference}`
			const size = target.type === 'vue-text'
				? measureVueTextShape(editor, text, {
					font: (target as VueTextShape).props.font,
					size: (target as VueTextShape).props.size,
					fontSize: (target as VueTextShape).props.fontSize,
					width: (target as VueTextShape).props.w,
					autoSize: (target as VueTextShape).props.autoSize,
					paddingLeft: (target as VueTextShape).props.paddingLeft,
					paddingRight: (target as VueTextShape).props.paddingRight,
					paddingTop: (target as VueTextShape).props.paddingTop,
					paddingBottom: (target as VueTextShape).props.paddingBottom,
				})
				: {}
			editor.markHistoryStoppingPoint('insert data source field')
			editor.updateShape({ id: target.id, type: target.type, props: { text, ...size } } as TLShapePartial)
		} else {
			return null
		}
		editor.select(target.id)
		return target.id
	}
	const id = createShapeId()
	const rect = workspaceBounds.clampRect({ x: point.x, y: point.y, w: 180, h: 44 })
	editor.markHistoryStoppingPoint('create data source text')
	editor.createShape<VueTextShape>({
		id, type: 'vue-text', x: rect.x, y: rect.y,
		props: { ...vueTextDefaultProps, w: rect.w, h: rect.h, autoSize: false, text: reference },
	})
	editor.select(id)
	return id
}
