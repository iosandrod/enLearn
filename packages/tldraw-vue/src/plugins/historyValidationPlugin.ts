import { defineVueEditorPlugin } from '@/editor/vuePlugins'

export const historyValidationPlugin = defineVueEditorPlugin({
	id: 'validation.history',
	commands: [
		{
			id: 'history.undo',
			label: 'Undo',
			isEnabled: ({ editor }) => editor.getCanUndo(),
			run: ({ editor }) => {
				editor.undo()
			},
		},
		{
			id: 'history.redo',
			label: 'Redo',
			isEnabled: ({ editor }) => editor.getCanRedo(),
			run: ({ editor }) => {
				editor.redo()
			},
		},
	],
	shortcuts: [
		{
			command: 'history.undo',
			key: 'z',
			accel: true,
			priority: 100,
		},
		{
			command: 'history.redo',
			key: 'z',
			accel: true,
			shift: true,
			priority: 100,
		},
		{
			command: 'history.redo',
			key: 'y',
			accel: true,
			priority: 100,
		},
	],
})
