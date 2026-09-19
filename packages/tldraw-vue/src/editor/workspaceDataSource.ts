import type { Editor } from '@tldraw/editor'
import { shallowRef, type ShallowRef } from 'vue'
import type { PrintDataSourceConfig } from '@/print/types'

const editorPrintDataSources = new WeakMap<
	Editor,
	ShallowRef<PrintDataSourceConfig | undefined>
>()

export function getEditorPrintDataSource(editor: Editor) {
	let source = editorPrintDataSources.get(editor)
	if (!source) {
		source = shallowRef<PrintDataSourceConfig | undefined>({ type: 'none' })
		editorPrintDataSources.set(editor, source)
	}
	return source
}
