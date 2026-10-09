import { defineAsyncComponent, h } from 'vue'
import type { Editor, TLShapeId } from '@tldraw/editor'
import {
	openGlobalDialog,
	type GlobalDialogResult,
} from '@enlearn/lowcode-framework/runtime/global-dialog'
import type { VueRichTextShape } from './vueRichTextShape'

const RichTextEditor = defineAsyncComponent(() => import('../components/VueRichTextEditor.vue'))
type RichTextEditorModel = { content: string }

export type RichTextEditorOptions = {
	content: string
	title?: string
	onConfirm?: (content: string) => void | Promise<void>
}

/** Open WangEditor in the shared global dialog host, with an isolated draft. */
export function openRichTextEditor(options: RichTextEditorOptions) {
	return openGlobalDialog<RichTextEditorModel>({
		title: options.title ?? '编辑富文本',
		width: 'min(860px, calc(100vw - 32px))',
		height: 'min(620px, calc(100vh - 32px))',
		className: 'rich-text-editor-modal',
		model: { content: options.content },
		body: ({ model, updateModel }) => h(RichTextEditor, {
			modelValue: model.content,
			'onUpdate:modelValue': (content: string) => updateModel({ content }),
		}),
		actions: [
			{ code: 'cancel', label: '取消', role: 'cancel' },
			{ code: 'confirm', label: '保存', role: 'confirm', status: 'primary' },
		],
		onConfirm: ({ model }) => options.onConfirm?.(model.content),
	})
}

const activeShapeDialogs = new WeakMap<Editor, Map<TLShapeId, Promise<GlobalDialogResult<RichTextEditorModel>>>>()

/** Keep the saved content attached to the original node even if selection changes. */
export function editRichTextShape(editor: Editor, shapeId: TLShapeId) {
	const shape = editor.getShape(shapeId)
	if (!shape || shape.type !== 'vue-rich-text' || shape.isLocked || editor.getIsReadonly()) return
	let dialogs = activeShapeDialogs.get(editor)
	if (!dialogs) {
		dialogs = new Map()
		activeShapeDialogs.set(editor, dialogs)
	}
	const existing = dialogs.get(shapeId)
	if (existing) return existing

	editor.select(shapeId)
	const dialog = openRichTextEditor({
		content: shape.props.content,
		onConfirm(content) {
			const current = editor.getShape(shapeId)
			if (!current || current.type !== 'vue-rich-text' || current.isLocked || editor.getIsReadonly()) return
			if (current.props.content === content) return
			editor.markHistoryStoppingPoint('editing rich text')
			editor.updateShape<VueRichTextShape>({ id: shapeId, type: 'vue-rich-text', props: { content } })
		},
	}).finally(() => dialogs.delete(shapeId))
	dialogs.set(shapeId, dialog)
	return dialog
}
