import assert from 'node:assert/strict'
import { createServer, loadConfigFromFile } from 'vite'

const { config } = await loadConfigFromFile({ command: 'serve', mode: 'test' })
// Let Node load dependencies natively in SSR; retain the app's source aliases.
config.resolve.alias = config.resolve.alias.filter((alias) => !alias.replacement.replaceAll('\\', '/').includes('/node_modules/'))
const server = await createServer({
	...config,
	configFile: false,
	server: { middlewareMode: true, watch: null, hmr: false },
	appType: 'custom',
	optimizeDeps: { noDiscovery: true, include: [] },
})
try {
	const { openRichTextEditor, editRichTextShape } = await server.ssrLoadModule('/src/editor/richTextEditorDialog.ts')
	const { VueEditorController } = await server.ssrLoadModule('/src/editor/interactions/VueEditorController.ts')
	const { globalDialogInstances, createGlobalDialogContext, closeGlobalDialog } = await server.ssrLoadModule(
		'@enlearn/lowcode-framework/runtime/global-dialog',
	)
	const lastDialog = () => globalDialogInstances.at(-1)
	const changeDraft = (content) => {
		const dialog = lastDialog()
		const vnode = dialog.config.body(createGlobalDialogContext(dialog))
		vnode.props['onUpdate:modelValue'](content)
	}
	const confirm = async () => {
		const dialog = lastDialog()
		await dialog.config.onConfirm(createGlobalDialogContext(dialog))
		await closeGlobalDialog(dialog.id, { action: 'confirm' })
	}

	let confirmed
	const generic = openRichTextEditor({ content: '<p>原文</p>', onConfirm: (content) => { confirmed = content } })
	changeDraft('<p><strong>新内容</strong></p>')
	assert.equal(confirmed, undefined, 'Draft edits must not commit early.')
	await confirm()
	assert.equal((await generic).values.content, '<p><strong>新内容</strong></p>')
	assert.equal(confirmed, '<p><strong>新内容</strong></p>')

	const shapeId = 'shape:rich-text'
	const shapes = new Map([
		[shapeId, { id: shapeId, type: 'vue-rich-text', isLocked: false, props: { content: '<p>原文</p>' } }],
		['shape:other', { id: 'shape:other', type: 'vue-rich-text', props: { content: '<p>其他节点</p>' } }],
	])
	const updates = []
	const history = []
	let readonly = false
	const editor = {
		getShape: (id) => shapes.get(id),
		getSelectedShapes: () => selectedShapes,
		getIsReadonly: () => readonly,
		select: (id) => { editor.selected = id },
		markHistoryStoppingPoint: (label) => history.push(label),
		updateShape: (update) => {
			updates.push(update)
			Object.assign(shapes.get(update.id).props, update.props)
		},
	}
	let selectedShapes = [shapes.get(shapeId)]
	const editingShapes = []
	editor.setEditingShape = (id) => editingShapes.push(id)
	const controller = Object.create(VueEditorController.prototype)
	controller.options = { editor }
	controller.updateViewport = () => {}
	controller.getPagePoint = () => ({ x: 0, y: 0 })
	let hitShape = shapes.get(shapeId)
	controller.findShapeAt = () => hitShape
	const doubleClickEvent = () => ({
		target: { closest: () => null },
		preventDefault() { this.defaultPrevented = true },
		stopPropagation() { this.propagationStopped = true },
	})

	assert.equal(controller.editSelectedTextShape(), true, 'The selection overlay must open rich text editing.')
	assert.equal(globalDialogInstances.length, 1)
	changeDraft('<p>通过选中框保存</p>')
	await confirm()
	assert.equal(shapes.get(shapeId).props.content, '<p>通过选中框保存</p>')
	assert.equal(updates.at(-1).id, shapeId)

	const canvasEvent = doubleClickEvent()
	controller.doubleClick(canvasEvent)
	assert.equal(globalDialogInstances.length, 1, 'Canvas double-click must open rich text editing.')
	assert.equal(canvasEvent.defaultPrevented, true)
	assert.equal(canvasEvent.propagationStopped, true)
	changeDraft('<p>通过画布取消</p>')
	await closeGlobalDialog(lastDialog().id, { action: 'cancel' })
	assert.equal(shapes.get(shapeId).props.content, '<p>通过选中框保存</p>')
	assert.equal(editingShapes.length, 0, 'Rich text must use the global dialog, not inline editing.')

	selectedShapes = [...shapes.values()]
	assert.equal(controller.editSelectedTextShape(), false, 'Multiple selections must not open an editor.')
	assert.equal(globalDialogInstances.length, 0)
	selectedShapes = [shapes.get(shapeId)]
	readonly = true
	assert.equal(controller.editSelectedTextShape(), false)
	controller.doubleClick(doubleClickEvent())
	assert.equal(globalDialogInstances.length, 0)
	readonly = false
	shapes.get(shapeId).isLocked = true
	assert.equal(controller.editSelectedTextShape(), false)
	controller.doubleClick(doubleClickEvent())
	assert.equal(globalDialogInstances.length, 0)
	shapes.get(shapeId).isLocked = false

	const textShape = { id: 'shape:text', type: 'vue-text' }
	selectedShapes = [textShape]
	assert.equal(controller.editSelectedTextShape(), true)
	hitShape = textShape
	controller.doubleClick(doubleClickEvent())
	assert.deepEqual(editingShapes, [textShape.id, textShape.id], 'Ordinary text must retain inline editing.')
	assert.equal(globalDialogInstances.length, 0)

	// Restore the baseline for the global API checks below.
	shapes.get(shapeId).props.content = '<p>原文</p>'
	updates.length = 0
	history.length = 0

	const cancelled = editRichTextShape(editor, shapeId)
	assert.equal(editRichTextShape(editor, shapeId), cancelled, 'Repeated edit requests must share one dialog.')
	assert.equal(globalDialogInstances.length, 1)
	changeDraft('<p>取消的草稿</p>')
	await closeGlobalDialog(lastDialog().id, { action: 'cancel' })
	await cancelled
	assert.equal(shapes.get(shapeId).props.content, '<p>原文</p>')
	assert.equal(updates.length, 0)

	const saved = editRichTextShape(editor, shapeId)
	assert.equal(lastDialog().model.content, '<p>原文</p>', 'Reopening must discard the cancelled draft.')
	changeDraft('<p>保存的内容</p>')
	editor.select('shape:other')
	await confirm()
	await saved
	assert.equal(updates.length, 1)
	assert.equal(updates[0].id, shapeId, 'Save must target the original shape, not the new selection.')
	assert.equal(shapes.get('shape:other').props.content, '<p>其他节点</p>')
	assert.equal(history.length, 1)

	const unchanged = editRichTextShape(editor, shapeId)
	await confirm()
	await unchanged
	assert.equal(updates.length, 1, 'Saving unchanged content must not add an undo entry.')

	readonly = true
	assert.equal(editRichTextShape(editor, shapeId), undefined)
	readonly = false
	shapes.get(shapeId).isLocked = true
	assert.equal(editRichTextShape(editor, shapeId), undefined)
	shapes.get(shapeId).isLocked = false

	const removed = editRichTextShape(editor, shapeId)
	changeDraft('<p>节点已删除</p>')
	shapes.delete(shapeId)
	await confirm()
	await removed
	assert.equal(updates.length, 1, 'A removed node must not be recreated by the dialog.')
	assert.equal(globalDialogInstances.length, 0)
	console.log('Verified canvas and selection double-click routes, ordinary text editing, global rich text API, draft isolation, save targeting, duplicate requests, and edit guards.')
} finally {
	await server.close()
}

// Vite's SSR module runner keeps file watchers alive after the assertions finish.
process.exit(0)
