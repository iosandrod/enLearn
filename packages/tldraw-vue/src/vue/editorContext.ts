import type { Editor } from '@tldraw/editor'
import { inject, type InjectionKey } from 'vue'

export const editorKey = Symbol('editor') as InjectionKey<Editor>

export function useEditor() {
	const editor = inject(editorKey)
	if (!editor) {
		throw new Error('Editor was not provided')
	}
	return editor
}
